// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: exchange-google-token
//
// Recebe o authorization code do frontend (GIS code flow), troca pelos tokens
// do Google OAuth2 e persiste o refresh_token em google_tokens.
//
// Secrets necessários (Supabase Dashboard > Edge Functions > Secrets):
//   GOOGLE_CLIENT_ID     — OAuth 2.0 Client ID
//   GOOGLE_CLIENT_SECRET — OAuth 2.0 Client Secret
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

serve(async (req) => {
  // Preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { code } = await req.json()
    if (!code) return json({ error: 'Parâmetro "code" obrigatório.' }, 400)

    // ── Verifica autenticação do usuário ────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autorizado.' }, 401)

    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
    const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) return json({ error: 'Não autorizado.' }, 401)

    // ── Troca o authorization code pelos tokens ─────────────────────────────
    const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

    if (!clientId || !clientSecret) {
      return json({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não configurados nos secrets da Edge Function.' }, 500)
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  'postmessage',   // GIS popup mode
        grant_type:    'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()

    if (tokens.error) {
      console.error('[exchange-google-token] OAuth error:', tokens.error, tokens.error_description)
      return json({ error: tokens.error_description ?? tokens.error }, 400)
    }

    if (!tokens.refresh_token) {
      // Pode acontecer se o usuário já tinha concedido acesso anteriormente.
      // Orientação: revogar o app em https://myaccount.google.com/permissions
      return json({
        error: 'Token de atualização não recebido. Acesse https://myaccount.google.com/permissions, remova o acesso do app e tente novamente.',
      }, 400)
    }

    // ── Salva o refresh_token (service role ignora RLS) ─────────────────────
    const admin = createClient(supabaseUrl, serviceKey)

    const { error: upsertErr } = await admin
      .from('google_tokens')
      .upsert({
        user_id:       user.id,
        refresh_token: tokens.refresh_token,
        updated_at:    new Date().toISOString(),
      })

    if (upsertErr) {
      console.error('[exchange-google-token] Upsert error:', upsertErr.message)
      return json({ error: upsertErr.message }, 500)
    }

    console.log('[exchange-google-token] Token salvo para usuário', user.id)
    return json({ success: true })

  } catch (err) {
    console.error('[exchange-google-token] Unhandled error:', err)
    return json({ error: String(err) }, 500)
  }
})
