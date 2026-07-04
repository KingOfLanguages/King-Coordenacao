// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: nexus-mes-analise
//
// Permite colocar/resolver/reabrir um professor em "Mês de Análise" — modelado
// como uma linha de problem_type = 'Mês de análise' em nexus_incidents, mesmo
// formato herdado do King Nexus. Desde 2026-07-03, nexus_incidents é a fonte
// canônica desse fluxo — a função não escreve mais no banco do Nexus (o
// King Nexus está sendo descontinuado; ver [[ktm-nexus-sync]] / memória do
// projeto). O nexus-sync que alimentava nexus_incidents por leitura também
// foi desativado no mesmo momento, então não há mais risco de um sync
// apagar registros criados aqui por não existirem na origem.
//
// Invocada por usuários logados do KTM (supabase.functions.invoke, JWT do
// usuário) — não é chamada por cron. Exige role admin ou coordenacao (mesma
// régua de canEdit em src/lib/permissions.ts, replicada aqui no servidor).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (já existentes).
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

      const { error: insertErr } = await admin
        .from('nexus_incidents')
        .insert({ ...row, professor_id: professorId, synced_at: nowIso })
      if (insertErr) return json({ error: `Falha ao gravar: ${insertErr.message}` }, 502)

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
      const { error: updateErr } = await admin
        .from('nexus_incidents')
        .update({ resolved: true, resolved_at: nowIso, solution: resultado, synced_at: nowIso })
        .eq('id', incidentId)
      if (updateErr) return json({ error: `Falha ao gravar: ${updateErr.message}` }, 502)

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

      const { error: updateErr } = await admin
        .from('nexus_incidents')
        .update({ resolved: false, resolved_at: null, synced_at: new Date().toISOString() })
        .eq('id', incidentId)
      if (updateErr) return json({ error: `Falha ao gravar: ${updateErr.message}` }, 502)

      return json({ ok: true, incident: { id: incidentId, resolved: false, resolved_at: null } })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[nexus-mes-analise] Erro:', msg)
    return json({ error: msg }, 502)
  }
})
