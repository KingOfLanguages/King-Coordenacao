// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: generate-meet-link
//
// Cria um evento no Google Calendar da conta-hub (coordenacaoking.agenda@gmail.com)
// com uma sala do Google Meet anexada, e retorna o link. Usado pela tela de
// criação de agendas (/admin/agendas) para gerar automaticamente o Meet de
// cada horário, sem o coordenador precisar criar a sala manualmente.
//
// Reaproveita o refresh_token já salvo em google_tokens pela mesma conta-hub
// usada em daily-import — exige que ela tenha reautorizado com o escopo
// calendar.events (ver src/lib/googleCalendar.ts CALENDAR_SCOPE).
//
// Só pode ser chamada por um usuário autenticado (admin/coordenacao); a
// criação de eventos reais no Google Calendar não deve ficar aberta a anon.
//
// Secrets necessários: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (já existentes)
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/generate-meet-link
//   Header: Authorization: Bearer <jwt do usuário logado>
//   Body: { "titulo": "Feedback Coletivo", "data_hora": "2026-07-10T14:00:00Z" }
//   Retorna: { meet_link, google_event_id }
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  // ── Autenticação: precisa ser um usuário logado (admin/coordenacao) ─────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Não autorizado.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
  if (authErr || !user) return json({ error: 'Não autorizado.' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !['admin', 'coordenacao'].includes(profile.role)) {
    return json({ error: 'Sem permissão.' }, 403)
  }

  let body: { titulo?: unknown; data_hora?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const titulo   = typeof body.titulo === 'string' && body.titulo.trim() ? body.titulo.trim() : 'Reunião'
  const dataHora = typeof body.data_hora === 'string' ? body.data_hora : ''
  const inicio   = new Date(dataHora)
  if (!dataHora || isNaN(inicio.getTime())) return json({ error: 'data_hora inválida.' }, 400)

  // ── Token da conta-hub (mesmo refresh_token usado pelo daily-import) ────────
  const { data: tokenRow } = await admin
    .from('google_tokens')
    .select('refresh_token')
    .limit(1)
    .maybeSingle()

  if (!tokenRow?.refresh_token) {
    return json({ error: 'Nenhuma conta Google conectada. Ative a integração em Reuniões do Dia primeiro.' }, 400)
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: tokenRow.refresh_token,
      grant_type:    'refresh_token',
    }),
  })
  const tokenData = await tokenRes.json()
  if (tokenData.error) {
    console.error('[generate-meet-link] Erro ao renovar token:', tokenData.error, tokenData.error_description)
    if (tokenData.error === 'invalid_grant') {
      return json({ error: 'A conexão com o Google expirou. Reative em Reuniões do Dia.' }, 400)
    }
    return json({ error: tokenData.error_description ?? tokenData.error }, 400)
  }
  const accessToken: string = tokenData.access_token

  // ── Cria o evento com conferenceData (gera o Meet) ───────────────────────────
  const fim = new Date(inicio.getTime() + 60 * 60 * 1000)

  const eventRes = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: titulo,
        start: { dateTime: inicio.toISOString(), timeZone: 'America/Sao_Paulo' },
        end:   { dateTime: fim.toISOString(),    timeZone: 'America/Sao_Paulo' },
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    },
  )

  const event = await eventRes.json()
  if (!eventRes.ok) {
    console.error('[generate-meet-link] Erro ao criar evento:', JSON.stringify(event))
    return json({ error: event.error?.message ?? 'Erro ao criar evento no Google Calendar.' }, 502)
  }

  const meetLink = event.hangoutLink as string | undefined
  if (!meetLink) {
    return json({ error: 'O Google não retornou um link de Meet para este evento.' }, 502)
  }

  return json({ meet_link: meetLink, google_event_id: event.id as string })
})
