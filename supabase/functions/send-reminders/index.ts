// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: send-reminders
//
// Roda automaticamente via pg_cron (08:30 BRT), após daily-import.
// Para cada reunião pendente de hoje com professor que tenha email cadastrado,
// envia um lembrete via Brevo (Sendinblue) com o link da reunião.
//
// Brevo não exige domínio próprio — basta verificar um email de remetente.
//
// Secrets necessários (Supabase Dashboard > Edge Functions > Secrets):
//   BREVO_API_KEY    — chave da API do Brevo (Settings > API Keys)
//   BREVO_FROM_EMAIL — email remetente verificado no Brevo (ex: coordenacaoking7@gmail.com)
//   BREVO_FROM_NAME  — nome exibido no email (ex: King Education)
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Email template ───────────────────────────────────────────────────────────

function buildHtml({
  professorNome,
  titulo,
  hora,
  meetLink,
  coordNome,
}: {
  professorNome: string
  titulo:        string
  hora:          string
  meetLink:      string | null
  coordNome:     string
}): string {
  const meetBtn = meetLink
    ? `
      <div style="margin:24px 0;">
        <a href="${meetLink}"
          style="display:inline-block;background:#2563EB;color:#fff;padding:12px 24px;
                 border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          Entrar na reunião
        </a>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">

        <!-- Header -->
        <tr>
          <td style="background:#1e293b;padding:28px 32px;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">
              King Education
            </p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#f8fafc;">
              Lembrete de reunião
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:15px;color:#1e293b;">
              Olá, <strong>${professorNome}</strong>!
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
              Você tem uma reunião marcada para <strong>hoje</strong>:
            </p>

            <!-- Meeting card -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">
                    Reunião
                  </p>
                  <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#1e293b;">${titulo}</p>
                  <p style="margin:0;font-size:14px;color:#475569;">
                    Hoje às <strong>${hora}</strong> · com ${coordNome}
                  </p>
                </td>
              </tr>
            </table>

            ${meetBtn}

            <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
              Este lembrete foi enviado automaticamente pela plataforma King Education.<br>
              Para mais informações entre em contato com a coordenação.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e4e4e7;padding:16px 32px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
              © ${new Date().getFullYear()} King Education — enviado automaticamente, não responda este email.
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
  const auth = req.headers.get('Authorization') ?? ''

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return new Response('Não autorizado.', { status: 401 })
  }

  const brevoKey = Deno.env.get('BREVO_API_KEY')
  if (!brevoKey) {
    console.log('[send-reminders] BREVO_API_KEY não configurado — pulando envio.')
    return new Response(JSON.stringify({ skipped: true, reason: 'BREVO_API_KEY ausente' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL') ?? 'coordenacaoking7@gmail.com'
  const fromName  = Deno.env.get('BREVO_FROM_NAME')  ?? 'King Education'

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ── Busca reuniões pendentes de hoje com professor que tenha email ─────────
  const hoje      = new Date()
  const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0,  0,  0, 0).toISOString()
  const fimDia    = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999).toISOString()

  // Busca reuniões com professor_email preenchido (capturado automaticamente do Google Calendar)
  // OU com email salvo no cadastro do professor — o que vier primeiro
  const { data: reunioes, error } = await admin
    .from('reunioes')
    .select(`
      id, data, meet_link, titulo, professor_email,
      professores (nome, email),
      coordenador:profiles!coordenador_id (nome)
    `)
    .eq('status', 'pendente')
    .gte('data', inicioDia)
    .lte('data', fimDia)

  if (error) {
    console.error('[send-reminders] Erro na query:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let sent    = 0
  let skipped = 0

  for (const r of reunioes ?? []) {
    const prof      = r.professores as { nome: string; email: string | null } | null
    // Prioridade: email capturado do Google Calendar > email do cadastro
    const destEmail = (r.professor_email as string | null) ?? prof?.email ?? null
    const destNome  = prof?.nome ?? 'Professor(a)'

    if (!destEmail) {
      skipped++
      continue
    }

    const hora = new Date(r.data).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    })
    const coordNome = (r.coordenador as { nome: string } | null)?.nome ?? 'Coordenação'
    const titulo    = (r.titulo as string | null) ?? `1:1 com ${coordNome}`

    const html = buildHtml({ professorNome: destNome, titulo, hora, meetLink: r.meet_link as string | null, coordNome })

    // ── Brevo API (v3) ────────────────────────────────────────────────────────
    // Diferente do Resend: usa header "api-key" em vez de "Authorization: Bearer"
    // e o payload tem "sender", "to" como objetos, e "htmlContent" em vez de "html"
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key':      brevoKey,
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
      body: JSON.stringify({
        sender:      { name: fromName, email: fromEmail },
        to:          [{ email: destEmail, name: destNome }],
        subject:     `Lembrete: reunião hoje às ${hora}`,
        htmlContent: html,
      }),
    })

    if (res.ok) {
      console.log(`[send-reminders] Email enviado para ${destEmail} (${destNome})`)
      sent++
    } else {
      const errText = await res.text()
      console.error(`[send-reminders] Falha ao enviar para ${destEmail}:`, errText)
    }
  }

  const result = { sent, skipped, date: hoje.toISOString() }
  console.log('[send-reminders] Concluído:', result)

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
})
