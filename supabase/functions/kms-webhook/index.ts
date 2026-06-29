// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: kms-webhook
//
// Recebe professores do KingManagementSystem (KMS) e faz upsert na tabela
// professores (idempotente pelo kms_id). Professores novos e ativos são
// alocados automaticamente em um grupo pelo trigger trg_atribuir_grupo
// (migration 20260628_ktm_foundation.sql).
//
// Autenticação: cabeçalho secreto compartilhado (a outra plataforma não tem
// sessão do Supabase). Configure o secret KMS_WEBHOOK_SECRET no painel.
//
// ── Contrato esperado ────────────────────────────────────────────────────────
//   POST  /functions/v1/kms-webhook
//   Header: x-kms-secret: <KMS_WEBHOOK_SECRET>     (ou Authorization: Bearer <…>)
//   Body: um objeto, uma lista, ou { "professores": [ … ] }
//   {
//     "kms_id":       "12345",            // obrigatório — id do professor no KMS
//     "nome":         "João Silva",       // obrigatório
//     "email":        "joao@exemplo.com", // opcional
//     "data_entrada": "2026-01-10",       // opcional (aceita data_inicio também)
//     "status":       "ativo"             // opcional: ativo | pausa | desligado
//   }
//
// Campos omitidos NÃO sobrescrevem valores já existentes (preserva dados).
//
// Secrets necessários (Supabase Dashboard > Edge Functions > Secrets):
//   KMS_WEBHOOK_SECRET
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente.)
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-kms-secret, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Helpers de mapeamento ─────────────────────────────────────────────────────

/** Normaliza para 'YYYY-MM-DD' (coluna data_inicio é DATE). */
function normalizeDate(d: unknown): string | null {
  if (!d) return null
  const dt = new Date(String(d))
  if (isNaN(dt.getTime())) return null
  return dt.toISOString().slice(0, 10)
}

/** Converte o status do KMS para os valores aceitos. Desconhecido → undefined (não mexe). */
function mapStatus(s: unknown): 'ativo' | 'pausa' | 'desligado' | undefined {
  if (s == null) return undefined
  const v = String(s).toLowerCase().trim()
  if (['ativo', 'ativa', 'active'].includes(v))                                     return 'ativo'
  if (['pausa', 'pausado', 'pausada', 'paused', 'pause', 'ferias', 'férias'].includes(v)) return 'pausa'
  if (['desligado', 'desligada', 'inativo', 'inativa', 'inactive', 'demitido'].includes(v)) return 'desligado'
  return undefined
}

// ── Servidor ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  // ── Autenticação por segredo compartilhado ─────────────────────────────────
  const secret = Deno.env.get('KMS_WEBHOOK_SECRET')
  if (!secret) {
    return json({ error: 'KMS_WEBHOOK_SECRET não configurado nos secrets da Edge Function.' }, 500)
  }
  const provided = req.headers.get('x-kms-secret')
    ?? (req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '')
  if (provided !== secret) {
    return json({ error: 'Não autorizado.' }, 401)
  }

  // ── Body ───────────────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const items: Record<string, unknown>[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { professores?: unknown })?.professores)
      ? (body as { professores: Record<string, unknown>[] }).professores
      : [body as Record<string, unknown>]

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let criados     = 0
  let atualizados = 0
  const erros: { kms_id: string; motivo: string }[] = []

  for (const raw of items) {
    const kms_id = raw?.kms_id != null ? String(raw.kms_id).trim() : ''
    const nome   = typeof raw?.nome === 'string' ? raw.nome.trim() : ''

    if (!kms_id || !nome) {
      erros.push({ kms_id, motivo: 'Campos obrigatórios ausentes (kms_id, nome).' })
      continue
    }

    // Monta apenas os campos presentes — assim um update não apaga dados já gravados.
    const payload: Record<string, unknown> = { kms_id, nome }
    if (raw.email !== undefined) payload.email = raw.email ?? null
    const data = raw.data_entrada ?? raw.data_inicio
    if (data !== undefined) payload.data_inicio = normalizeDate(data)
    const status = mapStatus(raw.status)
    if (status !== undefined) payload.status = status

    try {
      const { data: existente } = await admin
        .from('professores')
        .select('id')
        .eq('kms_id', kms_id)
        .maybeSingle()

      if (existente) {
        const { error } = await admin
          .from('professores')
          .update(payload)
          .eq('kms_id', kms_id)
        if (error) { erros.push({ kms_id, motivo: error.message }); continue }
        atualizados++
      } else {
        const { error } = await admin
          .from('professores')
          .insert(payload)
        if (error) { erros.push({ kms_id, motivo: error.message }); continue }
        criados++
      }
    } catch (err) {
      erros.push({ kms_id, motivo: String(err) })
    }
  }

  const result = { recebidos: items.length, criados, atualizados, erros }
  console.log('[kms-webhook] Concluído:', JSON.stringify(result))
  return json(result, erros.length && !criados && !atualizados ? 207 : 200)
})
