// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: daily-import
//
// Roda automaticamente via pg_cron (a cada 10 min, todos os dias).
// Para cada coordenador com refresh_token salvo:
//   1. Obtém um access_token novo via Google OAuth2
//   2. Busca eventos do Google Calendar de 90 dias atrás até 90 dias à frente,
//      paginando via nextPageToken (sem isso, calendários com mais de 500
//      eventos no período perdiam o excedente silenciosamente)
//   3. Classifica cada evento em 'professor' (reunião 1:1 com professor) ou
//      'interna' (reunião só entre gente conhecida da King — equipe de
//      coordenação, liderança — sem nenhum participante externo). Eventos
//      sem nenhum participante relevante são ignorados.
//   4. Determina o coordenador_id correto pelo email do organizador/participante
//   5. Faz match de professores pelo nome (só pra tipo 'professor')
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

async function buscarEventosPeriodo(token: string, inicio: Date, fim: Date): Promise<CalEvent[]> {
  const baseParams = {
    timeMin:      inicio.toISOString(),
    timeMax:      fim.toISOString(),
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '500',
  }

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
      // Pagina até esgotar nextPageToken — sem isso, calendários com mais de
      // 500 eventos no período perdiam o excedente silenciosamente.
      let pageToken: string | undefined
      do {
        const params = new URLSearchParams({
          ...baseParams,
          ...(pageToken ? { pageToken } : {}),
        })
        const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(cal.id)}/events?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) break
        const json = await res.json()
        all = all.concat(json.items ?? [])
        pageToken = json.nextPageToken
      } while (pageToken)
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

type TipoReuniao = 'professor' | 'interna'

/**
 * Classifica o evento. 'professor' tem prioridade quando há sinal de reunião
 * 1:1 (padrão de título ou participante externo) — mesma heurística de
 * antes. 'interna' cobre reunião de equipe/liderança: sem participante
 * externo, mas com pelo menos uma pessoa conhecida da King (coordEmails)
 * além do dono do calendário — isso pega daily/standup/sync/treinamento que
 * o BLOCKLIST descartaria, desde que seja reunião de verdade (com convite).
 * Sem nenhum participante relevante (compromisso pessoal, bloqueio de
 * agenda) retorna null e o evento é ignorado.
 */
