// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: kms-api-sync
//
// Substitui o kms-webhook (nunca implantado). Roda via pg_cron (a cada hora,
// alinhado ao cache de 1h documentado pela API) e faz PULL em vez de push:
//   1. POST /api/Login com KMS_API_EMAIL/KMS_API_PASSWORD → accessToken
//   2. Pagina GET /api/v1/acompanhamento-professores até acabar o cursor
//   3. Para cada professor: upsert em professores (por kms_id) + em
//      professor_acompanhamento, professor_score_historico e
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
  const erros: { professor_id: number; erro: string }[] = []

  try {
    const token = await login(baseUrl, email, password)
    let cursor: string | null = null

    do {
      const pagina: AcompanhamentoResponse = await fetchPagina(baseUrl, token, cursor)

      for (const p of pagina.data) {
        recebidos++
        try {
          const kmsId = String(p.professor_id)

          const { data: existente } = await admin
            .from('professores')
            .select('id')
            .eq('kms_id', kmsId)
            .maybeSingle()

          const payload = {
            kms_id: kmsId,
            nome: p.nome,
            data_inicio: p.data_entrada,
            status: mapStatus(p.status),
          }

          let professorId: string
          if (existente) {
            const { error } = await admin.from('professores').update(payload).eq('id', existente.id)
            if (error) throw new Error(error.message)
            professorId = existente.id
            atualizados++
          } else {
            const { data: novo, error } = await admin
              .from('professores')
              .insert(payload)
              .select('id')
              .single()
            if (error || !novo) throw new Error(error?.message ?? 'insert falhou')
            professorId = novo.id
            criados++
          }

          const alertas = p.alertas ?? {}
          const { error: acompErr } = await admin.from('professor_acompanhamento').upsert({
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
          }, { onConflict: 'professor_id' })
          if (acompErr) throw new Error(acompErr.message)

          if (p.score?.historico_mensal?.length) {
            const rows = p.score.historico_mensal.map(h => ({
              professor_id: professorId,
              ano_mes: h.ano_mes,
              score: h.score,
            }))
            const { error: histErr } = await admin
              .from('professor_score_historico')
              .upsert(rows, { onConflict: 'professor_id,ano_mes' })
            if (histErr) throw new Error(histErr.message)
          }

          await admin.from('professor_alunos_kms').delete().eq('professor_id', professorId)
          if (p.alunos?.length) {
            const rows = p.alunos.map(a => ({
              professor_id: professorId,
              aluno_id: a.aluno_id,
              primeiro_nome: a.primeiro_nome,
              data_adicao: a.data_adicao,
              status_vinculo: a.status_vinculo,
            }))
            const { error: alunosErr } = await admin.from('professor_alunos_kms').insert(rows)
            if (alunosErr) throw new Error(alunosErr.message)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[kms-api-sync] Erro no professor ${p.professor_id}:`, msg)
          erros.push({ professor_id: p.professor_id, erro: msg })
        }
      }

      cursor = pagina.proximo_cursor
    } while (cursor)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[kms-api-sync] Erro geral:', msg)
    return new Response(JSON.stringify({ error: msg, recebidos, criados, atualizados, erros }), { status: 500 })
  }

  const result = { recebidos, criados, atualizados, erros }
  console.log('[kms-api-sync] Concluído:', JSON.stringify(result))

  return new Response(JSON.stringify(result), {
    status: erros.length ? 207 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
