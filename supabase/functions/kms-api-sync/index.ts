// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: kms-api-sync
//
// Substitui o kms-webhook (nunca implantado). Roda via pg_cron (a cada hora,
// alinhado ao cache de 1h documentado pela API) e faz PULL em vez de push:
//   1. POST /api/Login com KMS_API_EMAIL/KMS_API_PASSWORD → accessToken
//   2. Pagina GET /api/v1/acompanhamento-professores (~1.800 professores,
//      ~200/página) até acabar o cursor
//   3. Por página: upsert em LOTE (não um-a-um — com ~1.800 professores,
//      fazer 5 chamadas sequenciais ao banco por professor estoura o limite
//      de recursos da Edge Function) em professores (por kms_id) +
//      professor_acompanhamento + professor_score_historico +
//      professor_alunos_kms
//
// Importante: a API não retorna e-mail do professor. NÃO seta
// coordenador_id/grupo_id a partir do campo `coordenador` da API — a
// distribuição continua sendo feita pelo nosso algoritmo
// (atribuir_grupo_professor / distribuir_professores_inicial).
//
// Secrets necessários:
//   KMS_API_BASE_URL, KMS_API_EMAIL, KMS_API_PASSWORD
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (já existentes no projeto)
//   CRON_SECRET (opcional — se configurado, exige Authorization: Bearer <CRON_SECRET>)
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface AlunoKms {
  aluno_id: number
  primeiro_nome: string
  data_adicao: string | null
  status_vinculo: string | null
}

interface ScoreKms {
  atual: number | null
  faixa: string | null
  elegivel_alocacao: boolean | null
  historico_mensal?: { ano_mes: number; score: number }[]
  avaliacao_alunos?: Record<string, unknown>
}

interface ReuniaoMonitoramentoKms {
  status: string | null
  ultima: string | null
  proxima: string | null
  coordenador?: string | null
}

interface AlertasKms {
  aulas_pendentes?: { quantidade: number; data_mais_antiga: string | null }
  faltas_professor?: { quantidade: number; datas: string[] }
  no_show_primeira_aula?: { quantidade: number; datas: string[] }
  agendas_bloqueadas?: { quantidade_horarios: number; motivos: unknown[] }
  trocas_professor?: unknown[]
}

interface TurnoverKms {
  data_entrada: string | null
  entrou_no_periodo: boolean | null
  saida: unknown
}

interface ProfessorKms {
  professor_id: number
  nome: string
  data_entrada: string | null
  status: string
  coordenador?: string | null
  alunos?: AlunoKms[]
  turnover?: TurnoverKms
  score?: ScoreKms
  reuniao_monitoramento?: ReuniaoMonitoramentoKms
  alertas?: AlertasKms
}

interface AcompanhamentoResponse {
  data: ProfessorKms[]
  proximo_cursor: string | null
  limit: number
}

function mapStatus(status: string): 'ativo' | 'pausa' | 'desligado' {
  const s = status.toLowerCase()
  if (s === 'desligado') return 'desligado'
  if (s === 'pausado' || s === 'pausa') return 'pausa'
  return 'ativo'
}

async function login(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, rememberMe: false }),
  })
  if (!res.ok) throw new Error(`Login falhou (${res.status})`)
  const json = await res.json()
  const token = json?.object?.accessToken ?? json?.message
  if (!token) throw new Error('Login não retornou accessToken')
  return token
}

async function fetchPagina(
  baseUrl: string,
  token: string,
  cursor: string | null,
): Promise<AcompanhamentoResponse> {
  const params = new URLSearchParams({ limit: '200' })
  if (cursor) params.set('cursor', cursor)

  const res = await fetch(`${baseUrl}/api/v1/acompanhamento-professores?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Falha ao buscar página (${res.status})`)
  return res.json()
}

