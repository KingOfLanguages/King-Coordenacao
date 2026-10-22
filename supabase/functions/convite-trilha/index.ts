// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: convite-trilha
//
// Convida o professor novo para a trilha de boas-vindas assim que o cadastro
// dele chega ao KTM (22/10/2026, parecer do RH). Antes, ele recebia o login da
// King e ia direto à trilha; se chegasse antes do sync, o portal respondia
// "enviado" com a isca e o código nunca vinha. Agora o sinal de que dá para
// entrar é este e-mail, que só sai quando o cadastro já está aqui.
//
// Quem recebe: convites_trilha_pendentes() (migration 20260806). O cron
// king-convite-trilha só chama esta função quando há alguém pendente.
//
// Um e-mail por professor: antes de mandar, reserva somando 1 em
// convite_trilha_tentativas (só se ninguém mexeu desde a leitura); depois do
// Brevo aceitar, grava convite_trilha_em. Falhou, a próxima batida tenta de novo,
// até 3 vezes. Não grava em email_disparos (ver a migration).
//
// Os fatos do texto (código de 6 números, 5 dias do 1º acesso) se repetem no
// guia do RH (docs/welcome-path) e no portal: mudou um, mude os três.
//
// Secrets: BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME; APP_URL opcional.
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { semSufixoInicio } from '../_shared/portal.ts'

const APP_URL = Deno.env.get('APP_URL') ?? 'https://projeto-king-coord.vercel.app'
const LINK_TRILHA = `${APP_URL}/welcome-path`

type Pendente = { id: string; nome: string; email: string; tentativas: number }

function json(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Mesmo visual do e-mail do código (portal-identidade). */
function htmlConvite(nome: string, email: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <!-- Largura fluida com teto: com width="480" fixo, o e-mail vaza no celular. -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr>
          <td style="background:#1e293b;padding:24px 32px;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">
              King Of Languages
            </p>
            <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#f8fafc;">Sua trilha de boas-vindas está pronta</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-size:15px;color:#1e293b;line-height:1.6;">
            <p style="margin:0 0 16px;">Olá, ${esc(nome)}!</p>
            <p style="margin:0 0 20px;">
              Seu acesso à plataforma da King foi criado, e a sua trilha de boas-vindas já está
              liberada. É por ela que você conhece a escola e se prepara para os primeiros alunos.
            </p>
            <p style="margin:0 0 24px;">
              <a href="${LINK_TRILHA}"
                 style="display:inline-block;background:#1e293b;color:#f8fafc;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px;">
                Começar a trilha
              </a>
            </p>
            <p style="margin:0 0 12px;">
              Para entrar, informe este e-mail: <strong>${esc(email)}</strong>. Na hora, chega aqui
              um código de 6 números para você digitar.
            </p>
            <p style="margin:0 0 12px;">
              Você tem 5 dias, a partir do primeiro acesso, para concluir a trilha.
            </p>
            <p style="margin:0;font-size:13px;color:#64748b;">
              Ficou com dúvida? Dentro da trilha está o WhatsApp da coordenação de professores.
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;word-break:break-all;">
        Se o botão não abrir, copie o endereço: ${LINK_TRILHA}
      </p>
    </td></tr>
  </table>
</body>
</html>`
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const brevoKey = Deno.env.get('BREVO_API_KEY')
  if (!brevoKey) return json({ error: 'BREVO_API_KEY ausente.' }, 503)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await admin.rpc('convites_trilha_pendentes')
  if (error) return json({ error: error.message }, 500)

  const enviados: string[] = []
  const falhas: { id: string; erro: string }[] = []

  for (const p of (data ?? []) as Pendente[]) {
    // Reserva: só passa quem ninguém tocou desde a leitura.
    const { data: reservado, error: resErr } = await admin
      .from('professores')
      .update({ convite_trilha_tentativas: p.tentativas + 1 })
      .eq('id', p.id)
      .is('convite_trilha_em', null)
      .eq('convite_trilha_tentativas', p.tentativas)
      .select('id')
      .maybeSingle()
    if (resErr) { falhas.push({ id: p.id, erro: resErr.message }); continue }
    if (!reservado) continue

    const primeiroNome = semSufixoInicio(p.nome).split(' ')[0] || 'professor(a)'
    const email = p.email.trim()
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        sender: {
          name:  Deno.env.get('BREVO_FROM_NAME')  ?? 'KOL - King Of Languages',
          email: Deno.env.get('BREVO_FROM_EMAIL') ?? 'coordenacaoking.agenda@gmail.com',
        },
        to:          [{ email, name: primeiroNome }],
        subject:     'Sua trilha de boas-vindas à King está pronta',
        htmlContent: htmlConvite(primeiroNome, email),
      }),
    })
    if (!res.ok) {
      const erro = `Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`
      console.error(`[convite-trilha] ${p.id}: ${erro}`)
      falhas.push({ id: p.id, erro })
      continue
    }
    await res.body?.cancel()

    const { error: okErr } = await admin
      .from('professores')
      .update({ convite_trilha_em: new Date().toISOString() })
      .eq('id', p.id)
    if (okErr) console.error(`[convite-trilha] ${p.id}: enviado, mas não gravou: ${okErr.message}`)
    enviados.push(p.id)
  }

  if (enviados.length) console.log(`[convite-trilha] ${enviados.length} convite(s) enviado(s)`)
  return json({ enviados: enviados.length, falhas }, 200)
})
