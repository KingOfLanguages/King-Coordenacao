// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: create-booking
//
// Usada pela tela pública /agendar (sem login) para confirmar a inscrição de
// um professor num horário de agenda coletiva. Toda a validação é refeita
// aqui no servidor — o client nunca é confiável.
//
// horario_id pode ser:
//   - um UUID real de uma linha já materializada em agenda_horarios, OU
//   - um id virtual "v|<recorrencia_id>|<data_hora ISO>" (ver teacher-lookup),
//     representando uma ocorrência futura de uma agenda recorrente que ainda
//     não tem nenhuma reserva. Nesse caso, a linha em agenda_horarios e o
//     link do Meet são criados aqui, na primeira reserva daquela semana.
//
// Secrets necessários (Supabase Dashboard > Edge Functions > Secrets):
//   BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME   (mesmos de send-reminders)
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET             (já existentes — conta-hub)
//
// Aceita `email` (fluxo antigo) OU `professor_id` (novo Portal de
// Agendamento, que identifica o professor só pelo nome — a maioria não tem
// e-mail cadastrado). Quando não há e-mail real disponível, grava um
// placeholder sintético em agenda_inscricoes.email_usado (coluna NOT NULL)
// e pula o envio de e-mail de confirmação.
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/create-booking
//   Body: { "email": "professor@exemplo.com", "horario_id": "..." }
//      OU { "professor_id": "uuid", "horario_id": "..." }
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

