// ─────────────────────────────────────────────────────────────────────────────
// Portal público de PAUSA — o professor oficializa a pausa sem login, pelo link
// enviado pela coordenação (/pausa).
//
// Quem é o professor vem SÓ da sessão emitida por `portal-identidade` (código no
// e-mail oficial) — desde o pentest de 05/10/2026. Antes, o nome completo e um
// `professorId` no corpo bastavam para pedir pausa em nome de qualquer pessoa.
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/portal-pausa
//
//   { "acao": "estado", "token" }
//     → { professor: { id, nome }, pausaAberta: boolean, jaPausado: boolean }
//
//   { "acao": "solicitar", "token", "motivo", "dataInicio", "dataFim" }
//     → { ok: true, pausaId }  |  { error: "…" } com 400/409
//
// Escreve em `pausas` com a service_role (a tabela não tem policy de INSERT —
// toda escrita é por função DEFINER ou por aqui).
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  jsonPara, preflight, resolverSessao, semSufixoInicio, textoLimpo, MSG_SESSAO,
} from '../_shared/portal.ts'

const MOTIVO_MIN_CHARS = 5
const MOTIVO_MAX_CHARS = 2000
const DATARE  = /^\d{4}-\d{2}-\d{2}$/

/** Quanto tempo pra trás aceitamos como data de início (o professor pode estar
 *  formalizando uma pausa que começou dias atrás). */
const DIAS_RETROATIVO_MAX = 30
/** Teto de duração da pausa — evita erro de digitação virar pausa de 10 anos. */
const DIAS_DURACAO_MAX = 365

/** Data ISO (YYYY-MM-DD) → dias de diferença para hoje, em UTC. Negativo = passado. */
function diasAte(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo  = Date.UTC(a, m - 1, d)
  const agora = new Date()
  const hoje  = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
  return Math.round((alvo - hoje) / 86400000)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  const json = jsonPara(req)
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

  const acao = typeof body.acao === 'string' ? body.acao : ''

  if (acao === 'lookup') {
    return json({ error: 'Atualize a página para entrar com o código enviado ao seu e-mail.' }, 410)
  }

  const sessao = await resolverSessao(admin, body.token)
  if (!sessao) return json({ error: MSG_SESSAO }, 401)
  const professorId = sessao.id

  // ══ Ação: solicitar ════════════════════════════════════════════════════════
  if (acao === 'solicitar') {
    const motivo      = textoLimpo(body.motivo, MOTIVO_MAX_CHARS + 1)
    const dataInicio  = typeof body.dataInicio  === 'string' ? body.dataInicio.trim()  : ''
    const dataFim     = typeof body.dataFim     === 'string' ? body.dataFim.trim()     : ''

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

  // ══ Ação: estado ═══════════════════════════════════════════════════════════
  if (acao !== 'estado') return json({ error: 'Ação desconhecida.' }, 400)

  // Avisos que o front usa pra não deixar o professor preencher à toa.
  const { data: aberta } = await admin
    .from('pausas')
    .select('id')
    .eq('professor_id', professorId)
    .in('status', ['pendente', 'em_atendimento'])
    .limit(1)
    .maybeSingle()

  return json({
    professor:   { id: sessao.id, nome: semSufixoInicio(sessao.nome) },
    pausaAberta: !!aberta,
    jaPausado:   sessao.status === 'pausa',
  })
})
