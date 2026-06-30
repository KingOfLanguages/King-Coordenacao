// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: daily-import
//
// Roda automaticamente via pg_cron (08:00 BRT).
// Para cada coordenador com refresh_token salvo:
//   1. Obtém um access_token novo via Google OAuth2
//   2. Busca eventos do Google Calendar do dia
//   3. Filtra reuniões reais com professores
//   4. Determina o coordenador_id correto pelo email do organizador/participante
//   5. Faz match de professores pelo nome
//   6. Insere na tabela reunioes (ignora duplicatas pelo google_event_id)
//
// Atribuição de coordenador:
//   Cada evento tem um organizer.email e attendees[].email.
//   O mapa emailToUserId é construído a partir de DUAS fontes (mescladas):
//     - google_tokens.google_email  (quem conectou a automação)
//     - profiles.google_email       (e-mail Google pessoal cadastrado no perfil,
//                                     usado quando a conexão é feita por uma conta
//                                     única compartilhada, ex: agenda centralizada)
//   ex: coordenacaoking7@gmail.com → UUID da Ariel no Supabase.
//   Prioridade: organizer > attendee conhecido > dono do token (fallback).
//
// Secrets necessários:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Google Calendar ──────────────────────────────────────────────────────────

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

interface CalEvent {
  id: string
  summary: string
  description?: string
  htmlLink?: string
  hangoutLink?: string
  start: { dateTime?: string; date?: string }
  end:   { dateTime?: string; date?: string }
  organizer?: { email: string; displayName?: string; self?: boolean }
  attendees?: { email: string; displayName?: string; self?: boolean; responseStatus?: string }[]
}

/**
 * Extrai o email do professor (attendee externo) do evento.
 * Ignora: o dono do calendário (self=true) e emails de coordenadores conhecidos.
 */
function extractProfessorEmail(ev: CalEvent, coordEmails: Set<string>): string | null {
  const external = (ev.attendees ?? []).filter(a =>
    !a.self &&
    a.email &&
    !coordEmails.has(a.email.toLowerCase())
  )
  return external[0]?.email ?? null
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error === 'invalid_grant' ? 'invalid_grant' : data.error_description ?? data.error)
  return data.access_token
}

