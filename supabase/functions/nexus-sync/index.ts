// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: nexus-sync
//
// Replica o Supabase do King Nexus (app Lovable de gestão de ocorrências,
// ref ffsydgugewvboicvwhzu) para as tabelas-espelho nexus_* deste projeto.
// Roda via pg_cron a cada 30 min. Full sync a cada execução — a origem não
// tem updated_at em incidents, então sincronização incremental não é
// confiável; os volumes (milhares de linhas) permitem upsert completo.
//
// STATUS (2026-07-03): King Nexus está sendo descontinuado. Este sync foi
// religado só como REDE DE SEGURANÇA temporária — enquanto alguém ainda
// possa estar lançando dado direto no Nexus, isso garante que nada se perde
// até a descontinuação de fato. Pode ser desligado a qualquer momento
// (cron.unschedule('king-nexus-sync')) sem quebrar nada: nexus_incidents/
// nexus_teacher_tracking/nexus_teacher_recurrences/nexus_mes_analise_alerts
// simplesmente ficam congeladas no último estado. Ver [[ktm-nexus-sync]].
//
// Fluxo:
//   1. Lê professores (id, nome) daqui e monta o índice de name-match
//      (mesma normalização do daily-import: NFD sem acentos + caixa baixa)
//   2. Loga no Nexus com e-mail+senha de uma conta coordenacao (não temos
//      acesso ao dashboard do projeto Lovable pra obter a service role de
//      lá) e lê paginado: incidents, teacher_tracking, teacher_recurrences,
//      mes_analise_alerts — o RLS do Nexus limita a leitura ao que o papel
//      coordenacao enxerga (que é tudo que interessa)
//   3. Upsert em lote nos espelhos (PK = id original do Nexus), preenchendo
//      professor_id quando o match por nome é inequívoco
//   4. Se não houve erro, remove linhas que sumiram da origem
//      (synced_at < início da execução) — EXCETO nexus_incidents com
//      problem_type = 'Mês de análise', que desde 2026-07-03 são gravadas
//      só localmente por nexus-mes-analise (não vêm mais do Nexus) e por
//      isso nunca devem ser tratadas como "sumiram da origem"
//
// Secrets necessários:
//   NEXUS_SUPABASE_URL, NEXUS_ANON_KEY           (projeto do Nexus)
//   NEXUS_SYNC_EMAIL, NEXUS_SYNC_PASSWORD        (conta coordenacao no Nexus)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY      (já existentes no projeto)
//   CRON_SECRET (opcional — se configurado, exige Authorization: Bearer <CRON_SECRET>)
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PAGE = 1000
const CHUNK = 500

// ─── Name-match (mesma normalização do daily-import) ─────────────────────────

const STOPWORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e'])

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function parts(nomeNorm: string): string[] {
  return nomeNorm.split(' ').filter(p => p.length > 1 && !STOPWORDS.has(p))
}

interface ProfessorIdx { id: string; nomeNorm: string; nameParts: string[] }

class ProfessorMatcher {
  private byNomeNorm = new Map<string, string[]>()
  private idx: ProfessorIdx[] = []
  private cache = new Map<string, string | null>()
  readonly semMatch = new Set<string>()

  constructor(professores: { id: string; nome: string }[]) {
    for (const p of professores) {
      const nomeNorm = norm(p.nome)
      this.idx.push({ id: p.id, nomeNorm, nameParts: parts(nomeNorm) })
      const ids = this.byNomeNorm.get(nomeNorm) ?? []
      ids.push(p.id)
      this.byNomeNorm.set(nomeNorm, ids)
    }
  }

  match(nome: string | null | undefined): string | null {
    if (!nome) return null
    const n = norm(nome)
    if (!n) return null
    if (this.cache.has(n)) return this.cache.get(n)!

    let result: string | null = null

    // 1 — igualdade exata do nome normalizado (só se único; homônimos → null).
    const exact = this.byNomeNorm.get(n)
    if (exact?.length === 1) {
      result = exact[0]
    } else if (!exact) {
      // 2 — containment de partes nos dois sentidos ("Maria Silva" ⊆
      //     "Maria Silva Santos" e vice-versa). Só aceita se UM professor
      //     satisfaz — qualquer ambiguidade fica sem match.
      const nParts = parts(n)
      if (nParts.length) {
        const candidatos = this.idx.filter(p =>
          p.nameParts.length > 0 && (
            p.nameParts.every(part => nParts.includes(part)) ||
            nParts.every(part => p.nameParts.includes(part))
          ),
        )
        if (candidatos.length === 1) result = candidatos[0].id
      }
    }

    if (result === null) this.semMatch.add(nome)
    this.cache.set(n, result)
    return result
  }
}