serve(async (req) => {
  const auth       = req.headers.get('Authorization') ?? ''
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return new Response('Não autorizado.', { status: 401 })
  }

  const baseUrl  = Deno.env.get('KMS_API_BASE_URL')!
  const email    = Deno.env.get('KMS_API_EMAIL')!
  const password = Deno.env.get('KMS_API_PASSWORD')!

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let recebidos = 0
  let criados = 0
  let atualizados = 0
  let paginas = 0
  const erros: { pagina: number; erro: string }[] = []

  try {
    const token = await login(baseUrl, email, password)
    let cursor: string | null = null

    do {
      paginas++
      try {
        const pagina: AcompanhamentoResponse = await fetchPagina(baseUrl, token, cursor)
        recebidos += pagina.data.length

        const kmsIds = pagina.data.map(p => String(p.professor_id))

        // Quais já existem (pra contabilizar criados vs atualizados).
        const { data: existentes, error: existErr } = await admin
          .from('professores')
          .select('kms_id')
          .in('kms_id', kmsIds)
        if (existErr) throw new Error(existErr.message)
        const jaExistiam = new Set((existentes ?? []).map(e => e.kms_id))

        // 1 — Upsert em lote de identidade.
        const professoresPayload = pagina.data.map(p => ({
          kms_id: String(p.professor_id),
          nome: p.nome,
          data_inicio: p.data_entrada,
          status: mapStatus(p.status),
        }))
        const { data: upserted, error: upsertErr } = await admin
          .from('professores')
          .upsert(professoresPayload, { onConflict: 'kms_id' })
          .select('id, kms_id')
        if (upsertErr) throw new Error(upsertErr.message)

        const idByKmsId = new Map((upserted ?? []).map(r => [r.kms_id as string, r.id as string]))
        for (const kmsId of kmsIds) {
          if (jaExistiam.has(kmsId)) atualizados++
          else criados++
        }

        // 2 — Upsert em lote do snapshot de acompanhamento.
        const acompanhamentoPayload = pagina.data
          .map(p => {
            const professorId = idByKmsId.get(String(p.professor_id))
            if (!professorId) return null
            const alertas = p.alertas ?? {}
            return {
              professor_id: professorId,
              score_atual: p.score?.atual ?? null,
              score_faixa: p.score?.faixa ?? null,
              elegivel_alocacao: p.score?.elegivel_alocacao ?? null,
              avaliacao_alunos: p.score?.avaliacao_alunos ?? null,
              reuniao_status: p.reuniao_monitoramento?.status ?? null,
              reuniao_ultima: p.reuniao_monitoramento?.ultima ?? null,
              reuniao_proxima: p.reuniao_monitoramento?.proxima ?? null,
              aulas_pendentes_qtd: alertas.aulas_pendentes?.quantidade ?? 0,
              aulas_pendentes_data_mais_antiga: alertas.aulas_pendentes?.data_mais_antiga ?? null,
              faltas_professor: alertas.faltas_professor ?? null,
              no_show_primeira_aula: alertas.no_show_primeira_aula ?? null,
              agendas_bloqueadas: alertas.agendas_bloqueadas ?? null,
              trocas_professor: alertas.trocas_professor ?? null,
              turnover_entrou_no_periodo: p.turnover?.entrou_no_periodo ?? null,
              turnover_saida: p.turnover?.saida ?? null,
              api_atualizado_em: new Date().toISOString(),
            }
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)

        if (acompanhamentoPayload.length) {
          const { error } = await admin
            .from('professor_acompanhamento')
            .upsert(acompanhamentoPayload, { onConflict: 'professor_id' })
          if (error) throw new Error(error.message)
        }

        // 3 — Upsert em lote do histórico mensal de score.
        const historicoPayload = pagina.data.flatMap(p => {
          const professorId = idByKmsId.get(String(p.professor_id))
          if (!professorId || !p.score?.historico_mensal?.length) return []
          return p.score.historico_mensal.map(h => ({
            professor_id: professorId,
            ano_mes: h.ano_mes,
            score: h.score,
          }))
        })
        if (historicoPayload.length) {
          const { error } = await admin
            .from('professor_score_historico')
            .upsert(historicoPayload, { onConflict: 'professor_id,ano_mes' })
          if (error) throw new Error(error.message)
        }

        // 4 — Substitui o roster de alunos da página (delete em lote + insert em lote).
        const professorIdsDaPagina = [...idByKmsId.values()]
        if (professorIdsDaPagina.length) {
          const { error: delErr } = await admin
            .from('professor_alunos_kms')
            .delete()
            .in('professor_id', professorIdsDaPagina)
          if (delErr) throw new Error(delErr.message)
        }
        const alunosPorChave = new Map<string, {
          professor_id: string; aluno_id: number
          primeiro_nome: string | null; data_adicao: string | null; status_vinculo: string | null
        }>()
        for (const p of pagina.data) {
          const professorId = idByKmsId.get(String(p.professor_id))
          if (!professorId) continue
          for (const a of p.alunos ?? []) {
            alunosPorChave.set(`${professorId}:${a.aluno_id}`, {
              professor_id: professorId,
              aluno_id: a.aluno_id,
              primeiro_nome: a.primeiro_nome,
              data_adicao: a.data_adicao,
              status_vinculo: a.status_vinculo,
            })
          }
        }
        const alunosPayload = [...alunosPorChave.values()]
        if (alunosPayload.length) {
          const { error } = await admin
            .from('professor_alunos_kms')
            .upsert(alunosPayload, { onConflict: 'professor_id,aluno_id' })
          if (error) throw new Error(error.message)
        }

        cursor = pagina.proximo_cursor
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[kms-api-sync] Erro na página ${paginas}:`, msg)
        erros.push({ pagina: paginas, erro: msg })
        cursor = null // aborta paginação em caso de erro — evita loop indefinido
      }
    } while (cursor)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[kms-api-sync] Erro geral:', msg)
    return new Response(JSON.stringify({ error: msg, recebidos, criados, atualizados, paginas, erros }), { status: 500 })
  }

  const result = { recebidos, criados, atualizados, paginas, erros }
  console.log('[kms-api-sync] Concluído:', JSON.stringify(result))

  return new Response(JSON.stringify(result), {
    status: erros.length ? 207 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
