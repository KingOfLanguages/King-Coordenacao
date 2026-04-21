/**
 * Google Calendar integration via Google Identity Services (GIS)
 *
 * Setup (one-time):
 *  1. Create a project at console.cloud.google.com
 *  2. Enable the "Google Calendar API"
 *  3. Create an OAuth 2.0 Web Client ID
 *  4. Add the app's origin to "Authorized JavaScript origins"
 *  5. Set VITE_GOOGLE_CLIENT_ID in .env.local
 */

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const CALENDAR_API   = 'https://www.googleapis.com/calendar/v3'

// In-memory token (not persisted — user re-grants each session)
let _accessToken: string | null = null

// ─── GIS script loader ────────────────────────────────────────────────────────

function loadGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    const existing = document.getElementById('__gis_script')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('GIS load failed')))
      return
    }
    const script = document.createElement('script')
    script.id  = '__gis_script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload  = () => resolve()
    script.onerror = () => reject(new Error('Não foi possível carregar o Google Identity Services.'))
    document.head.appendChild(script)
  })
}

// ─── OAuth token ─────────────────────────────────────────────────────────────

/** Prompts the user to grant Calendar read access and returns an access token. */
export async function obterTokenGoogle(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (!clientId) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID não está configurado. ' +
      'Adicione ao .env.local e configure o OAuth no Google Cloud Console.'
    )
  }

  await loadGIS()

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope:     CALENDAR_SCOPE,
      callback:  (resp) => {
        if (resp.error) {
          reject(new Error(resp.error_description ?? resp.error))
          return
        }
        _accessToken = resp.access_token
        resolve(resp.access_token)
      },
      error_callback: (err) => reject(new Error(err.message ?? err.type)),
    })
    client.requestAccessToken({ prompt: 'consent' })
  })
}

export function limparTokenGoogle() {
  if (_accessToken) {
    window.google?.accounts?.oauth2?.revoke(_accessToken)
    _accessToken = null
  }
}

// ─── Calendar API types ───────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  htmlLink?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end:   { dateTime?: string; date?: string; timeZone?: string }
  attendees?: { email: string; displayName?: string; self?: boolean }[]
  organizer?: { email: string; displayName?: string }
}

// ─── Fetch events ─────────────────────────────────────────────────────────────

/** Fetches events from the user's primary calendar for a given date. */
export async function buscarEventosDia(
  token: string,
  data: Date = new Date()
): Promise<CalendarEvent[]> {
  const inicio = new Date(data)
  inicio.setHours(0, 0, 0, 0)
  const fim = new Date(data)
  fim.setHours(23, 59, 59, 999)

  const params = new URLSearchParams({
    timeMin:       inicio.toISOString(),
    timeMax:       fim.toISOString(),
    singleEvents:  'true',
    orderBy:       'startTime',
    maxResults:    '100',
  })

  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Google Calendar API error ${res.status}`)
  }

  const json = await res.json()
  return (json.items ?? []) as CalendarEvent[]
}

// ─── Professor matching ───────────────────────────────────────────────────────

/**
 * Tries to find a matching professor for a Calendar event.
 * Strategy (in order):
 *  1. Attendee displayName matches a professor name (all parts)
 *  2. Event summary contains the professor's first name
 */
export function matchProfessor<T extends { id: string; nome: string }>(
  event: CalendarEvent,
  professores: T[]
): T | null {
  if (!professores.length) return null

  const summaryLow = (event.summary ?? '').toLowerCase()
  const attendeeNames = (event.attendees ?? [])
    .map(a => (a.displayName ?? '').toLowerCase())

  for (const prof of professores) {
    const parts = prof.nome.toLowerCase().split(/\s+/).filter(Boolean)

    // Full name in attendees
    const inAttendees = attendeeNames.some(an =>
      parts.every(part => an.includes(part))
    )
    if (inAttendees) return prof

    // All name parts in summary
    const inSummary = parts.every(part => summaryLow.includes(part))
    if (inSummary) return prof

    // First name + last name in summary (common "1:1 com Fulano" pattern)
    if (parts.length >= 2) {
      const first = parts[0]
      const last  = parts[parts.length - 1]
      if (summaryLow.includes(first) && summaryLow.includes(last)) return prof
    }
  }

  return null
}

/** Extracts the start time as a Date from a CalendarEvent. */
export function eventStartDate(event: CalendarEvent): Date {
  const raw = event.start.dateTime ?? event.start.date ?? ''
  return new Date(raw)
}

/** Returns HH:MM string from a CalendarEvent start time. */
export function eventStartTime(event: CalendarEvent): string {
  const d = eventStartDate(event)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function eventEndTime(event: CalendarEvent): string {
  const raw = event.end.dateTime ?? event.end.date ?? ''
  const d   = new Date(raw)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
