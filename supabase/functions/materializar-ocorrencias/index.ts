// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: materializar-ocorrencias
//
// Cria proativamente (em vez de só na 1ª reserva) as próximas ocorrências das
// agendas recorrentes: para cada ocorrência dentro de uma janela futura, gera
// um Google Meet PRÓPRIO (link novo por ocorrência — nunca reaproveitado entre
// grupos diferentes) e já adiciona o coordenador da agenda como participante
// confirmado. A linha vira uma agenda_horarios real, com meet_link,
// google_event_id e coordenador_confirmado = true.
//
// Idempotente: só cria ocorrências que ainda não existem (protegido também pelo
// índice único (recorrencia_id, data_hora)). O create-booking continua como
// fallback caso alguma ocorrência ainda não tenha sido materializada.
//
// Invocada:
//   - na criação de agenda/recorrência (client, com JWT do coordenador/admin) —
//     body { "agenda_id": "uuid" } materializa só aquela agenda.
//   - pelo cron diário (service-role) — body {} materializa todas as ativas.
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (conta-hub, já existentes).
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const JANELA_DIAS = 21          // ~3 semanas de ocorrências pré-criadas
const BR_OFFSET   = '-03:00'    // Brasil não observa horário de verão desde 2019.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Próximas datas (uma por semana) em que `diaSemana` (0=dom…6=sáb) cai no
 *  horário `hora` (HH:MM:SS), a partir de hoje até `dias` à frente. */
function proximasOcorrencias(diaSemana: number, hora: string, dias: number): string[] {
  const hoje = new Date()
  const limite = new Date(hoje.getTime() + dias * 86_400_000)
  const [hh, mm] = hora.split(':')

  const base = new Date(hoje)
  base.setUTCHours(0, 0, 0, 0)
  const delta = (diaSemana - base.getUTCDay() + 7) % 7
  base.setUTCDate(base.getUTCDate() + delta)

  const out: string[] = []
  for (let i = 0; i < 10; i++) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + i * 7)
    const iso = `${d.toISOString().slice(0, 10)}T${hh}:${mm}:00${BR_OFFSET}`
    const dt = new Date(iso)
    if (dt <= hoje) continue
    if (dt > limite) break
    out.push(iso)
  }
  return out
}