// ─── Leitura paginada (o PostgREST limita a 1000 linhas por request) ─────────

async function fetchAll<T>(client: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as T[]))
    if (!data || data.length < PAGE) break
  }
  return rows
}

async function upsertChunks(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await client.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict: 'id' })
    if (error) throw new Error(`upsert ${table}: ${error.message}`)
  }
}

async function deleteStale(
  client: SupabaseClient, table: string, runStart: string, excludeProblemType?: string,
): Promise<number> {
  let query = client.from(table).delete({ count: 'exact' }).lt('synced_at', runStart)
  if (excludeProblemType) query = query.neq('problem_type', excludeProblemType)
  const { count, error } = await query
  if (error) throw new Error(`cleanup ${table}: ${error.message}`)
  return count ?? 0
}

// ─── Tipos das linhas da origem ───────────────────────────────────────────────

interface NexusIncident {
  id: string; teacher_name: string; coordinator: string; problem_type: string
  urgency: string; description: string; solution: string; needs_follow_up: boolean
  resolved: boolean; resolved_at: string | null; under_analysis: boolean
  incident_mode: string; image_urls: string[]; created_at: string
}

interface NexusTracking {
  id: string; teacher_name: string; message_stage: number
  first_message_sent: boolean; first_message_date: string | null
  second_message_sent: boolean; second_message_date: string | null
  third_message_sent: boolean; third_message_date: string | null
  next_message_due: string | null
  forwarded_to_coordination: boolean; forwarded_to_coordination_date: string | null
  problem_resolved: boolean; resolved_at: string | null
  recurrence_count: number; last_recurrence_at: string | null
  created_at: string; updated_at: string
}

interface NexusRecurrence {
  id: string; teacher_id: string; incident_id: string | null
  occurred_at: string; source: string; created_at: string
}

