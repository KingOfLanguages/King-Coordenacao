// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: nexus-mes-analise
//
// Primeira escrita do KTM no banco do King Nexus (até aqui só líamos, via
// nexus-sync). Permite colocar/resolver/reabrir um professor em "Mês de
// Análise" — no Nexus isso não é um status separado, é só um incident com
// problem_type = 'Mês de análise'. A escrita acontece SEMPRE no Nexus
// primeiro (com a mesma conta coordenacao usada pelo sync); só depois de
// confirmada é que o mirror local (nexus_incidents) é atualizado — o mirror
// nunca pode mostrar um estado que o Nexus não tem.
//
// Invocada por usuários logados do KTM (supabase.functions.invoke, JWT do
// usuário) — não é chamada por cron. Exige role admin ou coordenacao (mesma
// régua de canEdit em src/lib/permissions.ts, replicada aqui no servidor).
//
// Secrets: NEXUS_SUPABASE_URL, NEXUS_ANON_KEY, NEXUS_SYNC_EMAIL,
// NEXUS_SYNC_PASSWORD (mesmos do nexus-sync), SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY (já existentes).
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROBLEM_TYPE = 'Mês de análise'
const URGENCIAS = new Set(['Baixa', 'Média', 'Alta'])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

type Body =
  | { action: 'colocar';  professor_id: string; descricao: string; urgencia?: string }
  | { action: 'resolver'; incident_id: string; resultado: string }
  | { action: 'reabrir';  incident_id: string }

async function loginNexus() {
  const nexusUrl      = Deno.env.get('NEXUS_SUPABASE_URL')
  const nexusAnonKey  = Deno.env.get('NEXUS_ANON_KEY')
  const nexusEmail    = Deno.env.get('NEXUS_SYNC_EMAIL')
  const nexusPassword = Deno.env.get('NEXUS_SYNC_PASSWORD')
  if (!nexusUrl || !nexusAnonKey || !nexusEmail || !nexusPassword) {
    throw new Error('NEXUS_SUPABASE_URL / NEXUS_ANON_KEY / NEXUS_SYNC_EMAIL / NEXUS_SYNC_PASSWORD não configurados.')
  }
  const nexus = createClient(nexusUrl, nexusAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await nexus.auth.signInWithPassword({ email: nexusEmail, password: nexusPassword })
  if (error) throw new Error(`Login no Nexus falhou: ${error.message}`)
  return nexus
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Autorização: usuário admin/coordenacao autenticado ──────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return json({ error: 'Não autorizado.' }, 401)
  const { data: userData } = await admin.auth.getUser(token)
  const uid = userData?.user?.id
  if (!uid) return json({ error: 'Não autorizado.' }, 401)
  const { data: caller } = await admin.from('profiles').select('role, nome').eq('id', uid).maybeSingle()
  if (caller?.role !== 'admin' && caller?.role !== 'coordenacao') {
    return json({ error: 'Sem permissão.' }, 403)
  }
  const callerNome = caller.nome ?? 'KTM'

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  try {
    if (body.action === 'colocar') {
      const professorId = typeof body.professor_id === 'string' ? body.professor_id.trim() : ''
      const descricao   = typeof body.descricao === 'string' ? body.descricao.trim() : ''
      const urgencia    = URGENCIAS.has(body.urgencia ?? '') ? body.urgencia! : 'Média'
      if (!professorId) return json({ error: 'Professor é obrigatório.' }, 400)
      if (!descricao)   return json({ error: 'Descreva o motivo do Mês de Análise.' }, 400)

      const { data: professor } = await admin.from('professores').select('nome').eq('id', professorId).maybeSingle()
      if (!professor) return json({ error: 'Professor não encontrado.' }, 404)

      const { data: aberto } = await admin
        .from('nexus_incidents')
        .select('id')
        .eq('professor_id', professorId)
        .eq('problem_type', PROBLEM_TYPE)
        .eq('resolved', false)
        .maybeSingle()
      if (aberto) return json({ error: 'Este professor já está em Mês de Análise.' }, 409)

      const nowIso = new Date().toISOString()
      const row = {
        id: crypto.randomUUID(),
        teacher_name: professor.nome,
        coordinator: callerNome,
        problem_type: PROBLEM_TYPE,
        urgency: urgencia,
        description: descricao,
        solution: '',
        needs_follow_up: false,
        resolved: false,
        resolved_at: null as string | null,
        under_analysis: false,
        incident_mode: 'interno',
        image_urls: [] as string[],
        created_at: nowIso,
      }

      const nexus = await loginNexus()
      const { error: insertErr } = await nexus.from('incidents').insert(row)
      if (insertErr) return json({ error: `Falha ao gravar no Nexus: ${insertErr.message}` }, 502)

      await admin.from('nexus_incidents').upsert(
        { ...row, professor_id: professorId, synced_at: nowIso },
        { onConflict: 'id' },
      )

      return json({ ok: true, incident: { ...row, professor_id: professorId } })
    }

    if (body.action === 'resolver') {
      const incidentId = typeof body.incident_id === 'string' ? body.incident_id.trim() : ''
      const resultado   = typeof body.resultado === 'string' ? body.resultado.trim() : ''
      if (!incidentId) return json({ error: 'Incidente é obrigatório.' }, 400)
      if (!resultado)  return json({ error: 'Escreva o resultado do Mês de Análise.' }, 400)

      const { data: incidente } = await admin
        .from('nexus_incidents')
        .select('id, problem_type')
        .eq('id', incidentId)
        .maybeSingle()
      if (!incidente) return json({ error: 'Incidente não encontrado.' }, 404)
      if (incidente.problem_type !== PROBLEM_TYPE) return json({ error: 'Este incidente não é de Mês de Análise.' }, 400)

      const nowIso = new Date().toISOString()
      const nexus = await loginNexus()
      const { error: updateErr } = await nexus
        .from('incidents')
        .update({ resolved: true, resolved_at: nowIso, solution: resultado })
        .eq('id', incidentId)
      if (updateErr) return json({ error: `Falha ao gravar no Nexus: ${updateErr.message}` }, 502)

      await admin
        .from('nexus_incidents')
        .update({ resolved: true, resolved_at: nowIso, solution: resultado, synced_at: nowIso })
        .eq('id', incidentId)

      return json({ ok: true, incident: { id: incidentId, resolved: true, resolved_at: nowIso, solution: resultado } })
    }

    if (body.action === 'reabrir') {
      const incidentId = typeof body.incident_id === 'string' ? body.incident_id.trim() : ''
      if (!incidentId) return json({ error: 'Incidente é obrigatório.' }, 400)

      const { data: incidente } = await admin
        .from('nexus_incidents')
        .select('id, problem_type')
        .eq('id', incidentId)
        .maybeSingle()
      if (!incidente) return json({ error: 'Incidente não encontrado.' }, 404)
      if (incidente.problem_type !== PROBLEM_TYPE) return json({ error: 'Este incidente não é de Mês de Análise.' }, 400)

      const nexus = await loginNexus()
      const { error: updateErr } = await nexus
        .from('incidents')
        .update({ resolved: false, resolved_at: null })
        .eq('id', incidentId)
      if (updateErr) return json({ error: `Falha ao gravar no Nexus: ${updateErr.message}` }, 502)

      await admin
        .from('nexus_incidents')
        .update({ resolved: false, resolved_at: null, synced_at: new Date().toISOString() })
        .eq('id', incidentId)

      return json({ ok: true, incident: { id: incidentId, resolved: false, resolved_at: null } })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[nexus-mes-analise] Erro:', msg)
    return json({ error: msg }, 502)
  }
})
