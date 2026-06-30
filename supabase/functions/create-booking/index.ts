// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: create-booking
//
// Usada pela tela pública /agendar (sem login) para confirmar a inscrição de
// um professor num horário de agenda coletiva. Toda a validação é refeita
// aqui no servidor — o client nunca é confiável.
//
// Secrets necessários (Supabase Dashboard > Edge Functions > Secrets):
//   BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME   (mesmos de send-reminders)
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/create-booking
//   Body: { "email": "professor@exemplo.com", "horario_id": "uuid" }
//   Retorna: { reuniao: { titulo, data_hora, coordenador_nome, meet_link } }
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

function buildHtml({ professorNome, titulo, dataHoraFmt, meetLink, coordNome }: {
  professorNome: string
  titulo:        string
  dataHoraFmt:   string
  meetLink:      string | null
  coordNome:     string
}): string {
  const meetBtn = meetLink
    ? `<div style="margin:24px 0;">
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
        <tr>
          <td style="background:#1e293b;padding:28px 32px;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">
              King Education
            </p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#f8fafc;">
              Inscrição confirmada
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:15px;color:#1e293b;">
              Olá, <strong>${professorNome}</strong>!
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
              Sua participação foi confirmada:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Reunião</p>
                  <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#1e293b;">${titulo}</p>
                  <p style="margin:0;font-size:14px;color:#475569;">${dataHoraFmt} · com ${coordNome}</p>
                </td>
              </tr>
            </table>
            ${meetBtn}
            <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
              Esta confirmação foi enviada pela plataforma King Education.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e4e4e7;padding:16px 32px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
              © ${new Date().getFullYear()} King Education
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: { email?: unknown; horario_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const email     = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const horarioId = typeof body.horario_id === 'string' ? body.horario_id.trim() : ''
  if (!email || !horarioId) return json({ error: 'E-mail e horário são obrigatórios.' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Professor existe e está ativo? ────────────────────────────────────────
  const { data: emailRow } = await admin
    .from('professor_emails')
    .select('professor_id')
    .ilike('email', email)
    .maybeSingle()
  if (!emailRow) return json({ error: 'Professor não encontrado para este e-mail.' }, 404)

  const { data: professor } = await admin
    .from('professores')
    .select('id, nome, grupo_id, status')
    .eq('id', emailRow.professor_id)
    .maybeSingle()
  if (!professor || professor.status !== 'ativo') {
    return json({ error: 'Professor não encontrado para este e-mail.' }, 404)
  }

  // ── 2. Horário/agenda válidos, ativos, futuros, autorizados ─────────────────
  const { data: horario } = await admin
    .from('agenda_horarios')
    .select(`
      id, data_hora, capacidade, ativo,
      agenda:agenda_reunioes (
        id, titulo, meet_link, ativo, grupos_autorizados,
        coordenador:profiles!coordenador_id (nome)
      )
    `)
    .eq('id', horarioId)
    .maybeSingle()

  if (!horario || !horario.ativo) return json({ error: 'Horário não encontrado.' }, 404)
  if (new Date(horario.data_hora) <= new Date()) return json({ error: 'Este horário não está mais disponível.' }, 409)

  const agenda = horario.agenda as unknown as {
    id: string; titulo: string; meet_link: string | null; ativo: boolean
    grupos_autorizados: string[] | null
    coordenador: { nome: string } | null
  }
  if (!agenda || !agenda.ativo) return json({ error: 'Esta agenda não está mais disponível.' }, 409)

  const grupos = agenda.grupos_autorizados
  const autorizado = !grupos || grupos.length === 0 || (professor.grupo_id != null && grupos.includes(professor.grupo_id))
  if (!autorizado) return json({ error: 'Você não está autorizado a se inscrever nesta agenda.' }, 403)

  // ── 3. Já inscrito? ───────────────────────────────────────────────────────────
  const { data: jaInscrito } = await admin
    .from('agenda_inscricoes')
    .select('id')
    .eq('horario_id', horarioId)
    .eq('professor_id', professor.id)
    .eq('status', 'confirmada')
    .maybeSingle()
  if (jaInscrito) return json({ error: 'Você já está inscrito neste horário.' }, 409)

  // ── 4. Vaga disponível? (recontagem na hora, mais inserção com revalidação) ──
  const { count } = await admin
    .from('agenda_inscricoes')
    .select('id', { count: 'exact', head: true })
    .eq('horario_id', horarioId)
    .eq('status', 'confirmada')
  if ((count ?? 0) >= horario.capacidade) return json({ error: 'Não há mais vagas neste horário.' }, 409)

  const { error: insertErr } = await admin
    .from('agenda_inscricoes')
    .insert({ horario_id: horarioId, professor_id: professor.id, email_usado: email, status: 'confirmada' })

  if (insertErr) {
    // Índice único pega corrida de duplo-clique/duplicidade.
    if (/duplicate|unique/i.test(insertErr.message)) {
      return json({ error: 'Você já está inscrito neste horário.' }, 409)
    }
    console.error('[create-booking] Erro ao inserir inscrição:', insertErr.message)
    return json({ error: 'Erro ao confirmar inscrição.' }, 500)
  }

  // Revalida após o insert para evitar overbooking por corrida concorrente.
  const { count: countDepois } = await admin
    .from('agenda_inscricoes')
    .select('id', { count: 'exact', head: true })
    .eq('horario_id', horarioId)
    .eq('status', 'confirmada')

  if ((countDepois ?? 0) > horario.capacidade) {
    await admin
      .from('agenda_inscricoes')
      .delete()
      .eq('horario_id', horarioId)
      .eq('professor_id', professor.id)
      .eq('status', 'confirmada')
    return json({ error: 'Não há mais vagas neste horário.' }, 409)
  }

  // ── 5. E-mail de confirmação (best-effort, não bloqueia a resposta) ──────────
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  const dataHoraFmt = new Date(horario.data_hora).toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
  const coordNome = agenda.coordenador?.nome ?? 'Coordenação'

  if (brevoKey) {
    const fromEmail = Deno.env.get('BREVO_FROM_EMAIL') ?? 'coordenacaoking.agenda@gmail.com'
    const fromName  = Deno.env.get('BREVO_FROM_NAME')  ?? 'KOL - King Of Languages'
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          sender:      { name: fromName, email: fromEmail },
          to:          [{ email, name: professor.nome }],
          subject:     `Inscrição confirmada: ${agenda.titulo}`,
          htmlContent: buildHtml({
            professorNome: professor.nome,
            titulo:        agenda.titulo,
            dataHoraFmt,
            meetLink:      agenda.meet_link,
            coordNome,
          }),
        }),
      })
      if (!res.ok) console.error('[create-booking] Falha ao enviar e-mail:', await res.text())
    } catch (err) {
      console.error('[create-booking] Erro ao enviar e-mail:', err)
    }
  }

  return json({
    reuniao: {
      titulo:           agenda.titulo,
      data_hora:         horario.data_hora,
      coordenador_nome: coordNome,
      meet_link:        agenda.meet_link,
    },
  })
})
