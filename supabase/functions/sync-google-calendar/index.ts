/**
 * Edge Function: sync-google-calendar
 *
 * Importa reuniões do Google Calendar para a tabela `reunioes`.
 * Deve ser chamada por um cron diário ou manualmente via POST.
 *
 * Variáveis de ambiente necessárias (Supabase → Settings → Edge Functions):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL  — e-mail da service account
 *   GOOGLE_PRIVATE_KEY            — chave privada (RSA) da service account
 *   GOOGLE_CALENDAR_IDS           — IDs separados por vírgula
 *   SUPABASE_URL                  — URL do projeto (já injetada automaticamente)
 *   SUPABASE_SERVICE_ROLE_KEY     — chave service role (já injetada automaticamente)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ─── Gera JWT para autenticação com Google API ────────────────────────────────
async function getGoogleAccessToken(): Promise<string> {
  const email      = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')!
  const privateKey = Deno.env.get('GOOGLE_PRIVATE_KEY')!.replace(/\\n/g, '\n')

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  // Importa a chave privada RSA
  const keyData = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  // Monta o JWT manualmente
  const header  = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body    = btoa(JSON.stringify(payload))
  const message = `${header}.${body}`

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(message)
  )
  const jwt = `${message}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`

  // Troca JWT pelo access token
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const { access_token } = await resp.json()
  return access_token
}

// ─── Busca eventos do Calendar ─────────────────────────────────────────────
async function buscarEventos(calendarId: string, token: string, dataMin: string, dataMax: string) {
  const params = new URLSearchParams({
    timeMin: dataMin,
    timeMax: dataMax,
    singleEvents: 'true',
    orderBy: 'startTime',
  })

  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  const json = await resp.json()
  return json.items ?? []
}

// ─── Verifica se é uma reunião com professor ──────────────────────────────
function ehReuniaoDeTeacher(titulo: string): boolean {
  const padrao = /reunião|reuniao|meet|1:1|conversa|acompanhamento/i
  return padrao.test(titulo)
}

// ─── Extrai nome do professor do título ──────────────────────────────────
function extrairNome(titulo: string): string {
  return titulo
    .replace(/reunião|reuniao|meet|1:1|conversa|acompanhamento/gi, '')
    .replace(/[-|–—:]/g, '')
    .trim()
}

// ─── Busca o professor mais próximo por nome ──────────────────────────────
async function matchProfessor(nome: string): Promise<string | null> {
  if (!nome) return null

  const { data } = await supabase
    .from('professores')
    .select('id, nome')
    .ilike('nome', `%${nome.split(' ')[0]}%`)
    .limit(1)

  return data?.[0]?.id ?? null
}

// ─── Handler principal ────────────────────────────────────────────────────
Deno.serve(async () => {
  try {
    const calendarIds = (Deno.env.get('GOOGLE_CALENDAR_IDS') ?? '').split(',').map(s => s.trim()).filter(Boolean)

    if (calendarIds.length === 0) {
      return new Response(JSON.stringify({ erro: 'GOOGLE_CALENDAR_IDS não configurado.' }), { status: 400 })
    }

    const token   = await getGoogleAccessToken()
    const dataMin = new Date().toISOString()
    const dataMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // próximos 7 dias

    let importados = 0
    let ignorados  = 0

    for (const calId of calendarIds) {
      const eventos = await buscarEventos(calId, token, dataMin, dataMax)

      for (const evento of eventos) {
        const titulo = evento.summary ?? ''
        if (!ehReuniaoDeTeacher(titulo)) { ignorados++; continue }

        // Evita duplicatas pelo google_event_id
        const { data: existente } = await supabase
          .from('reunioes')
          .select('id')
          .eq('google_event_id', evento.id)
          .single()

        if (existente) { ignorados++; continue }

        const nomeProfessor  = extrairNome(titulo)
        const professorId    = await matchProfessor(nomeProfessor)
        const dataEvento     = evento.start?.dateTime ?? evento.start?.date

        await supabase.from('reunioes').insert({
          professor_id:    professorId,
          data:            dataEvento,
          status:          'pendente',
          google_event_id: evento.id,
          notas:           evento.description ?? null,
        })

        importados++
      }
    }

    return new Response(
      JSON.stringify({ sucesso: true, importados, ignorados }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ erro: String(err) }), { status: 500 })
  }
})
