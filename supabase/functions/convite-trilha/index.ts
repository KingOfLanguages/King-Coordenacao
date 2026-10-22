// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: convite-trilha
//
// Convida o professor para a trilha de boas-vindas. Dois caminhos:
//
//   pela tela (22/10/2026, grupo de controle do RH)
//     POST { professorId } com a sessão de quem está logado. Só passa quem
//     pode_gerir_welcome_path(), e só para professor liberado
//     (wp_trilha_liberada, migration 20260810). Pode reenviar, com 10 min de
//     intervalo para um clique duplo não virar dois e-mails. Cada envio fica em
//     welcome_path_convites, com quem mandou.
//
//   pelo cron (o original, 20260806/20260807; PAUSADO desde 22/10, 20260808)
//     POST {} com a chave de serviço. Manda para convites_trilha_pendentes():
//     professor novo, nos últimos 3 dias, ainda sem convite e — desde a
//     20260810 — liberado, se a trilha estiver no modo restrito. Um e-mail por
//     professor: reserva somando 1 em convite_trilha_tentativas, grava
//     convite_trilha_em depois que o Brevo aceita; até 3 tentativas.
//
// Nenhum dos dois grava em email_disparos (ver a 20260806): o convite não pode
// travar a carência de 15 dias do convite da 1ª reunião.
//
// Os fatos do texto (código de 6 números, 5 dias do 1º acesso) se repetem no
// guia do RH (docs/welcome-path) e no portal: mudou um, mude os três.
//
// Secrets: BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME; APP_URL opcional.
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonPara, preflight, semSufixoInicio } from '../_shared/portal.ts'

const APP_URL = Deno.env.get('APP_URL') ?? 'https://projeto-king-coord.vercel.app'
const LINK_TRILHA = `${APP_URL}/welcome-path`

type Pendente = { id: string; nome: string; email: string; tentativas: number }

/** Reenvio pela tela: menos que isso desde o último convite é clique duplo. */
const INTERVALO_REENVIO_MS = 10 * 60_000
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// deno-lint-ignore no-explicit-any
type Admin = any

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

/** Manda o e-mail pelo Brevo. Devolve o erro, ou null se foi aceito. */
async function enviarConvite(brevoKey: string, nome: string, email: string): Promise<string | null> {
  const primeiroNome = semSufixoInicio(nome).split(' ')[0] || 'professor(a)'
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
  if (!res.ok) return `Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`
  await res.body?.cancel()
  return null
}

/** Papel do JWT que chegou. A assinatura já foi conferida pela plataforma
 *  (verify_jwt), então ler o papel do payload é seguro. */
function papelDoToken(req: Request): string | null {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64 + '='.repeat((4 - b64.length % 4) % 4))).role ?? null
  } catch {
    return null
  }
}

// ─── Pela tela: um professor, quem está logado manda ─────────────────────────
async function convidarPelaTela(req: Request, admin: Admin, brevoKey: string, professorId: string): Promise<Response> {
  const json = jsonPara(req)

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Entre na plataforma de novo para mandar o convite.' }, 401)
  const { data: pode } = await userClient.rpc('pode_gerir_welcome_path')
  if (pode !== true) return json({ error: 'Sem permissão para convidar para a trilha.' }, 403)

  const { data: prof } = await admin
    .from('professores')
    .select('id, nome, email, status, convite_trilha_em')
    .eq('id', professorId)
    .maybeSingle()
  if (!prof || prof.status !== 'ativo') return json({ error: 'Professor não encontrado entre os ativos.' }, 404)
  const email = (prof.email ?? '').trim()
  if (!EMAIL_RE.test(email)) return json({ error: 'Este professor não tem e-mail válido no cadastro.' }, 422)

  const { data: liberada } = await admin.rpc('wp_trilha_liberada', { p_professor_id: prof.id })
  if (liberada !== true) return json({ error: 'Libere o professor na trilha antes de convidar.' }, 409)

  if (prof.convite_trilha_em && Date.now() - new Date(prof.convite_trilha_em).getTime() < INTERVALO_REENVIO_MS) {
    return json({ error: 'O convite acabou de ir para este professor. Espere uns minutos para reenviar.' }, 429)
  }

  const erro = await enviarConvite(brevoKey, prof.nome, email)
  if (erro) {
    console.error(`[convite-trilha] tela ${prof.id}: ${erro}`)
    return json({ error: 'O serviço de e-mail recusou o envio agora. Tente de novo em instantes.' }, 502)
  }

  const agora = new Date().toISOString()
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    admin.from('welcome_path_convites').insert({ professor_id: prof.id, enviado_por: user.id, email }),
    admin.from('professores').update({ convite_trilha_em: agora }).eq('id', prof.id),
  ])
  if (e1 || e2) console.error(`[convite-trilha] tela ${prof.id}: enviado, mas não gravou: ${e1?.message ?? e2?.message}`)
  console.log(`[convite-trilha] convite pela tela para ${prof.id}`)
  return json({ enviado: true, para: email, em: agora })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (req.method !== 'POST') return jsonPara(req)({ error: 'Método não permitido.' }, 405)

  const brevoKey = Deno.env.get('BREVO_API_KEY')
  if (!brevoKey) return jsonPara(req)({ error: 'BREVO_API_KEY ausente.' }, 503)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* o cron manda {} */ }
  if (typeof body.professorId === 'string' && body.professorId) {
    return convidarPelaTela(req, admin, brevoKey, body.professorId)
  }

  // ─── Pelo cron: só com a chave de serviço ──────────────────────────────────
  // A chave pública do site também passa no verify_jwt; sem esta trava,
  // qualquer um disparava a fila.
  const json = jsonPara(req)
  if (papelDoToken(req) !== 'service_role') return json({ error: 'Informe o professor.' }, 400)

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

    const erro = await enviarConvite(brevoKey, p.nome, p.email.trim())
    if (erro) {
      console.error(`[convite-trilha] ${p.id}: ${erro}`)
      falhas.push({ id: p.id, erro })
      continue
    }

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