interface NexusAlert {
  id: string; canonical_name: string; level: string; total_count: number
  breakdown: unknown; variations: unknown; created_at: string
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  const auth       = req.headers.get('Authorization') ?? ''
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return new Response('Não autorizado.', { status: 401 })
  }

  const nexusUrl      = Deno.env.get('NEXUS_SUPABASE_URL')
  const nexusAnonKey  = Deno.env.get('NEXUS_ANON_KEY')
  const nexusEmail    = Deno.env.get('NEXUS_SYNC_EMAIL')
  const nexusPassword = Deno.env.get('NEXUS_SYNC_PASSWORD')
  if (!nexusUrl || !nexusAnonKey || !nexusEmail || !nexusPassword) {
    return new Response(
      JSON.stringify({ error: 'NEXUS_SUPABASE_URL / NEXUS_ANON_KEY / NEXUS_SYNC_EMAIL / NEXUS_SYNC_PASSWORD não configurados.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const nexus = createClient(nexusUrl, nexusAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: loginErr } = await nexus.auth.signInWithPassword({
    email: nexusEmail,
    password: nexusPassword,
  })
  if (loginErr) {
    console.error('[nexus-sync] Login no Nexus falhou:', loginErr.message)
    return new Response(
      JSON.stringify({ error: `Login no Nexus falhou: ${loginErr.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const runStart = new Date().toISOString()
  const erros: string[] = []
  const stats: Record<string, Record<string, number>> = {}

  try {
    // ── Índice de professores para o name-match ─────────────────────────────
    const professores = await fetchAll<{ id: string; nome: string }>(admin, 'professores', 'id, nome')
    const matcher = new ProfessorMatcher(professores)

    // ── 1. incidents ────────────────────────────────────────────────────────
    const incidents = await fetchAll<NexusIncident>(nexus, 'incidents', '*')
    const incidentIds = new Set(incidents.map(i => i.id))
    {
      const rows = incidents.map(i => ({
        id: i.id,
        teacher_name: i.teacher_name,
        coordinator: i.coordinator,
        problem_type: i.problem_type,
        urgency: i.urgency,
        description: i.description,
        solution: i.solution ?? '',
        needs_follow_up: i.needs_follow_up,
        resolved: i.resolved,
        resolved_at: i.resolved_at,
        under_analysis: i.under_analysis,
        incident_mode: i.incident_mode ?? 'professor',
        image_urls: i.image_urls ?? [],
        created_at: i.created_at,
        // incident_mode 'interno' é sobre COMO a ocorrência foi registrada
        // (tipos internos como No-Show, Erros de lançamento, Mês de análise —
        // ver INTERNAL_PROBLEM_TYPES no Nexus), não sobre ausência de professor.
        // teacher_name segue sendo o nome real do professor nesses casos, então
        // o match por nome vale igual — só falha (null) pra placeholders
        // genuínos como "Geral"/"Suporte"/"SEM PROFESSOR".
        professor_id: matcher.match(i.teacher_name),
        synced_at: runStart,
      }))
      await upsertChunks(admin, 'nexus_incidents', rows)
      stats.incidents = {
        recebidos: rows.length,
        com_professor: rows.filter(r => r.professor_id).length,
      }
    }

    // ── 2. teacher_tracking ─────────────────────────────────────────────────
    const tracking = await fetchAll<NexusTracking>(nexus, 'teacher_tracking', '*')
    const trackingIds = new Set(tracking.map(t => t.id))
    {
      const rows = tracking.map(t => ({
        id: t.id,
        teacher_name: t.teacher_name,
        message_stage: t.message_stage ?? 0,
        first_message_sent: t.first_message_sent,
        first_message_date: t.first_message_date,
        second_message_sent: t.second_message_sent,
        second_message_date: t.second_message_date,
        third_message_sent: t.third_message_sent,
        third_message_date: t.third_message_date,
        next_message_due: t.next_message_due,
        forwarded_to_coordination: t.forwarded_to_coordination,
        forwarded_to_coordination_date: t.forwarded_to_coordination_date,
        problem_resolved: t.problem_resolved,
        resolved_at: t.resolved_at,
        recurrence_count: t.recurrence_count ?? 0,
        last_recurrence_at: t.last_recurrence_at,
        created_at: t.created_at,
        updated_at: t.updated_at,
        professor_id: matcher.match(t.teacher_name),
        synced_at: runStart,
      }))
      await upsertChunks(admin, 'nexus_teacher_tracking', rows)
      stats.teacher_tracking = {
        recebidos: rows.length,
        com_professor: rows.filter(r => r.professor_id).length,
      }
    }

    // ── 3. teacher_recurrences (depois dos pais — FKs) ──────────────────────
    const recurrences = await fetchAll<NexusRecurrence>(nexus, 'teacher_recurrences', '*')
    {
      const rows = recurrences
        .filter(r => trackingIds.has(r.teacher_id))
        .map(r => ({
          id: r.id,
          teacher_id: r.teacher_id,
          // Origem pode referenciar incidente já removido lá — não quebra o FK.
          incident_id: r.incident_id && incidentIds.has(r.incident_id) ? r.incident_id : null,
          occurred_at: r.occurred_at,
          source: r.source,
          created_at: r.created_at,
          synced_at: runStart,
        }))
      await upsertChunks(admin, 'nexus_teacher_recurrences', rows)
      stats.teacher_recurrences = { recebidos: recurrences.length, gravados: rows.length }
    }

    // ── 4. mes_analise_alerts ───────────────────────────────────────────────
    const alerts = await fetchAll<NexusAlert>(nexus, 'mes_analise_alerts', '*')
    {
      const rows = alerts.map(a => ({
        id: a.id,
        canonical_name: a.canonical_name,
        level: a.level,
        total_count: a.total_count,
        breakdown: a.breakdown ?? [],
        variations: a.variations ?? [],
        created_at: a.created_at,
        professor_id: matcher.match(a.canonical_name),
        synced_at: runStart,
      }))
      await upsertChunks(admin, 'nexus_mes_analise_alerts', rows)
      stats.mes_analise_alerts = {
        recebidos: rows.length,
        com_professor: rows.filter(r => r.professor_id).length,
      }
    }

    // ── 5. Remove o que sumiu da origem (só com o sync 100% ok) ─────────────
    // nexus_incidents com problem_type 'Mês de análise' são canônicos do KTM
    // desde 2026-07-03 (nexus-mes-analise não escreve mais no Nexus) — nunca
    // aparecem nesta leitura, então ficam de fora da limpeza por staleness.
    stats.removidos = {
      teacher_recurrences: await deleteStale(admin, 'nexus_teacher_recurrences', runStart),
      incidents:           await deleteStale(admin, 'nexus_incidents', runStart, 'Mês de análise'),
      teacher_tracking:    await deleteStale(admin, 'nexus_teacher_tracking', runStart),
      mes_analise_alerts:  await deleteStale(admin, 'nexus_mes_analise_alerts', runStart),
    }

    const nomesSemMatch = [...matcher.semMatch].sort()
    const result = {
      stats,
      nomes_sem_match: nomesSemMatch.slice(0, 50),
      nomes_sem_match_total: nomesSemMatch.length,
    }
    console.log('[nexus-sync] Concluído:', JSON.stringify(result))
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    erros.push(msg)
    console.error('[nexus-sync] Erro:', msg)
    return new Response(JSON.stringify({ error: msg, stats, erros }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
