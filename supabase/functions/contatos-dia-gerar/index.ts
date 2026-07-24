// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: contatos-dia-gerar
//
// Gera a lista diária de "Mensagens do dia" de TODOS os coordenadores de uma vez
// (roda via pg_cron de madrugada). É o passo que o RPC lazy `gerar_contatos_dia`
// não consegue fazer sozinho, porque precisa de duas coisas fora do alcance de um
// RPC puro do Postgres:
//   1. a fila de bloqueio de agenda por pendência, que só existe na API King
//      (mesmo login/host do pendencias-lancamento / kms-api-sync); e
//   2. um sorteio GLOBAL dos professores em estágio 3 (bloqueados 5+ dias) entre
//      todos os coordenadores — decisão única, não por-coordenador.
//
// Régua (motor no back-end King):
//   estágio 2 = bloqueada 3–4 dias  → PRIORIDADE nos 20 do dono do grupo
//   estágio 3 = bloqueada 5+  dias  → EXTRA além dos 20, sorteio global (~1/3 por
//               coordenador, preferindo o dono, teto +10, semeado pela data)
//
// A materialização de cada lista é idempotente por (coordenador, dia) e roda no
// SQL `gerar_contatos_dia_batch`. Se a API King falhar, ainda gera os 20 normais
// (extras/prioridade vazios) — ninguém fica sem lista.
//
// Auth: cron manda `Authorization: Bearer <SERVICE_ROLE_KEY>`. Aceita também
// `Bearer <CRON_SECRET>` (se configurado) e o JWT de um admin (disparo manual).
//
// Secrets: KMS_API_BASE_URL (ou PENDENCIAS_API_BASE_URL), KMS_API_EMAIL,
//   KMS_API_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET (opc).
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LIMITE_NORMAL = 20 // teto da lista normal por coordenador
const TETO_EXTRA     = 10 // "até 10 a mais" de estágio 3 por coordenador

const BASE     = Deno.env.get('PENDENCIAS_API_BASE_URL') ?? Deno.env.get('KMS_API_BASE_URL') ?? ''
const EMAIL    = Deno.env.get('KMS_API_EMAIL') ?? ''
const PASSWORD = Deno.env.get('KMS_API_PASSWORD') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function resp(body: unknown, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' },
  })
}

// ── API King ──────────────────────────────────────────────────────────────────
interface Envelope { success?: boolean; message?: string | null; errorMessage?: string | null; object?: unknown }

interface FilaItem {
  id_Professor: number
  estagio: number
  dias: number
  agendaBloqueada: boolean
  aulasPendentes: number
}

