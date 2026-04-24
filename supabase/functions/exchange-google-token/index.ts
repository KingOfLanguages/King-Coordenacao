// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: exchange-google-token
//
// Recebe o authorization code do frontend (GIS code flow), troca pelos tokens
// do Google OAuth2, captura o email Google real via userinfo API e persiste
// tudo em google_tokens para uso no daily-import.
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
      return json({
        error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não configurados nos secrets da Edge Function.',
      }, 500)
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

    // ── Captura o email Google real via userinfo API ─────────────────────────
    // Isso resolve a atribuição correta de coordenador_id no daily-import:
    // ex. access_token pertence a coordenacaoking7@gmail.com → Ariel
    let googleEmail: string | null = null
    try {
      const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (userinfoRes.ok) {
        const info = await userinfoRes.json()
        googleEmail = info.email ?? null
        console.log('[exchange-google-token] Google email capturado:', googleEmail)
      }
    } catch (e) {
      // Não crítico — salva o token mesmo sem email
      console.warn('[exchange-google-token] Não foi possível capturar o email Google:', e)
    }

    // ── Salva o refresh_token + google_email (service role ignora RLS) ──────
    const admin = createClient(supabaseUrl, serviceKey)

    const { error: upsertErr } = await admin
      .from('google_tokens')
      .upsert({
        user_id:       user.id,
        refresh_token: tokens.refresh_token,
        google_email:  googleEmail,
        updated_at:    new Date().toISOString(),
      })

    if (upsertErr) {
      console.error('[exchange-google-token] Upsert error:', upsertErr.message)
      return json({ error: upsertErr.message }, 500)
    }

    console.log('[exchange-google-token] Token salvo — usuário:', user.id, '/ Google:', googleEmail)
    return json({ success: true, google_email: googleEmail })

  } catch (err) {
    console.error('[exchange-google-token] Unhandled error:', err)
    return json({ error: String(err) }, 500)
  }
})
