// ─────────────────────────────────────────────────────────────────────────────
// Portal público de PAUSA — o professor oficializa a pausa sem login, pelo link
// enviado pela coordenação (/pausa).
//
// A identificação é a MESMA do portal de agendamento (portal-agendamento-lookup):
// e-mail exato → nome completo exato → desempate por mês/ano de início → contato
// da coordenação. A lógica está duplicada aqui de propósito: o projeto não usa
// pasta `_shared` entre edge functions (teacher-lookup também duplica), e cada
// function é publicada isolada.
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/portal-pausa
//
//   { "acao": "lookup", "email"?, "nome"?, "mesInicio"?, "anoInicio"?, "professorId"? }
//     → { professor: { id, nome } | null, ambiguo: boolean, pausaAberta: boolean, jaPausado: boolean }
//
//   { "acao": "solicitar", "professorId", "motivo", "dataInicio", "dataFim" }
//     → { ok: true, pausaId }  |  { error: "…" } com 400/409
//
// Escreve em `pausas` com a service_role (a tabela não tem policy de INSERT —
// toda escrita é por função DEFINER ou por aqui).
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NOME_MIN_CHARS = 3
const MOTIVO_MIN_CHARS = 5
const MOTIVO_MAX_CHARS = 2000
const EMAILRE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DATARE  = /^\d{4}-\d{2}-\d{2}$/

/** Quanto tempo pra trás aceitamos como data de início (o professor pode estar
 *  formalizando uma pausa que começou dias atrás). */
const DIAS_RETROATIVO_MAX = 30
/** Teto de duração da pausa — evita erro de digitação virar pausa de 10 anos. */
const DIAS_DURACAO_MAX = 365

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Match EXATO do nome completo — só caixa e acentuação são ignoradas. Nada de
 *  nome parcial: evita casar "João" com vários "João …". */
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

/** Data ISO (YYYY-MM-DD) → dias de diferença para hoje, em UTC. Negativo = passado. */
function diasAte(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo  = Date.UTC(a, m - 1, d)
  const agora = new Date()
  const hoje  = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
  return Math.round((alvo - hoje) / 86400000)
}

type ProfRow = { id: string; nome: string; status: string; data_inicio: string | null }

function respostaVazia(ambiguo: boolean) {
  return { professor: null, ambiguo, pausaAberta: false, jaPausado: false }
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

  // ══ Ação: solicitar ════════════════════════════════════════════════════════
  if (acao === 'solicitar') {
    const professorId = typeof body.professorId === 'string' ? body.professorId.trim() : ''
    const motivo      = typeof body.motivo      === 'string' ? body.motivo.trim()      : ''
    const dataInicio  = typeof body.dataInicio  === 'string' ? body.dataInicio.trim()  : ''
    const dataFim     = typeof body.dataFim     === 'string' ? body.dataFim.trim()     : ''

    if (!professorId) return json({ error: 'Identificação perdida. Recomece o preenchimento.' }, 400)
    if (motivo.length < MOTIVO_MIN_CHARS) {
      return json({ error: 'Conte o motivo da pausa com um pouco mais de detalhe.' }, 400)
    }
    if (motivo.length > MOTIVO_MAX_CHARS) {
      return json({ error: 'O motivo ficou longo demais. Resuma um pouco.' }, 400)
    }
    if (!DATARE.test(dataInicio) || !DATARE.test(dataFim)) {
      return json({ error: 'Informe as duas datas.' }, 400)
    }
    if (dataFim < dataInicio) {
      return json({ error: 'A data de fim não pode ser anterior à data de início.' }, 400)
    }

    const diasInicio = diasAte(dataInicio)
    if (diasInicio < -DIAS_RETROATIVO_MAX) {
      return json({ error: 'A data de início está muito no passado. Fale com a coordenação.' }, 400)
    }
    if (diasAte(dataFim) - diasInicio > DIAS_DURACAO_MAX) {
      return json({ error: 'Essa pausa passa de um ano. Confira as datas ou fale com a coordenação.' }, 400)
    }

    const { data: prof } = await admin
      .from('professores')
      .select('id, nome, status')
      .eq('id', professorId)
      .maybeSingle()

    if (!prof)                    return json({ error: 'Cadastro não encontrado.' }, 404)
    if (prof.status === 'pausa')  return json({ error: 'Você já consta como pausado. Fale com a coordenação.' }, 409)
    if (prof.status !== 'ativo')  return json({ error: 'Seu cadastro não está ativo. Fale com a coordenação.' }, 409)

    // Já existe solicitação em aberto? (o índice único no banco também barra,
    // mas aqui devolvemos uma mensagem que o professor entende)
    const { data: aberta } = await admin
      .from('pausas')
      .select('id')
      .eq('professor_id', professorId)
      .in('status', ['pendente', 'em_atendimento'])
      .limit(1)
      .maybeSingle()

    if (aberta) {
      return json({ error: 'Você já tem uma solicitação de pausa em andamento. A coordenação vai te procurar.' }, 409)
    }

    const { data: criada, error } = await admin
      .from('pausas')
      .insert({
        professor_id: professorId,
        motivo,
        data_inicio: dataInicio,
        data_fim: dataFim,
        status: 'pendente',
        origem: 'portal',
      })
      .select('id')
      .single()

    if (error) {
      // 23505 = corrida com outra aba/aba dupla batendo no índice único.
      if (error.code === '23505') {
        return json({ error: 'Você já tem uma solicitação de pausa em andamento.' }, 409)
      }
      return json({ error: 'Não foi possível registrar agora. Tente novamente em instantes.' }, 500)
    }

    return json({ ok: true, pausaId: criada.id })
  }

  // ══ Ação: lookup ═══════════════════════════════════════════════════════════
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

  let professor: ProfRow | null = null

  // ── 1. Id direto (2º passo do fluxo: cadastro do e-mail depois de achar pelo nome)
  if (professorIdInput) {
    const { data: p } = await admin
      .from('professores')
      .select('id, nome, status, data_inicio')
      .eq('id', professorIdInput)
      .maybeSingle()
    if (p && p.status === 'ativo') {
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
      if (p && p.status === 'ativo') professor = p as ProfRow
    }
  }

  // ── 3. Nome completo exato (+ desempate por mês/ano)
  if (!professor) {
    if (!temNome) return json(respostaVazia(false))

    const { data: ativos } = await admin
      .from('professores')
      .select('id, nome, status, data_inicio')
      .eq('status', 'ativo')

    let candidatos = ((ativos ?? []) as ProfRow[]).filter(p => nomeExato(nome, p.nome))

    if (candidatos.length > 1 && mesInicio != null && anoInicio != null) {
      candidatos = candidatos.filter(p => dataInicioBate(p.data_inicio, mesInicio, anoInicio))
    }

    if (candidatos.length === 0) return json(respostaVazia(false))
    if (candidatos.length > 1)   return json(respostaVazia(true))

    professor = candidatos[0]
  }

  if (!professor) return json(respostaVazia(false))

  // Avisos que o front usa pra não deixar o professor preencher à toa.
  const { data: aberta } = await admin
    .from('pausas')
    .select('id')
    .eq('professor_id', professor.id)
    .in('status', ['pendente', 'em_atendimento'])
    .limit(1)
    .maybeSingle()

  return json({
    professor:   { id: professor.id, nome: professor.nome },
    ambiguo:     false,
    pausaAberta: !!aberta,
    jaPausado:   professor.status === 'pausa',
  })
})
