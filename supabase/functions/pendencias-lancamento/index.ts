// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: pendencias-lancamento
//
// Proxy AUTENTICADO para a API oficial da Central de Pendências de Lançamento do
// King (/api/PendenciaLancamento/*). O motor — detecção diária, régua dia 2/3/5,
// bloqueio de agenda e auditoria forense — roda no back-end do King. Aqui a gente
// só é cliente de leitura + duas ações:
//   1. valida que quem chama é um usuário logado do KTM com cargo autorizado;
//   2. loga na API King com a conta COMPARTILHADA (mesmas credenciais que o
//      kms-api-sync já usa) e repassa a chamada;
//   3. devolve o payload `object` do envelope padrão da API.
//
// ⚠️ AUTORIA DAS AÇÕES: a API King deriva o "autor" (enviadoPorNome) do próprio
// token. Como usamos UMA conta compartilhada, toda ação (RegistrarMensagem /
// LiberarAgenda) fica registrada no King sob essa conta — não sob o coordenador
// individual do KTM. Se um dia precisar de autoria por pessoa, cada coordenador
// precisaria de credenciais próprias na plataforma King.
//
// Secrets:
//   KMS_API_EMAIL, KMS_API_PASSWORD          — conta King compartilhada (já existem)
//   PENDENCIAS_API_BASE_URL (opcional)       — base da API de pendências; se
//        ausente, usa KMS_API_BASE_URL (forte suspeita de ser o mesmo host).
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — já existem no projeto
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const BASE     = Deno.env.get('PENDENCIAS_API_BASE_URL') ?? Deno.env.get('KMS_API_BASE_URL') ?? ''
const EMAIL    = Deno.env.get('KMS_API_EMAIL') ?? ''
const PASSWORD = Deno.env.get('KMS_API_PASSWORD') ?? ''

// Token da API King reaproveitado entre invocações "quentes" do mesmo container
// (evita um /api/Login a cada refresh da fila). Re-loga sozinho no primeiro 401.
let cachedToken: string | null = null

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

async function kingCall(path: string, init: RequestInit = {}): Promise<Response> {
  if (!cachedToken) cachedToken = await kingLogin()
  const url = `${BASE}/api/PendenciaLancamento${path}`
  const withAuth = (t: string): RequestInit => ({
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` },
  })
  let res = await fetch(url, withAuth(cachedToken))
  if (res.status === 401) {
    cachedToken = await kingLogin()
    res = await fetch(url, withAuth(cachedToken))
  }
  return res
}

interface Envelope {
  success?: boolean
  message?: string | null
  errorMessage?: string | null
  object?: unknown
}

// Desembrulha o envelope { success, message, errorMessage, object } da API King.
async function unwrap(res: Response): Promise<unknown> {
  const text = await res.text()
  let env: Envelope | null = null
  try { env = text ? JSON.parse(text) as Envelope : null } catch { /* corpo não-JSON */ }

  if (!res.ok) {
    throw new Error(env?.errorMessage || env?.message || `A API King respondeu ${res.status}.`)
  }
  if (env && env.success === false) {
    throw new Error(env.errorMessage || env.message || 'A API King recusou a operação.')
  }
  return env?.object ?? null
}

interface Body {
  resource?: string
  professorId?: number | string
  id_Professor?: number | string
  estagio?: number
  texto?: string
}

const READ_RESOURCES  = new Set(['fila', 'logs', 'auditoria', 'snapshots', 'historico'])
const WRITE_RESOURCES = new Set(['registrarMensagem', 'liberarAgenda'])
const SEG_POR_RECURSO: Record<string, string> = {
  logs: 'Logs', auditoria: 'Auditoria', snapshots: 'Snapshots', historico: 'Historico',
}

function toId(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  return Number.isInteger(n) && n > 0 ? n : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  if (!BASE || !EMAIL || !PASSWORD) {
    return json({ error: 'Credenciais da API King ausentes (defina PENDENCIAS_API_BASE_URL ou KMS_API_BASE_URL, KMS_API_EMAIL e KMS_API_PASSWORD).' }, 500)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Autorização do chamador (usuário logado do KTM) ─────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return json({ error: 'Não autorizado.' }, 401)
  const { data: userData } = await admin.auth.getUser(token)
  const uid = userData?.user?.id
  if (!uid) return json({ error: 'Não autorizado.' }, 401)

  const { data: caller } = await admin.from('profiles').select('role, is_admin').eq('id', uid).maybeSingle()
  const ehAdmin  = caller?.is_admin === true || caller?.role === 'admin'
  const podeVer  = ehAdmin || caller?.role === 'coordenacao' || caller?.role === 'suporte' || caller?.role === 'suporte_aluno'
  const podeAgir = ehAdmin || caller?.role === 'coordenacao'
  if (!podeVer) return json({ error: 'Sem permissão.' }, 403)

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'Corpo da requisição inválido.' }, 400) }

  const resource = String(body.resource ?? '')
  if (!READ_RESOURCES.has(resource) && !WRITE_RESOURCES.has(resource)) {
    return json({ error: 'Recurso inválido.' }, 400)
  }
  if (WRITE_RESOURCES.has(resource) && !podeAgir) {
    return json({ error: 'Sem permissão para esta ação.' }, 403)
  }

  try {
    if (resource === 'fila') {
      return json({ object: await unwrap(await kingCall('/Fila')) })
    }

    if (READ_RESOURCES.has(resource)) {
      const id = toId(body.professorId ?? body.id_Professor)
      if (!id) return json({ error: 'professorId inválido.' }, 400)
      return json({ object: await unwrap(await kingCall(`/${SEG_POR_RECURSO[resource]}/${id}`)) })
    }

    if (resource === 'registrarMensagem') {
      const id      = toId(body.id_Professor ?? body.professorId)
      const estagio = Number(body.estagio)
      const texto   = typeof body.texto === 'string' ? body.texto.trim() : ''
      if (!id)                           return json({ error: 'id_Professor inválido.' }, 400)
      if (![1, 2, 3].includes(estagio))  return json({ error: 'estagio inválido (use 1, 2 ou 3).' }, 400)
      if (!texto)                        return json({ error: 'Texto da mensagem é obrigatório.' }, 400)
      const object = await unwrap(await kingCall('/RegistrarMensagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_Professor: id, estagio, texto }),
      }))
      return json({ ok: true, object })
    }

    if (resource === 'liberarAgenda') {
      const id = toId(body.id_Professor ?? body.professorId)
      if (!id) return json({ error: 'id_Professor inválido.' }, 400)
      const object = await unwrap(await kingCall('/LiberarAgenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_Professor: id }),
      }))
      return json({ ok: true, object })
    }

    return json({ error: 'Recurso inválido.' }, 400)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pendencias-lancamento] Erro:', msg)
    return json({ error: msg }, 502)
  }
})
