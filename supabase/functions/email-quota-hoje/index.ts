// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: email-quota-hoje
//
// Devolve quantos e-mails o SISTEMA DE DISPARO (a página /emails) já enviou HOJE e
// quantos ainda cabem, para dar clareza sobre o limite diário auto-imposto (200/dia).
//
// IMPORTANTE: conta SÓ os disparos deste sistema (tabela email_disparos, sucesso),
// não os demais envios da conta Brevo (crons, convites 1-a-1). O limite de 200/dia
// é do sistema de disparo.
//
// Aberto a qualquer usuário autenticado (só confere que está logado, sem cargo) —
// "todos conseguem ver o contador". A leitura usa service role, então o número
// aparece pra todos sem precisar abrir a tabela email_disparos (RLS coord/admin).
//
// Contrato: POST/GET /functions/v1/email-quota-hoje
//   Retorna: { usados: number|null, limite: 200, restantes: number|null, data: 'YYYY-MM-DD' }
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

  const url        = Deno.env.get('SUPABASE_URL')!
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Só exige estar autenticado (qualquer cargo).
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Não autenticado.' }, 401)

  // Início do dia de HOJE no fuso de São Paulo (Brasil é UTC-3, sem horário de verão).
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) // YYYY-MM-DD
  const inicioDiaISO = new Date(`${hoje}T00:00:00-03:00`).toISOString()

  // Conta os e-mails enviados com sucesso pelo sistema de disparo hoje (service role
  // ignora a RLS de email_disparos, então o total é visível a qualquer logado).
  const admin = createClient(url, serviceKey)
  const { count, error } = await admin
    .from('email_disparos')
    .select('id', { count: 'exact', head: true })
    .eq('sucesso', true)
    .gte('created_at', inicioDiaISO)

  if (error) {
    console.error('[email-quota-hoje] erro ao contar email_disparos:', error.message)
    return json({ usados: null, limite: LIMITE_DIA, restantes: null, data: hoje })
  }

  const usados = count ?? 0
  return json({ usados, limite: LIMITE_DIA, restantes: Math.max(0, LIMITE_DIA - usados), data: hoje })
})
