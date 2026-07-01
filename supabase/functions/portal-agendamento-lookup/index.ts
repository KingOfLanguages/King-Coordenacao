// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: portal-agendamento-lookup
//
// Usada pela tela pública /agendar (sem login) como primeiro passo do Portal
// de Agendamento. A maioria dos professores sincronizados do KMS não tem
// e-mail cadastrado (professor_emails), então a identificação é feita só
// pelo nome — em 3 tentativas escalonadas, cada uma mais precisa que a
// anterior, pra minimizar tanto falso-negativo (não achar) quanto
// falso-positivo (achar a pessoa errada):
//
//   1ª tentativa — nome parcial (mín. 3 caracteres), casamento por token.
//   2ª tentativa — se ambíguo (>1 professor ativo bate), o front pede o
//                  nome completo e reenvia com o mesmo parâmetro `nome`.
//   3ª tentativa — se AINDA ambíguo (nomes idênticos — raro), o front pede
//                  mês/ano de início e reenvia com `mesInicio`/`anoInicio`,
//                  usados como desempate (± 1 mês de tolerância) contra
//                  professores.data_inicio.
//
// Em qualquer caso de ambiguidade ou não-encontrado, a resposta é genérica
// (`professor: null`) — nunca revela quantos bateram nem o motivo exato,
// pra não virar um jeito de "escanear" nomes cadastrados no sistema.
//
// Depois de resolver um professor único, resolve o coordenador responsável
// pelo seu grupo e retorna só as opções de agendamento elegíveis — nunca
// links de outro coordenador.
//
//   Opção 1 — "1ª reunião":     elegível se o professor nunca teve reunião
//                                 com status='realizada'. Aponta para o
//                                 koalendar_link do coordenador.
//   Opção 2 — "Acompanhamento": elegível se já teve ≥1 reunião realizada.
//                                 Aponta para o google_appointment_link do
//                                 coordenador.
//   Opção 3 — "Reuniões em grupo": elegível se professor_acompanhamento.
//                                 score_atual >= 1400. Sem link — o front
//                                 usa o fluxo já existente (teacher-lookup +
//                                 create-booking) para essa opção.
//
// Esta function NÃO mexe em agenda_reunioes/agenda_horarios — a Opção 3
// continua usando o fluxo público já existente, só passa a ficar atrás
// deste gate de score.
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/portal-agendamento-lookup
//   Body: { "nome": "Fulano de Tal", "mesInicio"?: 3, "anoInicio"?: 2026 }
//   Retorna: {
//     professor:   { id, nome } | null,
//     coordenador: { id, nome } | null,
//     ambiguo:     boolean,   // true = mais de 1 professor bateu com o nome informado
//     opcoes: {
//       primeira_reuniao: { elegivel: boolean, link: string | null },
//       acompanhamento:   { elegivel: boolean, link: string | null },
//       reuniao_grupo:    { elegivel: boolean, recomendada: boolean },
//     }
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SCORE_MINIMO_GRUPO = 1400
const NOME_MIN_CHARS = 3
const STOPWORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e'])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokens(s: string): string[] {
  return norm(s).split(' ').filter(t => t.length > 1 && !STOPWORDS.has(t))
}

/** Todo token informado precisa aparecer entre os tokens do nome real — permite nome parcial sem abrir mão de precisão. */
function nomeCorresponde(tokensInformados: string[], tokensReal: string[]): boolean {
  if (!tokensInformados.length) return false
  return tokensInformados.every(t => tokensReal.includes(t))
}

/** Mês/ano de início dentro de ±1 mês de tolerância (memória imprecisa é normal). */
function dataInicioBate(dataInicio: string | null, mes: number, ano: number): boolean {
  if (!dataInicio) return false
  const d = new Date(dataInicio)
  const diffMeses = (d.getUTCFullYear() - ano) * 12 + (d.getUTCMonth() - (mes - 1))
  return Math.abs(diffMeses) <= 1
}

