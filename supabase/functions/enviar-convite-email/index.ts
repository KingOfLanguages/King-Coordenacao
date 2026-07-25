// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: enviar-convite-email
//
// Envia por e-mail (Brevo) o MESMO texto de convite/contato que o coordenador
// mandaria por WhatsApp na tela "Mensagens do dia" — só que formatado para
// e-mail. O corpo já vem montado pelo client (mesma fonte `montarMensagemContato`),
// garantindo que WhatsApp e e-mail digam exatamente a mesma coisa.
//
// Contrato:
//   POST /functions/v1/enviar-convite-email
//   Body: { contato_id: uuid, corpo: string, assunto: string, remetente_nome?: string }
//   Retorna: { enviado: true, para: "email@..." }  ou  { error, ... }
//
// Segurança:
//   - verify_jwt = true (padrão) → só usuário logado chega aqui.
//   - Além disso, confere o cargo do chamador (admin/coordenacao/líder).
//   - O destino NUNCA vem do client: é resolvido no servidor a partir do
//     contato_id → professores.email (mesmo campo do send-reminders).
//
// Secrets: BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME (mesmos das outras fns)
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

// ─── WhatsApp → HTML ──────────────────────────────────────────────────────────
// Converte o texto (formato WhatsApp) para HTML seguro: escapa entidades,
// *negrito* → <strong>, URLs viram links clicáveis e quebras de linha viram <br>.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function corpoParaHtml(texto: string): string {
  let s = escapeHtml(texto)
  s = s.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')            // *negrito*
  s = s.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#2563EB;text-decoration:underline;word-break:break-all;">$1</a>',
  )
  s = s.replace(/\n/g, '<br>')
  return s
}

function buildHtml(corpoHtml: string, coordNome: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr>
          <td style="background:#1e293b;padding:28px 32px;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">
              King Of Languages
            </p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#f8fafc;">
              Reunião de acompanhamento!
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-size:15px;color:#1e293b;line-height:1.65;">
            ${corpoHtml}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e4e4e7;padding:16px 32px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
              Enviado por ${escapeHtml(coordNome)} · © ${new Date().getFullYear()} King Of Languages
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── Servidor ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  // ── 1. Body ──────────────────────────────────────────────────────────────────
  let body: { contato_id?: unknown; corpo?: unknown; assunto?: unknown; remetente_nome?: unknown }
  try { body = await req.json() } catch { return json({ error: 'JSON inválido.' }, 400) }

  const contatoId = typeof body.contato_id === 'string' ? body.contato_id.trim() : ''
  const corpo     = typeof body.corpo === 'string' ? body.corpo : ''
  const assunto   = typeof body.assunto === 'string' && body.assunto.trim() ? body.assunto.trim() : 'Reunião de acompanhamento — King'
  const remetente = typeof body.remetente_nome === 'string' && body.remetente_nome.trim() ? body.remetente_nome.trim() : 'Coordenação'
  if (!contatoId || !corpo.trim()) return json({ error: 'contato_id e corpo são obrigatórios.' }, 400)

  const url        = Deno.env.get('SUPABASE_URL')!
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // ── 2. Quem está chamando? (precisa ser coordenação/admin/líder) ─────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Não autenticado.' }, 401)

  const { data: perfil } = await userClient
    .from('profiles')
    .select('role, is_admin, is_lider')
    .eq('id', user.id)
    .maybeSingle()

  const podeEnviar = perfil?.role === 'admin' || perfil?.role === 'coordenacao'
    || perfil?.is_admin === true || perfil?.is_lider === true
  if (!podeEnviar) return json({ error: 'Sem permissão para enviar e-mails.' }, 403)

  // ── 3. Resolve o destino no servidor (nunca confia no client) ────────────────
  const admin = createClient(url, serviceKey)
  const { data: contato, error: contatoErr } = await admin
    .from('contatos_diarios')
    .select('id, enviado, professor:professores(nome, email)')
    .eq('id', contatoId)
    .maybeSingle()

  if (contatoErr) {
    console.error('[enviar-convite-email] erro ao ler contato:', contatoErr.message)
    return json({ error: 'Erro ao localizar o contato.' }, 500)
  }
  if (!contato) return json({ error: 'Contato não encontrado.' }, 404)

  const prof  = contato.professor as { nome: string | null; email: string | null } | null
  const email = prof?.email?.trim() ?? ''
  const nome  = prof?.nome ?? 'Professor(a)'
  if (!email) return json({ error: 'Este professor não tem e-mail cadastrado.' }, 422)

  // ── 4. Envio via Brevo ───────────────────────────────────────────────────────
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  if (!brevoKey) return json({ error: 'Envio de e-mail não configurado (BREVO_API_KEY ausente).' }, 503)

  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL') ?? 'coordenacaoking.agenda@gmail.com'
  const fromName  = Deno.env.get('BREVO_FROM_NAME')  ?? 'KOL - King Of Languages'

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      sender:      { name: `${remetente} · King`, email: fromEmail },
      to:          [{ email, name: nome }],
      replyTo:     { email: fromEmail, name: fromName },
      subject:     assunto,
      htmlContent: buildHtml(corpoParaHtml(corpo), remetente),
    }),
  })

  if (!res.ok) {
    const detalhe = await res.text()
    console.error(`[enviar-convite-email] ✗ ${email}:`, detalhe)
    return json({ error: 'Falha no envio do e-mail. Tente novamente.', detalhe }, 502)
  }

  // ── 5. Marca o contato do dia como enviado (best-effort) ─────────────────────
  const { error: markErr } = await admin
    .from('contatos_diarios')
    .update({ enviado: true, enviado_em: new Date().toISOString() })
    .eq('id', contatoId)
  if (markErr) console.error('[enviar-convite-email] enviado ok, mas falhou ao marcar contato:', markErr.message)

  console.log(`[enviar-convite-email] ✓ ${email} (${nome})`)
  return json({ enviado: true, para: email })
})
