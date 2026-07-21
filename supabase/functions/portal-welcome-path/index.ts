// ─────────────────────────────────────────────────────────────────────────────
// Portal público do WELCOME PATH — o professor percorre a trilha de onboarding
// sem login, pelo link enviado pela coordenação (/welcome-path).
//
// A identificação é a MESMA dos outros portais (portal-pausa,
// portal-agendamento-lookup): e-mail exato → nome completo exato → desempate por
// mês/ano de início → contato da coordenação. A lógica está duplicada aqui de
// propósito: o projeto não usa pasta `_shared` entre edge functions e cada
// function é publicada isolada.
//
// Duas coisas que o app original (Lovable) fazia no navegador e aqui ficam no
// servidor, porque lá eram contornáveis com o DevTools aberto:
//   • o GABARITO nunca é enviado ao professor — a correção acontece aqui;
//   • o BLOQUEIO de etapa é verificado aqui, não só escondendo o botão.
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/portal-welcome-path   { "acao": "…", … }
//
//   lookup      { email?, nome?, mesInicio?, anoInicio?, professorId? }
//                 → { professor, ambiguo, token, expiraEm }
//   sessao      { token }                    → { professor }
//   trilha      { token }                    → { professor, etapas[] }
//   etapa       { token, etapaId }           → { etapa, blocos[], questoes[], progresso }
//   iniciar     { token, etapaId }           → { ok: true }
//   tempo       { token, etapaId, segundos } → { ok: true }
//   responder   { token, etapaId, respostas[] }
//                 → { nota, aprovado, notaMinima, revisaoPendente, resultado[] }
//   observacao  { token, etapaId, texto }    → { ok: true }
//
// Escreve com a service_role: `welcome_path_progresso` e `_respostas` não têm
// policy de INSERT/UPDATE (mesmo desenho de `pausas`).
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NOME_MIN_CHARS = 3
const EMAILRE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Validade da sessão do dispositivo. Deslizante: cada uso empurra pra frente. */
const SESSAO_DIAS = 30
/** Teto do incremento de tempo por batida — uma aba esquecida aberta não pode
 *  virar "8 horas de estudo". O front bate a cada ~30s enquanto está visível. */
const TEMPO_MAX_POR_BATIDA = 120
/** Tentativas por etapa antes de mandar falar com a coordenação. Sem isso, o
 *  quiz vira força-bruta do gabarito. */