async function kingLogin(): Promise<string> {
  const res = await fetch(`${BASE}/api/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: false }),
  })
  if (!res.ok) throw new Error(`Login na API King falhou (${res.status}).`)
  const j = await res.json()
  const token = j?.object?.accessToken ?? j?.message
  if (!token) throw new Error('Login na API King não retornou accessToken.')
  return token
}

async function buscarFila(): Promise<FilaItem[]> {
  const token = await kingLogin()
  const res = await fetch(`${BASE}/api/PendenciaLancamento/Fila`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  let env: Envelope | null = null
  try { env = text ? JSON.parse(text) as Envelope : null } catch { /* corpo não-JSON */ }
  if (!res.ok)                     throw new Error(env?.errorMessage || env?.message || `Fila respondeu ${res.status}.`)
  if (env && env.success === false) throw new Error(env.errorMessage || env.message || 'A API King recusou a Fila.')
  return (env?.object ?? []) as FilaItem[]
}

// ── Sorteio determinístico (semeado pela data → estável no dia) ───────────────
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function embaralhar<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Auth do chamador ──────────────────────────────────────────────────────────
async function autorizado(req: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const bearer     = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  const cronSecret = Deno.env.get('CRON_SECRET')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!bearer) return false
  if (cronSecret && bearer === cronSecret) return true // cron com segredo dedicado
  if (bearer === serviceKey) return true               // cron com service-role
  // Disparo manual: JWT de um admin.
  const { data } = await admin.auth.getUser(bearer)
  const uid = data?.user?.id
  if (!uid) return false
  const { data: prof } = await admin.from('profiles').select('role, is_admin').eq('id', uid).maybeSingle()
  return prof?.is_admin === true || prof?.role === 'admin'
}

type Pend = { professor_id: string; estagio: number; dias: number; aulas: number }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST' && req.method !== 'GET') return resp('Método não permitido.', 405)
  if (!BASE || !EMAIL || !PASSWORD) return resp({ error: 'Credenciais da API King ausentes.' }, 500)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (!(await autorizado(req, admin))) return resp('Não autorizado.', 401)

  const resumo = {
    coordenadores: 0,
    fila_total: 0,
    prioridade: 0,
    extras_atribuidos: 0,
    extras_descartados: 0,
    listas_geradas: 0,
    fila_erro: null as string | null,
    erros: [] as { coordenador_id: string; erro: string }[],
  }

  try {
    // 1. Coordenadores ativos = donos de grupos ativos, com perfil ativo.
    const { data: grupos, error: gErr } = await admin
      .from('grupos').select('coordenador_id').eq('ativo', true).not('coordenador_id', 'is', null)
    if (gErr) throw new Error(`grupos: ${gErr.message}`)
    const candidatos = [...new Set((grupos ?? []).map(g => g.coordenador_id as string))]

    let coordenadores: string[] = []
    if (candidatos.length) {
      const { data: perfis, error: pErr } = await admin
        .from('profiles').select('id').in('id', candidatos).eq('ativo', true)
      if (pErr) throw new Error(`profiles: ${pErr.message}`)
      coordenadores = (perfis ?? []).map(p => p.id as string)
    }
    resumo.coordenadores = coordenadores.length
    if (coordenadores.length === 0) {
      return resp({ ...resumo, aviso: 'Nenhum coordenador ativo.' })
    }
    const coordSet = new Set(coordenadores)

    // 2. Fila de pendências (best-effort: falha aqui não impede os 20 normais).
    let fila: FilaItem[] = []
    try { fila = await buscarFila() }
    catch (err) { resumo.fila_erro = err instanceof Error ? err.message : String(err) }
    resumo.fila_total = fila.length

    // 3. Mapeia kms_id → professor local (ativo) + coordenador dono do grupo.
    const bloqueados = fila.filter(f => f.agendaBloqueada && (f.estagio === 2 || f.estagio === 3))
    const est2: (Pend & { dono: string | null })[] = []
    const est3: (Pend & { dono: string | null })[] = []
    const idsBloqueados: string[] = [] // professor_id (uuid) de TODO bloqueado mapeado

    if (bloqueados.length) {
      const kmsIds = bloqueados.map(f => String(f.id_Professor))
      const { data: profs, error: prErr } = await admin
        .from('professores')
        .select('id, kms_id, status, coordenador_id, grupo:grupos!grupo_id (coordenador_id)')
        .in('kms_id', kmsIds)
      if (prErr) throw new Error(`professores: ${prErr.message}`)

      const porKms = new Map<string, { id: string; ativo: boolean; dono: string | null }>()
      for (const raw of (profs ?? []) as Array<Record<string, unknown>>) {
        const grupo = Array.isArray(raw.grupo) ? raw.grupo[0] : raw.grupo
        const dono  = (grupo as { coordenador_id?: string } | null)?.coordenador_id
          ?? (raw.coordenador_id as string | null) ?? null
        porKms.set(String(raw.kms_id), {
          id: raw.id as string,
          ativo: raw.status === 'ativo',
          dono: dono && coordSet.has(dono) ? dono : null,
        })
      }

      for (const f of bloqueados) {
        const local = porKms.get(String(f.id_Professor))
        if (!local || !local.ativo) continue
        idsBloqueados.push(local.id)
        const base: Pend = { professor_id: local.id, estagio: f.estagio, dias: f.dias, aulas: f.aulasPendentes }
        if (f.estagio === 2) est2.push({ ...base, dono: local.dono })
        else                 est3.push({ ...base, dono: local.dono })
      }
    }

    // 4. Prioridade (estágio 2) agrupada pelo dono do grupo (mais bloqueado primeiro).
    //    Sem dono ativo, o professor fica de fora hoje (não há coordenador a quem atribuir).
    const prioridadePorCoord = new Map<string, Pend[]>()
    coordenadores.forEach(c => prioridadePorCoord.set(c, []))
    for (const p of [...est2].sort((a, b) => b.dias - a.dias)) {
      if (p.dono) {
        prioridadePorCoord.get(p.dono)!.push({ professor_id: p.professor_id, estagio: p.estagio, dias: p.dias, aulas: p.aulas })
      }
    }

    // 5. Sorteio global dos estágio-3 (extras).
    const seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, '')) // AAAAMMDD
    const rng  = mulberry32(seed)
    const pool = embaralhar(est3, rng)
    const alvo = Math.min(TETO_EXTRA, Math.max(1, Math.ceil(pool.length / coordenadores.length)))

    const extrasPorCoord = new Map<string, Pend[]>()
    coordenadores.forEach(c => extrasPorCoord.set(c, []))

    const overflow: (Pend & { dono: string | null })[] = []
    for (const p of pool) {
      if (p.dono && extrasPorCoord.get(p.dono)!.length < alvo) extrasPorCoord.get(p.dono)!.push(p)
      else overflow.push(p)
    }
    for (const p of embaralhar(overflow, rng)) {
      const alvoCoord = coordenadores
        .filter(c => extrasPorCoord.get(c)!.length < TETO_EXTRA)
        .sort((a, b) => extrasPorCoord.get(a)!.length - extrasPorCoord.get(b)!.length)[0]
      if (!alvoCoord) { resumo.extras_descartados++; continue } // todos no teto → espera amanhã
      extrasPorCoord.get(alvoCoord)!.push(p)
    }

    // 6. Materializa por coordenador (idempotente por dia).
    for (const coordId of coordenadores) {
      const extras     = extrasPorCoord.get(coordId) ?? []
      const prioridade = (prioridadePorCoord.get(coordId) ?? []).slice(0, LIMITE_NORMAL)
      resumo.extras_atribuidos += extras.length
      resumo.prioridade        += prioridade.length
      const { error } = await admin.rpc('gerar_contatos_dia_batch', {
        p_coordenador_id: coordId,
        p_extras:         extras,
        p_prioridade:     prioridade,
        p_excluir_normal: idsBloqueados,
        p_limite:         LIMITE_NORMAL,
      })
      if (error) { resumo.erros.push({ coordenador_id: coordId, erro: error.message }); continue }
      resumo.listas_geradas++
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[contatos-dia-gerar] Erro geral:', msg)
    return resp({ ...resumo, error: msg }, 500)
  }

  console.log('[contatos-dia-gerar] Concluído:', JSON.stringify(resumo))
  return resp(resumo, resumo.erros.length ? 207 : 200)
})