/** Access token da conta-hub Google (mesmo refresh_token usado em create-booking/daily-import). */
async function getAccessToken(admin: ReturnType<typeof createClient>): Promise<string> {
  const { data: tokenRow } = await admin
    .from('google_tokens')
    .select('refresh_token')
    .limit(1)
    .maybeSingle()
  if (!tokenRow?.refresh_token) {
    throw new Error('A integração com o Google Calendar não está configurada. Avise a coordenação.')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: tokenRow.refresh_token as string,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (data.error || !data.access_token) {
    console.error('[materializar-ocorrencias] Erro ao renovar token Google:', data.error)
    throw new Error('Não foi possível autenticar no Google Calendar agora.')
  }
  return data.access_token as string
}

/** Cria um evento com Meet próprio; adiciona o coordenador como participante confirmado (se houver e-mail). */
async function criarEventoMeet(
  accessToken: string,
  titulo: string,
  dataHoraIso: string,
  coordEmail: string | null,
): Promise<{ meetLink: string; eventId: string }> {
  const inicio = new Date(dataHoraIso)
  const fim    = new Date(inicio.getTime() + 60 * 60 * 1000)

  const body: Record<string, unknown> = {
    summary: titulo,
    start: { dateTime: inicio.toISOString(), timeZone: 'America/Sao_Paulo' },
    end:   { dateTime: fim.toISOString(),    timeZone: 'America/Sao_Paulo' },
    conferenceData: {
      createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
    },
  }
  if (coordEmail) {
    body.attendees = [{ email: coordEmail, responseStatus: 'accepted' }]
  }

  // sendUpdates=none: não dispara e-mail de convite a cada ocorrência criada.
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const event = await res.json()
  if (!res.ok || !event.hangoutLink || !event.id) {
    console.error('[materializar-ocorrencias] Erro ao criar evento Google:', JSON.stringify(event))
    throw new Error('Não foi possível criar o evento no Google Calendar.')
  }
  return { meetLink: event.hangoutLink as string, eventId: event.id as string }
}

type RecorrenciaRow = { id: string; dia_semana: number; hora: string; capacidade: number; ativo: boolean }
type AgendaRow = {
  id: string
  titulo: string
  coordenador: { google_email: string | null } | { google_email: string | null }[] | null
  recorrencias: RecorrenciaRow[] | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Autorização: service-role (cron) ou admin/coordenacao autenticado ────────
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  let autorizado = token !== '' && token === serviceKey
  if (!autorizado && token) {
    const { data: userData } = await admin.auth.getUser(token)
    const uid = userData?.user?.id
    if (uid) {
      const { data: prof } = await admin.from('profiles').select('role').eq('id', uid).maybeSingle()
      autorizado = prof?.role === 'admin' || prof?.role === 'coordenacao'
    }
  }
  if (!autorizado) return json({ error: 'Não autorizado.' }, 401)

  let body: { agenda_id?: unknown } = {}
  try { body = await req.json() } catch { /* body vazio (cron) */ }
  const agendaId = typeof body.agenda_id === 'string' ? body.agenda_id.trim() : ''

  // ── Agendas ativas (opcionalmente só uma) + coordenador + recorrências ───────
  let query = admin
    .from('agenda_reunioes')
    .select(`
      id, titulo,
      coordenador:profiles!coordenador_id (google_email),
      recorrencias:agenda_recorrencias (id, dia_semana, hora, capacidade, ativo)
    `)
    .eq('ativo', true)
  if (agendaId) query = query.eq('id', agendaId)

  const { data: agendasRaw, error: agendasErr } = await query
  if (agendasErr) {
    console.error('[materializar-ocorrencias] Erro ao buscar agendas:', agendasErr.message)
    return json({ error: 'Erro ao buscar agendas.' }, 500)
  }
  const agendas = (agendasRaw ?? []) as unknown as AgendaRow[]

  // ── Ocorrências já existentes na janela (evita recriar) ──────────────────────
  const recIds = agendas.flatMap(a => (a.recorrencias ?? []).filter(r => r.ativo).map(r => r.id))
  const existSet = new Set<string>()
  if (recIds.length) {
    const { data: existentes } = await admin
      .from('agenda_horarios')
      .select('recorrencia_id, data_hora')
      .in('recorrencia_id', recIds)
      .gte('data_hora', new Date().toISOString())
    for (const h of existentes ?? []) {
      if (h.recorrencia_id) existSet.add(`${h.recorrencia_id}|${new Date(h.data_hora as string).getTime()}`)
    }
  }

  // ── Token do Google (uma vez) ────────────────────────────────────────────────
  let accessToken: string
  try {
    accessToken = await getAccessToken(admin)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro ao autenticar no Google.' }, 502)
  }

  let criadas = 0
  let puladas = 0
  const erros: { agenda: string; iso: string; erro: string }[] = []

  for (const a of agendas) {
    const coord = Array.isArray(a.coordenador) ? a.coordenador[0] : a.coordenador
    const coordEmail = coord?.google_email ?? null

    for (const r of (a.recorrencias ?? []).filter(r => r.ativo)) {
      for (const iso of proximasOcorrencias(r.dia_semana, r.hora, JANELA_DIAS)) {
        const key = `${r.id}|${new Date(iso).getTime()}`
        if (existSet.has(key)) { puladas++; continue }

        try {
          const { meetLink, eventId } = await criarEventoMeet(accessToken, a.titulo, iso, coordEmail)
          const { error: insErr } = await admin
            .from('agenda_horarios')
            .insert({
              agenda_id: a.id,
              recorrencia_id: r.id,
              data_hora: iso,
              capacidade: r.capacidade,
              meet_link: meetLink,
              google_event_id: eventId,
              coordenador_confirmado: !!coordEmail,
            })
          if (insErr) {
            // Corrida: outra execução materializou no meio tempo.
            if (/duplicate|unique/i.test(insErr.message)) { puladas++; continue }
            throw new Error(insErr.message)
          }
          existSet.add(key)
          criadas++
        } catch (e) {
          erros.push({ agenda: a.id, iso, erro: e instanceof Error ? e.message : String(e) })
        }
      }
    }
  }

  return json({ criadas, puladas, erros: erros.length, detalhe: erros.slice(0, 5) })
})