async function buscarEventosDia(token: string, data: Date): Promise<CalEvent[]> {
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

  // Lista todos os calendários da conta
  const listRes = await fetch(`${CALENDAR_API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!listRes.ok) throw new Error('Erro ao listar calendários')

  const listJson = await listRes.json()
  const calendars = (listJson.items ?? []).filter((c: { selected?: boolean }) => c.selected !== false)

  let all: CalEvent[] = []
  for (const cal of calendars as { id: string }[]) {
    try {
      const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(cal.id)}/events?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) continue
      const json = await res.json()
      all = all.concat(json.items ?? [])
    } catch { /* ignora calendários sem permissão */ }
  }
  return all
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

const BLOCKLIST: RegExp[] = [
  /\balmo[çc]o\b/i, /\blunch\b/i, /\bcaf[eé]\b/i, /\bcoffee\b/i,
  /\bexpediente\b/i, /\binício do dia\b/i, /\bfim do dia\b/i,
  /\bm[eé]dic[oa]\b/i, /\bconsulta\b/i, /\bpessoal\b/i, /\bbusy\b/i,
  /\btreinamento\b/i, /\btraining\b/i, /\bonboarding\b/i, /\bdaily\b/i,
  /\bstand[- ]?up\b/i, /\bwebinar\b/i, /\bferiado\b/i, /\bholiday\b/i,
  /^review$/i, /^ok$/i, /^hold$/i, /^sync$/i, /^check[- ]?in$/i,
]

const MEETING_PATTERNS: RegExp[] = [
  /1\s*[:/]\s*1/, /\bteacher\b/i, /\bmentoria\b/i, /\bcoaching\b/i,
  /\([\p{L}\s]{3,}\)/u, /[\p{L}\s]{4,}&[\p{L}\s]{4,}/u,
]

function isReuniaoComProfessor(ev: CalEvent): boolean {
  if (!ev.start.dateTime) return false
  const title = ev.summary ?? ''
  if (BLOCKLIST.some(rx => rx.test(title))) return false
  if (MEETING_PATTERNS.some(rx => rx.test(title))) return true
  const ext = (ev.attendees ?? []).filter(a => !a.self)
  return ext.length >= 1
}

// ─── Atribuição de coordenador ────────────────────────────────────────────────

/**
 * Determina qual coordenador é responsável pelo evento.
 *
 * Estratégia (ordem de prioridade):
 *  1. Organizer do evento bate com um email Google conhecido
 *  2. Um dos attendees (que não seja o calendário dono) bate com email conhecido
 *  3. Fallback: dono do token (user_id do token atual)
 *
 * Isso garante que numa agenda compartilhada:
 *   - evento criado por coordenacaoking7@gmail.com → Ariel
 *   - evento com caio.velloso.king@gmail.com como attendee → Caio
 */
function resolveCoordId(
  ev: CalEvent,
  tokenUserId: string,
  emailToUserId: Record<string, string>,
): string {
  const organizerEmail = ev.organizer?.email?.toLowerCase()
  if (organizerEmail && emailToUserId[organizerEmail]) {
    return emailToUserId[organizerEmail]
  }

  for (const att of ev.attendees ?? []) {
    if (att.self) continue                    // ignora o próprio calendário
    const email = att.email?.toLowerCase()
    if (email && emailToUserId[email]) {
      return emailToUserId[email]
    }
  }

  return tokenUserId   // fallback: dono do token
}

// ─── Professor matching ───────────────────────────────────────────────────────

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function extrairNomeDeTitulo(title: string): string[] {
  const candidates: string[] = []
  const parens = title.match(/\(([^)]+)\)/)
  if (parens?.[1]) candidates.push(parens[1].trim())
  if (title.includes('&')) {
    const before = title.split('&')[0].trim()
    const cleaned = before
      .replace(/^1\s*[:/]\s*1\s*(meetings?|com teacher|with teacher)?\s*/i, '')
      .replace(/^meetings?\s*/i, '').trim()
    if (cleaned.length > 2) candidates.push(cleaned)
  }
  return candidates
}

function matchProfessor<T extends { id: string; nome: string }>(ev: CalEvent, professores: T[]): T | null {
  if (!professores.length) return null
  const titleNorm    = norm(ev.summary ?? '')
  const extracted    = extrairNomeDeTitulo(ev.summary ?? '').map(norm)
  const attendeeNorm = (ev.attendees ?? []).filter(a => !a.self).map(a => norm(a.displayName ?? '')).filter(Boolean)
  const scores: Array<{ prof: T; score: number }> = []

  for (const prof of professores) {
    const nomeNorm  = norm(prof.nome)
    const nameParts = nomeNorm.split(' ').filter(p => p.length > 1 && !['de','da','do','dos','das','e'].includes(p))

    if (extracted.some(e => e === nomeNorm))                              return prof
    if (attendeeNorm.some(a => a === nomeNorm))                           return prof
    if (extracted.some(e => nameParts.every(p => e.includes(p))))        return prof
    if (attendeeNorm.some(a => nameParts.every(p => a.includes(p))))     return prof
    if (nameParts.every(p => titleNorm.includes(p)))                      return prof
    if (nameParts.length < 2) continue

    const first = nameParts[0], second = nameParts[1], last = nameParts[nameParts.length - 1]
    if (extracted.some(e => e.includes(first) && e.includes(second)))    return prof
    if (extracted.some(e => e.includes(first) && e.includes(last)))      return prof
    if (titleNorm.includes(first) && titleNorm.includes(second))         return prof
    if (titleNorm.includes(first) && titleNorm.includes(last))           return prof
    if (attendeeNorm.some(a => a.includes(first) && a.includes(second))) return prof
    if (attendeeNorm.some(a => a.includes(first) && a.includes(last)))   return prof

    const bestScore = Math.max(
      extracted.reduce((b, e) => Math.max(b, nameParts.filter(p => e.includes(p)).length), 0),
      nameParts.filter(p => titleNorm.includes(p)).length,
      attendeeNorm.reduce((b, a) => Math.max(b, nameParts.filter(p => a.includes(p)).length), 0),
    )
    const hasFirst = extracted.some(e => e.includes(first)) || titleNorm.includes(first) || attendeeNorm.some(a => a.includes(first))
    if (hasFirst && bestScore >= 2) scores.push({ prof, score: bestScore })
  }

  if (!scores.length) return null
  return scores.sort((a, b) => b.score - a.score)[0].prof
}

// ─── Servidor ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  // Aceita requests com CRON_SECRET (se configurado) ou sem auth (pg_cron interno)
  const auth       = req.headers.get('Authorization') ?? ''
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return new Response('Não autorizado.', { status: 401 })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Carrega tokens + emails de todos os coordenadores ──────────────────────
  const { data: tokenRows, error: tokenErr } = await admin
    .from('google_tokens')
    .select('user_id, refresh_token, google_email')

  if (tokenErr) {
    console.error('[daily-import] Erro ao buscar tokens:', tokenErr.message)
    return new Response(JSON.stringify({ error: tokenErr.message }), { status: 500 })
  }

  // Mapa: googleEmail (lower) → supabase user_id
  // ex: { 'coordenacaoking7@gmail.com': 'uuid-ariel', 'caio.velloso.king@gmail.com': 'uuid-caio', ... }
  const emailToUserId: Record<string, string> = {}
  for (const row of tokenRows ?? []) {
    if (row.google_email) {
      emailToUserId[row.google_email.toLowerCase()] = row.user_id
    }
  }

  // Também usa o e-mail Google pessoal cadastrado no perfil (profiles.google_email).
  // Permite atribuir o coordenador correto mesmo quando a conexão OAuth é feita
  // por uma conta única (ex: conta compartilhada que recebe todos os calendários).
  const { data: coordProfiles } = await admin
    .from('profiles')
    .select('id, google_email')
    .not('google_email', 'is', null)

  for (const p of coordProfiles ?? []) {
    if (p.google_email) {
      emailToUserId[p.google_email.toLowerCase()] = p.id
    }
  }

  // Set de emails de coordenadores — usado para excluir da busca de email do professor
  const coordEmails = new Set(Object.keys(emailToUserId))
  console.log('[daily-import] Mapa de coordenadores:', [...coordEmails])

  // Professores ativos (matching por nome) + e-mails conhecidos (matching por e-mail)
  const { data: professores } = await admin
    .from('professores')
    .select('id, nome')
    .eq('saiu',  false)
    .eq('pausa', false)

  const { data: emailRows } = await admin
    .from('professor_emails')
    .select('professor_id, email')

  const emailToProfessorId: Record<string, string> = {}
  for (const r of emailRows ?? []) {
    if (r.email) emailToProfessorId[r.email.toLowerCase()] = r.professor_id
  }
  const professorNomeById = new Map((professores ?? []).map(p => [p.id, p.nome]))

  const today = new Date()
  let totalSaved = 0
  let totalErrors = 0
  const errorDetails: { coordenador: string; erro: string }[] = []

  for (const row of tokenRows ?? []) {
    try {
      console.log(`[daily-import] Processando: ${row.google_email ?? row.user_id}`)

      // 1 — Refresh access token
      const accessToken = await refreshAccessToken(row.refresh_token)

      // 2 — Busca eventos do dia
      const events   = await buscarEventosDia(accessToken, today)
      const meetings = events.filter(isReuniaoComProfessor)

      console.log(`[daily-import] ${meetings.length} reunião(ões) encontrada(s) para ${row.google_email ?? row.user_id}`)

      // 4 — Insere reuniões não duplicadas com coordenador correto
      for (const ev of meetings) {
        // Resolve qual coordenador é responsável por este evento
        const coordId      = resolveCoordId(ev, row.user_id, emailToUserId)
        const profEmail    = extractProfessorEmail(ev, coordEmails)

        // Match por e-mail exato (mais confiável) > match por nome no título (fallback)
        const emailMatchId = profEmail ? emailToProfessorId[profEmail.toLowerCase()] : undefined
        const profByName   = matchProfessor(ev, professores ?? [])
        const resolvedProfId = emailMatchId ?? profByName?.id ?? null
        const resolvedNome   = emailMatchId
          ? professorNomeById.get(emailMatchId) ?? emailMatchId
          : profByName?.nome

        const startDt      = new Date(ev.start.dateTime ?? ev.start.date ?? '')
        const meetHref     = ev.hangoutLink ?? ev.htmlLink ?? null

        // Verifica duplicata pelo google_event_id (já importado antes?)
        const { data: existing } = await admin
          .from('reunioes')
          .select('id')
          .eq('google_event_id', ev.id)
          .maybeSingle()

        if (existing) {
          console.log(`[daily-import] Já existe: "${ev.summary}" — pulando`)
          continue
        }

        const { data: novaReuniao, error: insertErr } = await admin
          .from('reunioes')
          .insert({
            coordenador_id:  coordId,
            professor_id:    resolvedProfId,
            professor_email: profEmail,
            data:            startDt.toISOString(),
            titulo:          ev.summary,
            google_event_id: ev.id,
            meet_link:       meetHref,
            status:          'pendente',
          })
          .select('id')
          .single()

        if (insertErr || !novaReuniao) {
          console.error(`[daily-import] Erro ao inserir "${ev.summary}":`, insertErr?.message)
          totalErrors++
          continue
        }

        // Cria o vínculo na tabela de participação (modelo multi-professor)
        const { error: linkErr } = await admin.from('reuniao_professores').insert({
          reuniao_id:   novaReuniao.id,
          professor_id: resolvedProfId,
          status:       'pendente',
        })
        if (linkErr) {
          console.error(`[daily-import] Erro ao vincular professor em "${ev.summary}":`, linkErr.message)
        }

        // Log detalhado: quem ficou responsável
        const coordLog = coordId === row.user_id
          ? (row.google_email ?? row.user_id)
          : `${coordId} (via ${ev.organizer?.email ?? 'attendee'})`
        console.log(`[daily-import] ✓ "${ev.summary}" → prof: ${resolvedNome ?? 'sem vínculo'} | coord: ${coordLog}`)
        totalSaved++
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[daily-import] Erro para usuário ${row.user_id}:`, msg)
      totalErrors++
      errorDetails.push({ coordenador: row.google_email ?? row.user_id, erro: msg })

      // Token revogado → remove do banco para não tentar novamente
      if (msg.includes('invalid_grant')) {
        await admin.from('google_tokens').delete().eq('user_id', row.user_id)
        console.warn(`[daily-import] Token inválido removido: ${row.google_email ?? row.user_id}`)
      }
    }
  }

  const result = { saved: totalSaved, errors: totalErrors, errorDetails, date: today.toISOString() }
  console.log('[daily-import] Concluído:', result)

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
})
