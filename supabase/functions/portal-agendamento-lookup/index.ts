// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: portal-agendamento-lookup
//
// Usada pela tela pública /agendar (sem login) como primeiro passo do Portal
// de Agendamento. Recebe nome completo + e-mail do professor, identifica-o,
// resolve o coordenador responsável pelo seu grupo, e retorna só as opções de
// agendamento elegíveis — nunca links de outro coordenador.
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
//   Body: { "nome": "Fulano de Tal", "email": "fulano@exemplo.com" }
//   Retorna: {
//     professor:   { id, nome } | null,
//     coordenador: { id, nome } | null,
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Confere se o nome informado bate ao menos no primeiro nome com o nome real cadastrado — defesa simples contra adivinhar o e-mail de outro professor. */
function nomeBate(informado: string, real: string): boolean {
  const a = norm(informado).split(' ').filter(Boolean)
  const b = norm(real).split(' ').filter(Boolean)
  if (!a.length || !b.length) return false
  return a[0] === b[0]
}

const OPCOES_VAZIAS = {
  primeira_reuniao: { elegivel: false, link: null },
  acompanhamento:   { elegivel: false, link: null },
  reuniao_grupo:    { elegivel: false, recomendada: false },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: { nome?: unknown; email?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const nome  = typeof body.nome === 'string' ? body.nome.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!nome || !email) return json({ error: 'Nome e e-mail são obrigatórios.' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Identifica o professor pelo e-mail e confere o nome ──────────────────
  const { data: emailRow } = await admin
    .from('professor_emails')
    .select('professor_id')
    .ilike('email', email)
    .maybeSingle()

  if (!emailRow) return json({ professor: null, coordenador: null, opcoes: OPCOES_VAZIAS })

  const { data: professor } = await admin
    .from('professores')
    .select('id, nome, status, coordenador_id')
    .eq('id', emailRow.professor_id)
    .maybeSingle()

  if (!professor || professor.status !== 'ativo' || !nomeBate(nome, professor.nome)) {
    return json({ professor: null, coordenador: null, opcoes: OPCOES_VAZIAS })
  }

  if (!professor.coordenador_id) {
    return json({ professor: { id: professor.id, nome: professor.nome }, coordenador: null, opcoes: OPCOES_VAZIAS })
  }

  // ── 2. Coordenador responsável e seus links ──────────────────────────────────
  const { data: coordenador } = await admin
    .from('profiles')
    .select('id, nome, koalendar_link, google_appointment_link')
    .eq('id', professor.coordenador_id)
    .maybeSingle()

  if (!coordenador) {
    return json({ professor: { id: professor.id, nome: professor.nome }, coordenador: null, opcoes: OPCOES_VAZIAS })
  }

  // ── 3. Já teve reunião realizada? ────────────────────────────────────────────
  const { count: reunioesRealizadas } = await admin
    .from('reuniao_professores')
    .select('id', { count: 'exact', head: true })
    .eq('professor_id', professor.id)
    .eq('status', 'realizada')

  const teveReuniaoRealizada = (reunioesRealizadas ?? 0) > 0

  // ── 4. Score de elegibilidade para reunião em grupo ──────────────────────────
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