const OPCOES_VAZIAS = {
  primeira_reuniao: { elegivel: false, link: null },
  acompanhamento:   { elegivel: false, link: null },
  reuniao_grupo:    { elegivel: false, recomendada: false },
}

function respostaVazia(ambiguo: boolean) {
  return { professor: null, coordenador: null, ambiguo, opcoes: OPCOES_VAZIAS }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: { nome?: unknown; mesInicio?: unknown; anoInicio?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const nome = typeof body.nome === 'string' ? body.nome.trim() : ''
  if (nome.length < NOME_MIN_CHARS) return json({ error: `Nome precisa ter ao menos ${NOME_MIN_CHARS} caracteres.` }, 400)

  const mesInicio = typeof body.mesInicio === 'number' ? body.mesInicio : null
  const anoInicio = typeof body.anoInicio === 'number' ? body.anoInicio : null

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Identifica candidatos pelo nome (casamento por token, não por e-mail) ─
  const { data: ativos } = await admin
    .from('professores')
    .select('id, nome, status, coordenador_id, data_inicio')
    .eq('status', 'ativo')

  const tokensInformados = tokens(nome)
  let candidatos = (ativos ?? []).filter(p => nomeCorresponde(tokensInformados, tokens(p.nome)))

  // ── 2. Desempate por mês/ano de início, só quando ainda ambíguo ──────────────
  if (candidatos.length > 1 && mesInicio != null && anoInicio != null) {
    candidatos = candidatos.filter(p => dataInicioBate(p.data_inicio, mesInicio, anoInicio))
  }

  if (candidatos.length === 0) return json(respostaVazia(false))
  if (candidatos.length > 1)   return json(respostaVazia(true))

  const professor = candidatos[0]

  if (!professor.coordenador_id) {
    return json({ professor: { id: professor.id, nome: professor.nome }, coordenador: null, ambiguo: false, opcoes: OPCOES_VAZIAS })
  }

  // ── 3. Coordenador responsável e seus links ──────────────────────────────────
  const { data: coordenador } = await admin
    .from('profiles')
    .select('id, nome, koalendar_link, google_appointment_link')
    .eq('id', professor.coordenador_id)
    .maybeSingle()

  if (!coordenador) {
    return json({ professor: { id: professor.id, nome: professor.nome }, coordenador: null, ambiguo: false, opcoes: OPCOES_VAZIAS })
  }

  // ── 4. Já teve reunião realizada? ────────────────────────────────────────────
  const { count: reunioesRealizadas } = await admin
    .from('reuniao_professores')
    .select('id', { count: 'exact', head: true })
    .eq('professor_id', professor.id)
    .eq('status', 'realizada')

  const teveReuniaoRealizada = (reunioesRealizadas ?? 0) > 0

  // ── 5. Score de elegibilidade para reunião em grupo ──────────────────────────
  const { data: acompanhamento } = await admin
    .from('professor_acompanhamento')
    .select('score_atual')
    .eq('professor_id', professor.id)
    .maybeSingle()

  const scoreAtual = acompanhamento?.score_atual ?? null
  const elegivelGrupo = scoreAtual != null && scoreAtual >= SCORE_MINIMO_GRUPO

  return json({
    professor: { id: professor.id, nome: professor.nome },
    coordenador: { id: coordenador.id, nome: coordenador.nome },
    ambiguo: false,
    opcoes: {
      primeira_reuniao: {
        elegivel: !teveReuniaoRealizada && !!coordenador.koalendar_link,
        link: !teveReuniaoRealizada ? coordenador.koalendar_link : null,
      },
      acompanhamento: {
        elegivel: teveReuniaoRealizada && !!coordenador.google_appointment_link,
        link: teveReuniaoRealizada ? coordenador.google_appointment_link : null,
      },
      reuniao_grupo: {
        elegivel: elegivelGrupo,
        recomendada: elegivelGrupo,
      },
    },
  })
})