// Gera o Meet de uma ocorrência via Calendar API, usando o refresh_token da
// conta-hub (mesmo já usado em daily-import). Lança erro com mensagem amigável
// em caso de falha — chamado só na 1ª reserva da semana.
async function gerarMeetLink(
  admin: ReturnType<typeof createClient>,
  titulo: string,
  dataHoraIso: string,
): Promise<string> {
  const { data: tokenRow } = await admin
    .from('google_tokens')
    .select('refresh_token')
    .limit(1)
    .maybeSingle()
  if (!tokenRow?.refresh_token) {
    throw new Error('A integração com o Google Calendar não está configurada. Avise a coordenação.')
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: tokenRow.refresh_token,
      grant_type:    'refresh_token',
    }),
  })
  const tokenData = await tokenRes.json()
  if (tokenData.error) {
    console.error('[create-booking] Erro ao renovar token Google:', tokenData.error)
    throw new Error('Não foi possível gerar o link da reunião agora. Tente novamente em instantes.')
  }

  const inicio = new Date(dataHoraIso)
  const fim    = new Date(inicio.getTime() + 60 * 60 * 1000)

  const eventRes = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: titulo,
        start: { dateTime: inicio.toISOString(), timeZone: 'America/Sao_Paulo' },
        end:   { dateTime: fim.toISOString(),    timeZone: 'America/Sao_Paulo' },
        conferenceData: {
          createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
        },
      }),
    },
  )
  const event = await eventRes.json()
  if (!eventRes.ok || !event.hangoutLink) {
    console.error('[create-booking] Erro ao criar evento Google:', JSON.stringify(event))
    throw new Error('Não foi possível gerar o link da reunião agora. Tente novamente em instantes.')
  }
  return event.hangoutLink as string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: { email?: unknown; professor_id?: unknown; horario_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const emailInformado = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const professorId    = typeof body.professor_id === 'string' ? body.professor_id.trim() : ''
  const horarioId      = typeof body.horario_id === 'string' ? body.horario_id.trim() : ''
  if ((!emailInformado && !professorId) || !horarioId) {
    return json({ error: 'Professor e horário são obrigatórios.' }, 400)
  }

  // Log de correlação: identifica QUAL professor/horário em cada request, para
  // que os console.error de falha abaixo (token Google, materialização, insert)
  // possam ser rastreados até a reserva específica que quebrou. Sem isso, o
  // relato "professor X não consegue agendar" não tinha como ser diagnosticado.
  console.log(`[create-booking] req professor_id=${professorId || '(via email)'} email=${emailInformado || '—'} horario_id=${horarioId}`)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Professor existe e está ativo? ────────────────────────────────────────
  let idProfessor = professorId
  if (!idProfessor) {
    const { data: emailRow } = await admin
      .from('professor_emails')
      .select('professor_id')
      .ilike('email', emailInformado)
      .maybeSingle()
    if (!emailRow) return json({ error: 'Professor não encontrado para este e-mail.' }, 404)
    idProfessor = emailRow.professor_id
  }

  const { data: professor } = await admin
    .from('professores')
    .select('id, nome, grupo_id, status, email')
    .eq('id', idProfessor)
    .maybeSingle()
  if (!professor || professor.status !== 'ativo') {
    return json({ error: 'Professor não encontrado.' }, 404)
  }

  // E-mail real pra registrar/enviar confirmação: o informado no request,
  // senão o cadastrado em professores.email (legado), senão nenhum — nesse
  // caso usamos um placeholder só pra satisfazer a coluna NOT NULL e pulamos
  // o envio de confirmação (ver passo 5).
  const emailReal = emailInformado || (professor.email ? professor.email.trim().toLowerCase() : '')
  const emailParaRegistro = emailReal || `sem-email-${professor.id}@king.internal`

  // ── 2. Resolve o horário: linha real já materializada, ou ocorrência virtual
  //      de uma recorrência ("v|<recorrencia_id>|<data_hora ISO>") ────────────
  type AgendaInfo = {
    id: string; titulo: string; meet_link: string | null; ativo: boolean
    grupos_autorizados: string[] | null
    coordenador: { nome: string } | null
  }
  let horario: { id: string; data_hora: string; capacidade: number; meet_link: string | null; ativo: boolean }
  let agenda: AgendaInfo

  if (horarioId.startsWith('v|')) {
    const [, recorrenciaId, dataHoraIso] = horarioId.split('|')
    if (!recorrenciaId || !dataHoraIso) return json({ error: 'Horário inválido.' }, 400)
    if (new Date(dataHoraIso) <= new Date()) return json({ error: 'Este horário não está mais disponível.' }, 409)

    const { data: recorrencia } = await admin
      .from('agenda_recorrencias')
      .select(`
        id, capacidade, meet_link, ativo,
        agenda:agenda_reunioes (
          id, titulo, meet_link, ativo, grupos_autorizados,
          coordenador:profiles!coordenador_id (nome)
        )
      `)
      .eq('id', recorrenciaId)
      .maybeSingle()

    if (!recorrencia || !recorrencia.ativo) return json({ error: 'Horário não encontrado.' }, 404)
    agenda = recorrencia.agenda as unknown as AgendaInfo
    if (!agenda || !agenda.ativo) return json({ error: 'Esta agenda não está mais disponível.' }, 409)

    const grupos = agenda.grupos_autorizados
    const autorizado = !grupos || grupos.length === 0 || (professor.grupo_id != null && grupos.includes(professor.grupo_id))
    if (!autorizado) return json({ error: 'Você não está autorizado a se inscrever nesta agenda.' }, 403)

    // Tenta achar uma materialização já existente (ex.: outro professor reservou primeiro).
    const { data: existente } = await admin
      .from('agenda_horarios')
      .select('id, data_hora, capacidade, meet_link, ativo')
      .eq('recorrencia_id', recorrenciaId)
      .eq('data_hora', dataHoraIso)
      .maybeSingle()

    if (existente) {
      horario = existente
    } else {
      let meetLink = recorrencia.meet_link
      if (!meetLink) {
        try {
          meetLink = await gerarMeetLink(admin, agenda.titulo, dataHoraIso)
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : 'Erro ao gerar link da reunião.' }, 502)
        }
      }

      const { data: criado, error: criarErr } = await admin
        .from('agenda_horarios')
        .insert({
          agenda_id: agenda.id,
          recorrencia_id: recorrenciaId,
          data_hora: dataHoraIso,
          capacidade: recorrencia.capacidade,
          meet_link: meetLink,
        })
        .select('id, data_hora, capacidade, meet_link, ativo')
        .single()

      if (criarErr) {
        // Corrida: outra reserva materializou no meio tempo — busca de novo.
        const { data: retry } = await admin
          .from('agenda_horarios')
          .select('id, data_hora, capacidade, meet_link, ativo')
          .eq('recorrencia_id', recorrenciaId)
          .eq('data_hora', dataHoraIso)
          .maybeSingle()
        if (!retry) {
          console.error('[create-booking] Erro ao materializar horário:', criarErr.message)
          return json({ error: 'Erro ao confirmar inscrição.' }, 500)
        }
        horario = retry
      } else {
        horario = criado
      }
    }
  } else {
    const { data: horarioRow } = await admin
      .from('agenda_horarios')
      .select(`
        id, data_hora, capacidade, meet_link, ativo,
        agenda:agenda_reunioes (
          id, titulo, meet_link, ativo, grupos_autorizados,
          coordenador:profiles!coordenador_id (nome)
        )
      `)
      .eq('id', horarioId)
      .maybeSingle()

    if (!horarioRow || !horarioRow.ativo) return json({ error: 'Horário não encontrado.' }, 404)
    if (new Date(horarioRow.data_hora) <= new Date()) return json({ error: 'Este horário não está mais disponível.' }, 409)

    agenda = horarioRow.agenda as unknown as AgendaInfo
    if (!agenda || !agenda.ativo) return json({ error: 'Esta agenda não está mais disponível.' }, 409)

    const grupos = agenda.grupos_autorizados
    const autorizado = !grupos || grupos.length === 0 || (professor.grupo_id != null && grupos.includes(professor.grupo_id))
    if (!autorizado) return json({ error: 'Você não está autorizado a se inscrever nesta agenda.' }, 403)

    horario = horarioRow
  }

  // ── 3. Já inscrito? ───────────────────────────────────────────────────────────
  const { data: jaInscrito } = await admin
    .from('agenda_inscricoes')
    .select('id')
    .eq('horario_id', horario.id)
    .eq('professor_id', professor.id)
    .eq('status', 'confirmada')
    .maybeSingle()
  if (jaInscrito) return json({ error: 'Você já está inscrito neste horário.' }, 409)

  // ── 4. Vaga disponível? (recontagem na hora, mais inserção com revalidação) ──
  const { count } = await admin
    .from('agenda_inscricoes')
    .select('id', { count: 'exact', head: true })
    .eq('horario_id', horario.id)
    .eq('status', 'confirmada')
  if ((count ?? 0) >= horario.capacidade) return json({ error: 'Não há mais vagas neste horário.' }, 409)

  const { error: insertErr } = await admin
    .from('agenda_inscricoes')
    .insert({ horario_id: horario.id, professor_id: professor.id, email_usado: emailParaRegistro, status: 'confirmada' })

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
    .eq('horario_id', horario.id)
    .eq('status', 'confirmada')

  if ((countDepois ?? 0) > horario.capacidade) {
    await admin
      .from('agenda_inscricoes')
      .delete()
      .eq('horario_id', horario.id)
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
  const meetLink  = horario.meet_link ?? agenda.meet_link

  if (brevoKey && emailReal) {
    const fromEmail = Deno.env.get('BREVO_FROM_EMAIL') ?? 'coordenacaoking.agenda@gmail.com'
    const fromName  = Deno.env.get('BREVO_FROM_NAME')  ?? 'KOL - King Of Languages'
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          sender:      { name: fromName, email: fromEmail },
          to:          [{ email: emailReal, name: professor.nome }],
          subject:     `Inscrição confirmada: ${agenda.titulo}`,
          htmlContent: buildHtml({
            professorNome: professor.nome,
            titulo:        agenda.titulo,
            dataHoraFmt,
            meetLink,
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
      meet_link:        meetLink,
      email_enviado:    !!emailReal,
    },
  })
})
