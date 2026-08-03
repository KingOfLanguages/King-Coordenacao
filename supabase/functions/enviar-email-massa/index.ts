// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: enviar-email-massa
//
// Dispara e-mails (Brevo) para uma seleção de professores — a partir da página
// /emails (Disparo de E-mails). O corpo de cada mensagem já vem montado pelo
// client (convocação padrão OU texto personalizado com tokens já resolvidos),
// exatamente como o enviar-convite-email faz para um contato só.
//
// Contrato:
//   POST /functions/v1/enviar-email-massa
//   Body: {
//     assunto: string,
//     tipo: 'convocacao' | 'personalizado',
//     remetente_nome?: string,
//     mensagens: { professor_id: uuid, corpo: string }[]
//   }
//   Retorna: { lote_id, total, enviados, falhas, sem_email, resultados: [...] }
//
// Segurança:
//   - verify_jwt = true (padrão) → só usuário logado chega aqui.
//   - Confere o cargo do chamador (admin/coordenacao/líder).
//   - O e-mail de destino NUNCA vem do client: é resolvido no servidor a partir
//     do professor_id → professores.email (mesmo campo do send-reminders).
//
// Secrets: BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME (mesmos das outras fns)
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Trava de segurança por disparo, alinhada ao limite diário auto-imposto de 200
// e-mails/dia (a cota real é conferida pela function email-quota-hoje). Acima disto
// é quase certo engano — e nunca caberia num dia só.
const MAX_DESTINATARIOS = 200

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ─── WhatsApp → HTML (idêntico ao enviar-convite-email) ──────────────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function corpoParaHtml(texto: string): string {
  let s = escapeHtml(texto)
  s = s.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
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

// ─── Tipos do body ────────────────────────────────────────────────────────────
interface MensagemAlvo { professor_id: string; corpo: string }

interface ResultadoDisparo {
  professor_id: string
  nome: string
  email: string | null
  status: 'enviado' | 'falha' | 'sem_email'
  erro?: string | null
}

// ─── Servidor ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  // ── 1. Body ──────────────────────────────────────────────────────────────────
  let body: { assunto?: unknown; tipo?: unknown; remetente_nome?: unknown; mensagens?: unknown }
  try { body = await req.json() } catch { return json({ error: 'JSON inválido.' }, 400) }

  const assunto = typeof body.assunto === 'string' && body.assunto.trim()
    ? body.assunto.trim() : 'Reunião de acompanhamento — King'
  const tipo = body.tipo === 'personalizado' ? 'personalizado' : 'convocacao'
  const remetente = typeof body.remetente_nome === 'string' && body.remetente_nome.trim()
    ? body.remetente_nome.trim() : 'Coordenação'

  const mensagensRaw = Array.isArray(body.mensagens) ? body.mensagens : []
  // Sanitiza + dedup por professor (última mensagem vence).
  const porProfessor = new Map<string, string>()
  for (const m of mensagensRaw as MensagemAlvo[]) {
    if (m && typeof m.professor_id === 'string' && typeof m.corpo === 'string' && m.corpo.trim()) {
      porProfessor.set(m.professor_id, m.corpo)
    }
  }
  const mensagens = [...porProfessor.entries()].map(([professor_id, corpo]) => ({ professor_id, corpo }))

  if (mensagens.length === 0) return json({ error: 'Nenhum destinatário válido.' }, 400)
  if (mensagens.length > MAX_DESTINATARIOS) {
    return json({ error: `Máximo de ${MAX_DESTINATARIOS} destinatários por disparo.` }, 422)
  }

  const url        = Deno.env.get('SUPABASE_URL')!
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // ── 2. Quem está chamando? (coordenação/admin/líder) ─────────────────────────
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
  if (!podeEnviar) return json({ error: 'Sem permissão para disparar e-mails.' }, 403)

  // ── 3. Resolve nomes + e-mails no servidor (nunca confia no client) ──────────
  const admin = createClient(url, serviceKey)
  const ids = mensagens.map(m => m.professor_id)
  const { data: profs, error: profErr } = await admin
    .from('professores')
    .select('id, nome, email')
    .in('id', ids)
  if (profErr) {
    console.error('[enviar-email-massa] erro ao ler professores:', profErr.message)
    return json({ error: 'Erro ao localizar os professores.' }, 500)
  }
  const profPor = new Map<string, { nome: string | null; email: string | null }>()
  for (const p of profs ?? []) profPor.set(p.id as string, { nome: p.nome as string | null, email: p.email as string | null })

  // ── 4. Envio via Brevo (sequencial) ──────────────────────────────────────────
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  if (!brevoKey) return json({ error: 'Envio de e-mail não configurado (BREVO_API_KEY ausente).' }, 503)

  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL') ?? 'coordenacaoking.agenda@gmail.com'
  const fromName  = Deno.env.get('BREVO_FROM_NAME')  ?? 'KOL - King Of Languages'

  const loteId = crypto.randomUUID()
  const resultados: ResultadoDisparo[] = []
  const logRows: Record<string, unknown>[] = []

  for (const m of mensagens) {
    const prof  = profPor.get(m.professor_id)
    const nome  = prof?.nome ?? 'Professor(a)'
    const email = prof?.email?.trim() ?? ''

    if (!email) {
      resultados.push({ professor_id: m.professor_id, nome, email: null, status: 'sem_email' })
      continue
    }

    let status: ResultadoDisparo['status'] = 'enviado'
    let erro: string | null = null
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          sender:      { name: `${remetente} · King`, email: fromEmail },
          to:          [{ email, name: nome }],
          replyTo:     { email: fromEmail, name: fromName },
          subject:     assunto,
          htmlContent: buildHtml(corpoParaHtml(m.corpo), remetente),
        }),
      })
      if (!res.ok) {
        status = 'falha'
        erro = (await res.text()).slice(0, 500)
        console.error(`[enviar-email-massa] ✗ ${email}:`, erro)
      } else {
        console.log(`[enviar-email-massa] ✓ ${email} (${nome})`)
      }
    } catch (e) {
      status = 'falha'
      erro = e instanceof Error ? e.message : 'erro de rede'
      console.error(`[enviar-email-massa] ✗ ${email}:`, erro)
    }

    resultados.push({ professor_id: m.professor_id, nome, email, status, erro })
    logRows.push({
      professor_id: m.professor_id,
      email,
      assunto,
      corpo: m.corpo,
      tipo,
      sucesso: status === 'enviado',
      erro,
      enviado_por: user.id,
      lote_id: loteId,
    })
  }

  // ── 5. Auditoria (best-effort — nunca derruba a resposta) ────────────────────
  if (logRows.length > 0) {
    const { error: logErr } = await admin.from('email_disparos').insert(logRows)
    if (logErr) console.error('[enviar-email-massa] falhou ao gravar auditoria:', logErr.message)
  }

  const enviados  = resultados.filter(r => r.status === 'enviado').length
  const falhas    = resultados.filter(r => r.status === 'falha').length
  const semEmail  = resultados.filter(r => r.status === 'sem_email').length

  console.log(`[enviar-email-massa] lote ${loteId}: ${enviados} enviados, ${falhas} falhas, ${semEmail} sem e-mail`)
  return json({ lote_id: loteId, total: resultados.length, enviados, falhas, sem_email: semEmail, resultados })
})
