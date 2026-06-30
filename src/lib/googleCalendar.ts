// ─────────────────────────────────────────────────────────────────────────────
// lib/googleCalendar.ts
// ─────────────────────────────────────────────────────────────────────────────

// calendar.events permite criar eventos com Google Meet (usado em create-booking, na 1ª reserva de cada semana).
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events'
const CALENDAR_API   = 'https://www.googleapis.com/calendar/v3'

let _accessToken: string | null = null

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

/**
 * Abre o popup de autorização Google (code flow com offline access).
 * Retorna o authorization code para ser trocado por tokens no servidor.
 * Necessário para ativar a importação automática diária.
 */
export async function solicitarCodigoGoogle(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (!clientId) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID não está configurado. ' +
      'Adicione ao .env.local e configure o OAuth no Google Cloud Console.'
    )
  }

  await loadGIS()

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window.google.accounts.oauth2 as any).initCodeClient({
      client_id: clientId,
      scope:     CALENDAR_SCOPE,
      ux_mode:   'popup',
      callback:  (resp: { code?: string; error?: string; error_description?: string }) => {
        if (resp.error) {
          reject(new Error(resp.error_description ?? resp.error))
          return
        }
        if (!resp.code) {
          reject(new Error('Código de autorização não recebido.'))
          return
        }
        resolve(resp.code)
      },
      error_callback: (err: { message?: string; type?: string }) => {
        reject(new Error(err.message ?? err.type ?? 'Erro na autorização Google.'))
      },
    })
    client.requestCode()
  })
}

