// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: email-quota-hoje
//
// Devolve quantos e-mails já saíram HOJE pela conta Brevo do King e quantos ainda
// cabem, para a página /emails mostrar clareza sobre o limite diário auto-imposto
// (200/dia). O número vem do relatório agregado do Brevo, então conta TUDO que
// consome a cota no dia: disparos em massa, envios 1-a-1 e as crons.
//
// Aberto a qualquer usuário autenticado (só confere que está logado, sem cargo) —
// "todos conseguem ver o contador".
//
// Contrato: POST/GET /functions/v1/email-quota-hoje
//   Retorna: { usados: number|null, limite: 200, restantes: number|null, data: 'YYYY-MM-DD' }
//   usados/restantes = null quando o Brevo não respondeu (UI mostra "—").
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LIMITE_DIA = 200

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url     = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // Só exige estar autenticado (qualquer cargo).
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Não autenticado.' }, 401)

  // Data de hoje no fuso de São Paulo (en-CA formata como YYYY-MM-DD).
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  const brevoKey = Deno.env.get('BREVO_API_KEY')
  if (!brevoKey) return json({ usados: null, limite: LIMITE_DIA, restantes: null, data: hoje })

  try {
    const res = await fetch(
      `https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=${hoje}&endDate=${hoje}`,
      { headers: { 'api-key': brevoKey, 'Accept': 'application/json' } },
    )
    if (!res.ok) {
      console.error('[email-quota-hoje] Brevo não ok:', res.status, (await res.text()).slice(0, 300))
      return json({ usados: null, limite: LIMITE_DIA, restantes: null, data: hoje })
    }
    const rel = await res.json()
    const usados = typeof rel.requests === 'number' ? rel.requests : 0
    return json({ usados, limite: LIMITE_DIA, restantes: Math.max(0, LIMITE_DIA - usados), data: hoje })
  } catch (e) {
    console.error('[email-quota-hoje] erro:', e instanceof Error ? e.message : String(e))
    return json({ usados: null, limite: LIMITE_DIA, restantes: null, data: hoje })
  }
})