function classificarEvento(ev: CalEvent, coordEmails: Set<string>): TipoReuniao | null {
  if (!ev.start.dateTime) return null
  const title = ev.summary ?? ''
  const attendees = (ev.attendees ?? []).filter(a => !a.self && a.email)
  const conhecidos = attendees.filter(a => coordEmails.has(a.email.toLowerCase()))
  const externos   = attendees.filter(a => !coordEmails.has(a.email.toLowerCase()))

  if (!BLOCKLIST.some(rx => rx.test(title))) {
    if (MEETING_PATTERNS.some(rx => rx.test(title))) return 'professor'
    if (externos.length >= 1) return 'professor'
  }

  if (conhecidos.length >= 1) return 'interna'

  return null
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

interface ComNomeNormalizado { nomeNorm: string; nameParts: string[] }

/**
 * Pré-computa nome normalizado + partes de cada professor UMA vez, fora do
 * loop de eventos. Com ~850 professores reais e centenas de eventos por
 * coordenador (janela de 180 dias), recalcular norm() — normalize NFD +
 * regex — a cada combinação evento×professor (centenas de milhares de
 * chamadas) foi o que estourava o limite de CPU da Edge Function. Antes
 * disso nunca apareceu porque a tabela `professores` estava vazia.
 */
function precomputeProfessores<T extends { id: string; nome: string }>(
  professores: T[],
): (T & ComNomeNormalizado)[] {
  return professores.map(p => {
    const nomeNorm = norm(p.nome)
    return {
      ...p,
      nomeNorm,
      nameParts: nomeNorm.split(' ').filter(part => part.length > 1 && !['de', 'da', 'do', 'dos', 'das', 'e'].includes(part)),
    }
  })
}

function matchProfessor<T extends { id: string; nome: string } & ComNomeNormalizado>(ev: CalEvent, professores: T[]): T | null {
  if (!professores.length) return null
  const titleNorm    = norm(ev.summary ?? '')
  const extracted    = extrairNomeDeTitulo(ev.summary ?? '').map(norm)
  const attendeeNorm = (ev.attendees ?? []).filter(a => !a.self).map(a => norm(a.displayName ?? '')).filter(Boolean)
  const scores: Array<{ prof: T; score: number }> = []

  for (const prof of professores) {
    const { nomeNorm, nameParts } = prof

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

  // Mapa: email (lower) → supabase user_id.
  // Fontes mescladas (no caso comum todas apontam pro mesmo UUID):
  //   - google_tokens.google_email → conta que conectou a automação
  //   - profiles.email             → e-mail de cadastro/login (fonte primária)
  //   - profiles.google_email      → e-mail alternativo (quando a agenda usa outro)
  // ex: { 'coordenacaoking7@gmail.com': 'uuid-ariel', 'caio.velloso.king@gmail.com': 'uuid-caio', ... }
  const emailToUserId: Record<string, string> = {}
  for (const row of tokenRows ?? []) {
    if (row.google_email) {
      emailToUserId[row.google_email.toLowerCase()] = row.user_id
    }
  }

  // E-mail de cadastro (profiles.email) atribui o coordenador direto, sem precisar
  // recadastrar nada à mão. O google_email fica só como alias extra pro caso em que
  // a conexão OAuth é feita por uma conta única / a agenda usa outro e-mail.
  const { data: coordProfiles } = await admin
    .from('profiles')
    .select('id, email, google_email')

  for (const p of coordProfiles ?? []) {
    if (p.email)        emailToUserId[p.email.toLowerCase()]        = p.id
    if (p.google_email) emailToUserId[p.google_email.toLowerCase()] = p.id
  }

  // Set de emails de coordenadores — usado para excluir da busca de email do professor
  const coordEmails = new Set(Object.keys(emailToUserId))
  console.log('[daily-import] Mapa de coordenadores:', [...coordEmails])

  // Professores ativos (matching por nome) + e-mails conhecidos (matching por e-mail)
  const { data: professoresRaw } = await admin
    .from('professores')
    .select('id, nome')
    .eq('saiu',  false)
    .eq('pausa', false)
  const professores = precomputeProfessores(professoresRaw ?? [])

  const { data: emailRows } = await admin
    .from('professor_emails')
    .select('professor_id, email')

  const emailToProfessorId: Record<string, string> = {}
  for (const r of emailRows ?? []) {
    if (r.email) emailToProfessorId[r.email.toLowerCase()] = r.professor_id
  }

  const today = new Date()
  let totalErrors = 0
  const errorDetails: { coordenador: string; erro: string }[] = []

  // Candidatos de todos os coordenadores, coletados sem tocar o banco —
  // a gravação acontece em lote no final (ver comentário abaixo do motivo).
  type Candidato = {
    google_event_id: string
    coordenador_id:  string
    professor_id:    string | null
    professor_email: string | null
    tipo_reuniao:    TipoReuniao
    pauta:           string | null
    participantes_emails: string[]
    data:            string
    titulo:          string
    meet_link:       string | null
  }
  const candidatos: Candidato[] = []

  for (const row of tokenRows ?? []) {
    try {
      console.log(`[daily-import] Processando: ${row.google_email ?? row.user_id}`)

      // 1 — Refresh access token
      const accessToken = await refreshAccessToken(row.refresh_token)

      // 2 — Busca eventos de 90 dias atrás até 90 dias à frente (deduplicação
      //     via google_event_id). Janela bidirecional: cobre reuniões passadas
      //     que não tinham sido capturadas ainda, e futuras com boa folga.
      const periodoFim = new Date(today)
      periodoFim.setDate(periodoFim.getDate() + 90)
      periodoFim.setHours(23, 59, 59, 999)
      const periodoInicio = new Date(today)
      periodoInicio.setDate(periodoInicio.getDate() - 90)
      periodoInicio.setHours(0, 0, 0, 0)
      const events   = await buscarEventosPeriodo(accessToken, periodoInicio, periodoFim)
      const classificados = events
        .map(ev => ({ ev, tipo: classificarEvento(ev, coordEmails) }))
        .filter((c): c is { ev: CalEvent; tipo: TipoReuniao } => c.tipo !== null)

      console.log(`[daily-import] ${classificados.length} reunião(ões) encontrada(s) para ${row.google_email ?? row.user_id}`)

      // 3 — Resolve coordenador/professor em memória (sem chamadas ao banco
      //     por evento — com a janela de 180 dias isso pode significar
      //     centenas de eventos por coordenador; 3 round-trips sequenciais
      //     por evento já estourou o limite de recursos da Edge Function).
      for (const { ev, tipo } of classificados) {
        const coordId  = resolveCoordId(ev, row.user_id, emailToUserId)
        const startDt  = new Date(ev.start.dateTime ?? ev.start.date ?? '')
        const meetHref = ev.hangoutLink ?? ev.htmlLink ?? null

        if (tipo === 'interna') {
          const participantes = [...new Set(
            (ev.attendees ?? []).map(a => a.email?.toLowerCase()).filter((e): e is string => !!e),
          )]
          candidatos.push({
            google_event_id: ev.id,
            coordenador_id:  coordId,
            professor_id:    null,
            professor_email: null,
            tipo_reuniao:    'interna',
            pauta:           ev.description?.trim().slice(0, 2000) || null,
            participantes_emails: participantes,
            data:            startDt.toISOString(),
            titulo:          ev.summary,
            meet_link:       meetHref,
          })
          continue
        }

        const profEmail = extractProfessorEmail(ev, coordEmails)

        // Match por e-mail exato (mais confiável) > match por nome no título (fallback)
        const emailMatchId = profEmail ? emailToProfessorId[profEmail.toLowerCase()] : undefined
        const profByName   = matchProfessor(ev, professores)
        const resolvedProfId = emailMatchId ?? profByName?.id ?? null

        candidatos.push({
          google_event_id: ev.id,
          coordenador_id:  coordId,
          professor_id:    resolvedProfId,
          professor_email: profEmail,
          tipo_reuniao:    'professor',
          pauta:           null,
          participantes_emails: [],
          data:            startDt.toISOString(),
          titulo:          ev.summary,
          meet_link:       meetHref,
        })
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

  // 4 — Grava em lote. Dedupe local por google_event_id (o mesmo evento pode
  //     aparecer em mais de um calendário — ex: dois coordenadores como
  //     attendees) mantendo a primeira ocorrência, e upsert com
  //     ignoreDuplicates para não sobrescrever reuniões já importadas
  //     (mesmo comportamento do "já existe — pulando" de antes).
  const porEventoId = new Map<string, Candidato>()
  for (const c of candidatos) {
    if (!porEventoId.has(c.google_event_id)) porEventoId.set(c.google_event_id, c)
  }
  const paraGravar = [...porEventoId.values()]

  let totalSaved = 0
  const CHUNK = 500
  for (let i = 0; i < paraGravar.length; i += CHUNK) {
    const chunk = paraGravar.slice(i, i + CHUNK)
    const { data: inseridas, error: upsertErr } = await admin
      .from('reunioes')
      .upsert(
        chunk.map(c => ({
          coordenador_id:  c.coordenador_id,
          professor_id:    c.professor_id,
          professor_email: c.professor_email,
          tipo_reuniao:    c.tipo_reuniao,
          pauta:           c.pauta,
          participantes_emails: c.participantes_emails,
          data:            c.data,
          titulo:          c.titulo,
          google_event_id: c.google_event_id,
          meet_link:       c.meet_link,
          status:          'pendente',
        })),
        { onConflict: 'google_event_id', ignoreDuplicates: true },
      )
      .select('id, professor_id, tipo_reuniao')

    if (upsertErr) {
      console.error('[daily-import] Erro no upsert em lote de reunioes:', upsertErr.message)
      totalErrors += chunk.length
      continue
    }

    totalSaved += inseridas?.length ?? 0

    // Vínculo de participação (modelo multi-professor) — só para reuniões
    // tipo 'professor' (interna não tem professor pra vincular) e efetivamente
    // novas (upsert com ignoreDuplicates não retorna as que já existiam, então
    // não duplicamos o vínculo).
    const links = (inseridas ?? [])
      .filter(r => r.tipo_reuniao === 'professor')
      .map(r => ({
        reuniao_id:   r.id,
        professor_id: r.professor_id,
        status:       'pendente' as const,
      }))
    if (links.length) {
      const { error: linkErr } = await admin.from('reuniao_professores').insert(links)
      if (linkErr) console.error('[daily-import] Erro ao vincular professores em lote:', linkErr.message)
    }
  }

  const result = {
    saved: totalSaved,
    candidatos: candidatos.length,
    duplicadosNoLote: candidatos.length - paraGravar.length,
    errors: totalErrors,
    errorDetails,
    date: today.toISOString(),
  }
  console.log('[daily-import] Concluído:', result)

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
})