export function limparTokenGoogle() {
  if (_accessToken) {
    window.google?.accounts?.oauth2?.revoke(_accessToken)
    _accessToken = null
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  htmlLink?: string
  hangoutLink?: string          // Google Meet URL (when conference is attached)
  start: { dateTime?: string; date?: string; timeZone?: string }
  end:   { dateTime?: string; date?: string; timeZone?: string }
  attendees?: { email: string; displayName?: string; self?: boolean }[]
  organizer?: { email: string; displayName?: string }
}

// ─── Fetch: todos os calendários ─────────────────────────────────────────────

export async function buscarEventosDia(
  token: string,
  data: Date = new Date()
): Promise<CalendarEvent[]> {
  const inicio = new Date(data)
  inicio.setHours(0, 0, 0, 0)

  const fim = new Date(data)
  fim.setHours(23, 59, 59, 999)

  const params = new URLSearchParams({
    timeMin:      inicio.toISOString(),
    timeMax:      fim.toISOString(),
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '100',
  })

  // 1 — lista todos os calendários do usuário
  const listRes = await fetch(
    `${CALENDAR_API}/users/me/calendarList`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!listRes.ok) throw new Error('Erro ao buscar lista de calendários')

  const listJson = await listRes.json()
  const calendars = (listJson.items ?? []).filter((c: { selected?: boolean }) => c.selected !== false)

  let allEvents: CalendarEvent[] = []

  // 2 — busca eventos de cada calendário
  for (const cal of calendars as { id: string }[]) {
    try {
      const res = await fetch(
        `${CALENDAR_API}/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) continue
      const json = await res.json()
      allEvents = allEvents.concat(json.items ?? [])
    } catch {
      // calendário sem permissão ou erro pontual — ignora
    }
  }

  return allEvents
}

// ─── Filtro: apenas reuniões reais com professores ────────────────────────────

/**
 * Palavras/padrões que identificam eventos que NÃO são reuniões 1:1 com teacher.
 * Qualquer título que bata aqui é descartado imediatamente.
 */
const BLOCKLIST: RegExp[] = [
  // Refeições / pausas
  /\balmo[çc]o\b/i,
  /\blunch\b/i,
  /\blanche\b/i,
  /\bcaf[eé]\b/i,
  /\bcoffee\b/i,
  /\bhappy hour\b/i,

  // Expediente / marcadores de dia
  /\bexpediente\b/i,
  /\binício do dia\b/i,
  /\bfim do dia\b/i,
  /\bstart of day\b/i,
  /\bend of day\b/i,
  /\beod\b/i,
  /\bstart of work\b/i,

  // Saúde / pessoal
  /\bm[eé]dic[oa]\b/i,
  /\bdentist[a]?\b/i,
  /\bconsulta\b/i,
  /\bgastro\b/i,
  /\bortoped\b/i,
  /\bpessoal\b/i,
  /\bpersonal\b/i,
  /\bocupado\b/i,
  /\bbusy\b/i,
  /\bbloqueado\b/i,
  /\bbloqueada\b/i,
  /\bblocked\b/i,
  /\breservado\b/i,

  // Eventos em grupo / operacionais
  /\btreinamento\b/i,
  /\btraining\b/i,
  /\bonboarding\b/i,
  /\bdaily\b/i,
  /\bstand[- ]?up\b/i,
  /\bsprints?\b/i,
  /\bretro\b/i,
  /\bplant[aã]o\b/i,
  /\bdebate\b/i,
  /\bconfer[eê]ncia\b/i,
  /\bworkshop\b/i,
  /\bwebinar\b/i,
  /\bferiado\b/i,
  /\bholiday\b/i,
  /\brecesso\b/i,
  /\bférias\b/i,
  /\baniversário\b/i,
  /\bbirthday\b/i,
  /\bcelebra[çc][aã]o\b/i,

  // Títulos curtos genéricos
  /^review$/i,
  /^ok$/i,
  /^hold$/i,
  /^sync$/i,
  /^check[- ]?in$/i,
]

/**
 * Padrões POSITIVOS que indicam que o evento é uma reunião 1:1 com professor.
 * Basta um match para passar o filtro.
 */
const MEETING_PATTERNS: RegExp[] = [
  /1\s*[:/]\s*1/,                // "1:1" ou "1/1" ou "1 1"
  /\bcom\s+teacher\b/i,          // "com teacher"
  /\bteacher\b/i,                // "teacher" genérico
  /\bcom\s+o\s+teacher\b/i,
  /\bwith\s+teacher\b/i,
  /\bmentoria\b/i,
  /\bcoaching\b/i,
  /\([\p{L}\s]{3,}\)/u,          // parênteses com nome: (Fernanda Wanderley)
  /[\p{L}\s]{4,}&[\p{L}\s]{4,}/u, // "Nome & Nome" pattern
]

/**
 * Retorna true se o evento parece ser uma reunião real com um professor.
 * Aplica primeiro o blocklist (descarte rápido), depois exige ao menos
 * um indicador positivo de meeting 1:1.
 */
export function isReuniaoComProfessor(event: CalendarEvent): boolean {
  // Ignora eventos de dia inteiro (sem horário)
  if (!event.start.dateTime) return false

  const title = event.summary ?? ''

  // Bloqueia imediatamente se bater em qualquer padrão negativo
  if (BLOCKLIST.some(rx => rx.test(title))) return false

  // Aceita se bater em qualquer padrão positivo
  if (MEETING_PATTERNS.some(rx => rx.test(title))) return true

  // Aceita se tiver ≥1 participante externo (não-self) — reunião com alguém
  const externalAttendees = (event.attendees ?? []).filter(a => !a.self)
  if (externalAttendees.length >= 1) return true

  // Rejeita o resto (eventos sem indicadores claros)
  return false
}

// ─── Normalização de strings ──────────────────────────────────────────────────

/** Remove acentos e normaliza para lowercase. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Extração de nome do título ───────────────────────────────────────────────

/**
 * Tenta extrair o nome do professor diretamente do título do evento.
 *
 * Suporta os padrões mais comuns:
 *   "1:1 com teacher (Fernanda Wanderley)"         → "Fernanda Wanderley"
 *   "1:1 Meetings (CYNTIA ROCHELE MIRANDA)"        → "CYNTIA ROCHELE MIRANDA"
 *   "EMMANUELA MACHADO & Ariel Miranda"             → "EMMANUELA MACHADO"  (primeira parte)
 *   "Maria Vitória Campos de Souza & Ariel Miranda" → "Maria Vitória Campos de Souza"
 */
function extrairNomeDeTitulo(title: string): string[] {
  const candidates: string[] = []

  // Padrão 1: conteúdo entre parênteses
  const parens = title.match(/\(([^)]+)\)/)
  if (parens?.[1]) candidates.push(parens[1].trim())

  // Padrão 2: "Nome & Outro" — pega a parte antes do &
  if (title.includes('&')) {
    const before = title.split('&')[0].trim()
    // Remove prefixos comuns para isolar o nome
    const cleaned = before
      .replace(/^1\s*[:/]\s*1\s*(meetings?|com teacher|with teacher)?\s*/i, '')
      .replace(/^meetings?\s*/i, '')
      .trim()
    if (cleaned.length > 2) candidates.push(cleaned)
  }

  return candidates
}

// ─── Matching professor ───────────────────────────────────────────────────────

/**
 * Tenta encontrar um professor para o evento do calendário.
 *
 * Estratégia (em ordem de precisão):
 *  1. Nome extraído dos parênteses ou do padrão "& Nome" bate exatamente
 *  2. Nome extraído bate parcialmente (todas as palavras presentes)
 *  3. Nome do professor está no título completo (todas as palavras)
 *  4. Nome do professor aparece no displayName dos participantes
 *  5. Pelo menos as 2 primeiras palavras do nome batem no título
 */
export function matchProfessor<T extends { id: string; nome: string }>(
  event: CalendarEvent,
  professores: T[]
): T | null {
  if (!professores.length) return null

  const titleNorm    = norm(event.summary ?? '')
  const extracted    = extrairNomeDeTitulo(event.summary ?? '').map(norm)
  const attendeeNorm = (event.attendees ?? [])
    .filter(a => !a.self)
    .map(a => norm(a.displayName ?? ''))
    .filter(Boolean)

  // Two-pass: collect scored matches, return best ≥ threshold
  const scores: Array<{ prof: T; score: number }> = []

  for (const prof of professores) {
    const nomeNorm  = norm(prof.nome)
    const nameParts = nomeNorm
      .split(' ')
      .filter(p => p.length > 1 && !['de','da','do','dos','das','e'].includes(p))

    // ── Tier 1 — exact match ──────────────────────────────────────────────────
    if (extracted.some(e => e === nomeNorm)) return prof
    if (attendeeNorm.some(a => a === nomeNorm)) return prof

    // ── Tier 2 — extracted / attendee contains ALL parts ─────────────────────
    if (extracted.some(e => nameParts.every(p => e.includes(p)))) return prof
    if (attendeeNorm.some(a => nameParts.every(p => a.includes(p)))) return prof

    // ── Tier 3 — full title contains ALL parts ────────────────────────────────
    if (nameParts.every(p => titleNorm.includes(p))) return prof

    if (nameParts.length < 2) continue

    const first  = nameParts[0]
    const second = nameParts[1]
    const last   = nameParts[nameParts.length - 1]

    // ── Tier 4 — first+second OR first+last in extracted / title ─────────────
    if (extracted.some(e => e.includes(first) && e.includes(second))) return prof
    if (extracted.some(e => e.includes(first) && e.includes(last)))   return prof
    if (titleNorm.includes(first) && titleNorm.includes(second))       return prof
    if (titleNorm.includes(first) && titleNorm.includes(last))         return prof

    // ── Tier 5 — attendee first+second OR first+last ──────────────────────────
    if (attendeeNorm.some(a => a.includes(first) && a.includes(second))) return prof
    if (attendeeNorm.some(a => a.includes(first) && a.includes(last)))   return prof

    // ── Fuzzy score — used as last resort across all professors ──────────────
    const matchInExtracted = extracted.reduce((best, e) => {
      const count = nameParts.filter(p => e.includes(p)).length
      return count > best ? count : best
    }, 0)
    const matchInTitle = nameParts.filter(p => titleNorm.includes(p)).length
    const matchInAttendee = attendeeNorm.reduce((best, a) => {
      const count = nameParts.filter(p => a.includes(p)).length
      return count > best ? count : best
    }, 0)
    const bestMatch = Math.max(matchInExtracted, matchInTitle, matchInAttendee)

    // Must match first name + at least one other word to score
    const hasFirstInExtracted = extracted.some(e => e.includes(first))
    const hasFirstInTitle     = titleNorm.includes(first)
    const hasFirstInAttendee  = attendeeNorm.some(a => a.includes(first))
    const hasFirst            = hasFirstInExtracted || hasFirstInTitle || hasFirstInAttendee

    if (hasFirst && bestMatch >= 2) {
      scores.push({ prof, score: bestMatch })
    }
  }

  // Return the best fuzzy match (if any)
  if (scores.length === 0) return null
  scores.sort((a, b) => b.score - a.score)
  return scores[0].prof
}

// ─── Utilitários de data/hora ─────────────────────────────────────────────────

export function eventStartDate(event: CalendarEvent): Date {
  const raw = event.start.dateTime ?? event.start.date ?? ''
  return new Date(raw)
}

export function eventStartTime(event: CalendarEvent): string {
  return eventStartDate(event).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function eventEndTime(event: CalendarEvent): string {
  const raw = event.end.dateTime ?? event.end.date ?? ''
  return new Date(raw).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