const TENTATIVAS_MAX = 20
const TEXTO_MAX = 5000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function norm(s: string): string {
  // \p{M} = marcas combinantes. portal-pausa usa a faixa equivalente escrita com
  // os caracteres crus no fonte; aqui o padrão é só ASCII, então sobrevive a
  // qualquer troca de codificação do arquivo. Mesmo resultado em nomes PT-BR.
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Match EXATO do nome completo — só caixa e acentuação são ignoradas. */
function nomeExato(informado: string, real: string): boolean {
  const a = norm(informado)
  return a.length > 0 && a === norm(real)
}

/** Mês/ano de início dentro de ±1 mês de tolerância (memória imprecisa é normal). */
function dataInicioBate(dataInicio: string | null, mes: number, ano: number): boolean {
  if (!dataInicio) return false
  const d = new Date(dataInicio)
  const diffMeses = (d.getUTCFullYear() - ano) * 12 + (d.getUTCMonth() - (mes - 1))
  return Math.abs(diffMeses) <= 1
}

/** Dias inteiros decorridos desde uma data ISO (YYYY-MM-DD) até hoje, em UTC. */
function diasDesde(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const inicio = Date.UTC(a, m - 1, d)
  const agora  = new Date()
  const hoje   = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
  return Math.round((hoje - inicio) / 86400000)
}

/** Data ISO somada de N dias, em YYYY-MM-DD. */
function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

// ─── Sessão do dispositivo ────────────────────────────────────────────────────

function novoToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function validadeISO(): string {
  return new Date(Date.now() + SESSAO_DIAS * 86400000).toISOString()
}

type ProfRow = { id: string; nome: string; status: string; data_inicio: string | null }

// deno-lint-ignore no-explicit-any
type Admin = any

/** Cria a sessão e devolve o token CRU — é a única vez que ele existe fora do
 *  navegador do professor; o banco guarda só o SHA-256. */
async function criarSessao(admin: Admin, professorId: string) {
  const token = novoToken()
  const expiraEm = validadeISO()
  await admin.from('welcome_path_sessoes').insert({
    professor_id: professorId,
    token_hash:   await hashToken(token),
    expira_em:    expiraEm,
  })
  return { token, expiraEm }
}

/** Troca o token pelo professor. Renova a validade (deslizante) a cada uso. */
async function resolverSessao(admin: Admin, token: unknown): Promise<ProfRow | null> {
  if (typeof token !== 'string' || token.length < 20) return null

  const { data: sess } = await admin
    .from('welcome_path_sessoes')
    .select('id, professor_id, expira_em')
    .eq('token_hash', await hashToken(token))
    .maybeSingle()

  if (!sess) return null
  if (new Date(sess.expira_em).getTime() < Date.now()) {
    await admin.from('welcome_path_sessoes').delete().eq('id', sess.id)
    return null
  }

  const { data: p } = await admin
    .from('professores')
    .select('id, nome, status, data_inicio')
    .eq('id', sess.professor_id)
    .maybeSingle()

  // Diferente do portal de pausa, que exige status 'ativo': a trilha dura dias e
  // quem entra em pausa no meio não pode ficar trancado fora do onboarding.
  if (!p || p.status === 'desligado') return null

  await admin.from('welcome_path_sessoes')
    .update({ ultimo_uso_em: new Date().toISOString(), expira_em: validadeISO() })
    .eq('id', sess.id)

  return p as ProfRow
}

// ─── Estado da trilha ─────────────────────────────────────────────────────────

type EtapaRow = {
  id: string; ordem: number; titulo: string; descricao: string
  ativa: boolean; obrigatoria: boolean; nota_minima: number
  prazo_dias: number | null; liberacao_dia: number | null; notas_coordenacao: string | null
}
type ProgressoRow = {
  etapa_id: string; iniciada_em: string | null; concluida_em: string | null
  tempo_segundos: number; nota: number | null; tentativas: number
  observacao: string | null; liberada_manualmente: boolean; revisao_pendente: boolean
}

async function carregarTrilha(admin: Admin, prof: ProfRow) {
  const { data: etapasRaw } = await admin
    .from('welcome_path_etapas')
    .select('id, ordem, titulo, descricao, ativa, obrigatoria, nota_minima, prazo_dias, liberacao_dia, notas_coordenacao')
    .eq('ativa', true)
    .order('ordem', { ascending: true })

  const etapas = (etapasRaw ?? []) as EtapaRow[]

  const { data: progRaw } = await admin
    .from('welcome_path_progresso')
    .select('etapa_id, iniciada_em, concluida_em, tempo_segundos, nota, tentativas, observacao, liberada_manualmente, revisao_pendente')
    .eq('professor_id', prof.id)

  const porEtapa = new Map<string, ProgressoRow>(
    ((progRaw ?? []) as ProgressoRow[]).map(p => [p.etapa_id, p]),
  )

  const dias = prof.data_inicio ? diasDesde(prof.data_inicio) : null

  return etapas.map((e, i) => {
    const p = porEtapa.get(e.id) ?? null
    const anterior = i > 0 ? porEtapa.get(etapas[i - 1].id) : null

    const liberadaPorOrdem = i === 0 || !!anterior?.concluida_em || !!p?.liberada_manualmente
    // Sem data_inicio no cadastro não dá para calcular a janela — não trancamos
    // o professor por causa de um dado que falta no cadastro dele.
    const liberadaPorData =
      e.liberacao_dia == null || dias == null || dias + 1 >= e.liberacao_dia

    const estado = p?.concluida_em
      ? 'concluida'
      : liberadaPorOrdem && liberadaPorData ? 'liberada' : 'bloqueada'

    return {
      id: e.id,
      ordem: e.ordem,
      titulo: e.titulo,
      descricao: e.descricao,
      obrigatoria: e.obrigatoria,
      notaMinima: e.nota_minima,
      notasCoordenacao: e.notas_coordenacao,
      estado,
      motivoBloqueio: estado !== 'bloqueada' ? null : (liberadaPorOrdem ? 'data' : 'anterior'),
      abreEm: e.liberacao_dia != null && prof.data_inicio && !liberadaPorData
        ? somarDias(prof.data_inicio, e.liberacao_dia - 1)
        : null,
      prazoEm: e.prazo_dias != null && prof.data_inicio
        ? somarDias(prof.data_inicio, e.prazo_dias - 1)
        : null,
      nota: p?.nota ?? null,
      tentativas: p?.tentativas ?? 0,
      iniciadaEm: p?.iniciada_em ?? null,
      concluidaEm: p?.concluida_em ?? null,
      tempoSegundos: p?.tempo_segundos ?? 0,
      revisaoPendente: p?.revisao_pendente ?? false,
    }
  })
}

/** Garante a linha de progresso (professor × etapa) e devolve o estado atual. */
async function garantirProgresso(admin: Admin, professorId: string, etapaId: string) {
  const { data } = await admin
    .from('welcome_path_progresso')
    .select('*')
    .eq('professor_id', professorId)
    .eq('etapa_id', etapaId)
    .maybeSingle()

  if (data) return data

  const { data: criada } = await admin
    .from('welcome_path_progresso')
    .insert({ professor_id: professorId, etapa_id: etapaId })
    .select('*')
    .single()

  return criada
}

// ─── Correção ─────────────────────────────────────────────────────────────────

type QuestaoRow = {
  id: string; bloco_id: string | null; ordem: number; tipo: string
  enunciado: string; opcoes: string[]; corretas: number[]
  explicacao: string | null; peso: number; obrigatoria: boolean
}

function mesmoConjunto(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...new Set(a)].sort((x, y) => x - y)
  const sb = [...new Set(b)].sort((x, y) => x - y)
  return sa.every((v, i) => v === sb[i])
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const acao = typeof body.acao === 'string' ? body.acao : 'lookup'

  // ══ lookup ═════════════════════════════════════════════════════════════════
  if (acao === 'lookup') {
    const nome  = typeof body.nome  === 'string' ? body.nome.trim()  : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const professorIdInput = typeof body.professorId === 'string' ? body.professorId.trim() : ''
    const emailValido = EMAILRE.test(email.toLowerCase())
    const temNome     = nome.length >= NOME_MIN_CHARS

    if (!temNome && !emailValido && !professorIdInput) {
      return json({ error: `Informe seu e-mail ou ao menos ${NOME_MIN_CHARS} caracteres do seu nome.` }, 400)
    }

    const mesInicio = typeof body.mesInicio === 'number' ? body.mesInicio : null
    const anoInicio = typeof body.anoInicio === 'number' ? body.anoInicio : null

    const vazio = (ambiguo: boolean) => json({ professor: null, ambiguo, token: null })

    let professor: ProfRow | null = null

    // ── 1. Id direto (2º passo: cadastro do e-mail depois de achar pelo nome)
    if (professorIdInput) {
      const { data: p } = await admin
        .from('professores')
        .select('id, nome, status, data_inicio')
        .eq('id', professorIdInput)
        .maybeSingle()
      if (p && p.status !== 'desligado') {
        professor = p as ProfRow
        if (emailValido) {
          const { data: jaTem } = await admin
            .from('professor_emails')
            .select('id')
            .ilike('email', email)
            .limit(1)
            .maybeSingle()
          if (!jaTem) {
            await admin.from('professor_emails').insert({ professor_id: p.id, email, origem: 'portal' })
          }
        }
      }
    }

    // ── 2. E-mail exato
    if (!professor && emailValido) {
      const { data: emailRow } = await admin
        .from('professor_emails')
        .select('professor_id')
        .ilike('email', email)
        .maybeSingle()
      if (emailRow) {
        const { data: p } = await admin
          .from('professores')
          .select('id, nome, status, data_inicio')
          .eq('id', emailRow.professor_id)
          .maybeSingle()
        if (p && p.status !== 'desligado') professor = p as ProfRow
      }
    }

    // ── 3. Nome completo exato (+ desempate por mês/ano)
    if (!professor) {
      if (!temNome) return vazio(false)

      const { data: ativos } = await admin
        .from('professores')
        .select('id, nome, status, data_inicio')
        .neq('status', 'desligado')

      let candidatos = ((ativos ?? []) as ProfRow[]).filter(p => nomeExato(nome, p.nome))

      if (candidatos.length > 1 && mesInicio != null && anoInicio != null) {
        candidatos = candidatos.filter(p => dataInicioBate(p.data_inicio, mesInicio, anoInicio))
      }

      if (candidatos.length === 0) return vazio(false)
      if (candidatos.length > 1)   return vazio(true)

      professor = candidatos[0]
    }

    const { token, expiraEm } = await criarSessao(admin, professor.id)
    return json({
      professor: { id: professor.id, nome: professor.nome },
      ambiguo: false,
      token,
      expiraEm,
    })
  }

  // ══ Daqui pra baixo, tudo exige sessão válida ══════════════════════════════
  const prof = await resolverSessao(admin, body.token)
  if (!prof) return json({ error: 'Sessão expirada. Identifique-se novamente.' }, 401)

  if (acao === 'sessao') {
    return json({ professor: { id: prof.id, nome: prof.nome } })
  }

  if (acao === 'trilha') {
    return json({
      professor: { id: prof.id, nome: prof.nome, dataInicio: prof.data_inicio },
      etapas: await carregarTrilha(admin, prof),
    })
  }

  // ── Ações com etapa ────────────────────────────────────────────────────────
  const etapaId = typeof body.etapaId === 'string' ? body.etapaId.trim() : ''
  if (!etapaId) return json({ error: 'Etapa não informada.' }, 400)

  const trilha = await carregarTrilha(admin, prof)
  const etapaEstado = trilha.find(e => e.id === etapaId)
  if (!etapaEstado) return json({ error: 'Etapa não encontrada.' }, 404)

  // O gate mora aqui, não no React: no app original bastava trocar a URL.
  if (etapaEstado.estado === 'bloqueada') {
    return json({
      error: etapaEstado.motivoBloqueio === 'data'
        ? 'Esta etapa ainda não abriu. Volte na data indicada.'
        : 'Conclua a etapa anterior para liberar esta.',
    }, 403)
  }

  if (acao === 'etapa') {
    const { data: blocos } = await admin
      .from('welcome_path_blocos')
      .select('id, ordem, tipo, titulo, conteudo, url, meta')
      .eq('etapa_id', etapaId)
      .order('ordem', { ascending: true })

    const { data: questoesRaw } = await admin
      .from('welcome_path_questoes')
      .select('id, bloco_id, ordem, tipo, enunciado, opcoes, peso, obrigatoria')
      .eq('etapa_id', etapaId)
      .order('ordem', { ascending: true })

    const questoes = (questoesRaw ?? []) as (Omit<QuestaoRow, 'corretas' | 'explicacao'> & {
      explicacao?: string | null
    })[]

    // Respostas da última tentativa — alimentam o modo de revisão. Nunca mandamos
    // `corretas`: o professor vê SE acertou e a explicação, não qual era a certa
    // (senão a segunda tentativa vira cópia da correção).
    const progresso = await garantirProgresso(admin, prof.id, etapaId)
    const jaRespondeu = (progresso?.tentativas ?? 0) > 0 && questoes.length > 0
    let minhasRespostas: unknown[] = []

    if (jaRespondeu) {
      const ids = questoes.map(q => q.id)

      const { data: r } = await admin
        .from('welcome_path_respostas')
        .select('questao_id, resposta, correta, comentario_revisao')
        .eq('professor_id', prof.id)
        .eq('tentativa', progresso.tentativas)
        .in('questao_id', ids)
      minhasRespostas = r ?? []

      // A explicação é material didático — só faz sentido depois de responder,
      // e é o que sustenta o modo de revisão quando ele recarrega a página.
      const { data: expl } = await admin
        .from('welcome_path_questoes')
        .select('id, explicacao')
        .in('id', ids)
      const porId = new Map((expl ?? []).map((e: { id: string; explicacao: string | null }) => [e.id, e.explicacao]))
      for (const q of questoes) q.explicacao = porId.get(q.id) ?? null
    }

    return json({
      etapa: {
        id: etapaEstado.id,
        ordem: etapaEstado.ordem,
        titulo: etapaEstado.titulo,
        descricao: etapaEstado.descricao,
        notaMinima: etapaEstado.notaMinima,
        prazoEm: etapaEstado.prazoEm,
        notasCoordenacao: etapaEstado.notasCoordenacao,
      },
      blocos: blocos ?? [],
      questoes,
      progresso: {
        iniciadaEm: progresso?.iniciada_em ?? null,
        concluidaEm: progresso?.concluida_em ?? null,
        nota: progresso?.nota ?? null,
        tentativas: progresso?.tentativas ?? 0,
        observacao: progresso?.observacao ?? '',
        revisaoPendente: progresso?.revisao_pendente ?? false,
        tempoSegundos: progresso?.tempo_segundos ?? 0,
      },
      minhasRespostas,
    })
  }

  if (acao === 'iniciar') {
    const progresso = await garantirProgresso(admin, prof.id, etapaId)
    if (progresso && !progresso.iniciada_em) {
      await admin.from('welcome_path_progresso')
        .update({ iniciada_em: new Date().toISOString() })
        .eq('id', progresso.id)
    }
    return json({ ok: true })
  }

  if (acao === 'tempo') {
    const bruto = typeof body.segundos === 'number' ? Math.floor(body.segundos) : 0
    const delta = Math.max(0, Math.min(bruto, TEMPO_MAX_POR_BATIDA))
    if (delta === 0) return json({ ok: true })

    const progresso = await garantirProgresso(admin, prof.id, etapaId)
    await admin.from('welcome_path_progresso')
      .update({ tempo_segundos: (progresso?.tempo_segundos ?? 0) + delta })
      .eq('id', progresso.id)
    return json({ ok: true })
  }

  if (acao === 'observacao') {
    const texto = typeof body.texto === 'string' ? body.texto.trim().slice(0, TEXTO_MAX) : ''
    const progresso = await garantirProgresso(admin, prof.id, etapaId)
    await admin.from('welcome_path_progresso')
      .update({ observacao: texto || null })
      .eq('id', progresso.id)
    return json({ ok: true })
  }

  // ══ responder ══════════════════════════════════════════════════════════════
  if (acao === 'responder') {
    if (etapaEstado.estado === 'concluida') {
      return json({ error: 'Você já concluiu esta etapa.' }, 409)
    }

    const progresso = await garantirProgresso(admin, prof.id, etapaId)
    if ((progresso?.tentativas ?? 0) >= TENTATIVAS_MAX) {
      return json({ error: 'Você atingiu o limite de tentativas nesta etapa. Fale com a coordenação.' }, 429)
    }
    if (progresso?.revisao_pendente) {
      return json({ error: 'Suas respostas estão em revisão pela coordenação. Aguarde o retorno.' }, 409)
    }

    const { data: questoesRaw } = await admin
      .from('welcome_path_questoes')
      .select('id, tipo, opcoes, corretas, explicacao, peso, obrigatoria')
      .eq('etapa_id', etapaId)
      .order('ordem', { ascending: true })

    const questoes = (questoesRaw ?? []) as QuestaoRow[]
    if (questoes.length === 0) {
      return json({ error: 'Esta etapa ainda não tem atividades cadastradas.' }, 400)
    }

    const enviadas = Array.isArray(body.respostas) ? body.respostas : []
    const porQuestao = new Map<string, Record<string, unknown>>()
    for (const r of enviadas) {
      if (r && typeof r === 'object' && typeof (r as { questaoId?: unknown }).questaoId === 'string') {
        porQuestao.set((r as { questaoId: string }).questaoId, r as Record<string, unknown>)
      }
    }

    const tentativa = (progresso?.tentativas ?? 0) + 1
    const linhas: Record<string, unknown>[] = []
    const resultado: { questaoId: string; correta: boolean | null; explicacao: string | null }[] = []

    for (const q of questoes) {
      const enviada = porQuestao.get(q.id)

      if (q.tipo === 'dissertativa') {
        const texto = typeof enviada?.texto === 'string' ? enviada.texto.trim().slice(0, TEXTO_MAX) : ''
        if (!texto) {
          if (q.obrigatoria) return json({ error: 'Responda todas as atividades obrigatórias.' }, 400)
          continue
        }
        // correta = null: entra como pendente e segura a conclusão se obrigatória.
        linhas.push({ professor_id: prof.id, questao_id: q.id, tentativa, resposta: { texto }, correta: null })
        resultado.push({ questaoId: q.id, correta: null, explicacao: q.explicacao })
        continue
      }

      const brutas = Array.isArray(enviada?.opcoes) ? (enviada!.opcoes as unknown[]) : []
      const escolhidas = brutas
        .filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
        .filter(n => n >= 0 && n < (q.opcoes?.length ?? 0))

      if (escolhidas.length === 0) {
        if (q.obrigatoria) return json({ error: 'Responda todas as atividades obrigatórias.' }, 400)
        continue
      }
      // Múltipla escolha e V/F aceitam uma alternativa só.
      if (q.tipo !== 'multipla_selecao' && escolhidas.length > 1) {
        return json({ error: 'Escolha apenas uma alternativa.' }, 400)
      }

      const correta = mesmoConjunto(escolhidas, q.corretas ?? [])
      linhas.push({
        professor_id: prof.id, questao_id: q.id, tentativa,
        resposta: { opcoes: escolhidas }, correta,
      })
      resultado.push({ questaoId: q.id, correta, explicacao: q.explicacao })
    }

    if (linhas.length === 0) return json({ error: 'Nenhuma resposta enviada.' }, 400)

    await admin.from('welcome_path_progresso').update({ tentativas: tentativa }).eq('id', progresso.id)

    const { error: errResp } = await admin.from('welcome_path_respostas').insert(linhas)
    if (errResp) {
      return json({ error: 'Não foi possível registrar suas respostas agora. Tente novamente.' }, 500)
    }

    // A regra de nota mora no banco (wp_recalcular_etapa) — a revisão de
    // dissertativa chama a mesma função. Duplicar aqui faria as duas divergirem.
    const { error: errCalc } = await admin.rpc('wp_recalcular_etapa', {
      p_professor_id: prof.id,
      p_etapa_id:     etapaId,
    })
    if (errCalc) return json({ error: 'Não foi possível calcular sua nota agora.' }, 500)

    const { data: final } = await admin
      .from('welcome_path_progresso')
      .select('nota, concluida_em, revisao_pendente, tentativas')
      .eq('id', progresso.id)
      .maybeSingle()

    return json({
      nota: final?.nota ?? null,
      aprovado: !!final?.concluida_em,
      notaMinima: etapaEstado.notaMinima,
      revisaoPendente: final?.revisao_pendente ?? false,
      tentativas: final?.tentativas ?? tentativa,
      resultado,
    })
  }

  return json({ error: 'Ação desconhecida.' }, 400)
})
