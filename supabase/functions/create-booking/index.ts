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
//     não tem nenhuma reserva. Nesse caso, a linha em agenda_horarios é criada
//     aqui, na primeira reserva daquela semana, herdando o meet_link fixo da
//     recorrência (informado manualmente pelo coordenador). O sistema NÃO gera
//     link de Meet nem cria evento no Google — só o professor adiciona o evento
//     ao próprio calendário (link TEMPLATE na tela/e-mail de confirmação).
//   Só ocorrências dos próximos 7 dias são reserváveis (DIAS_JANELA_AGENDAMENTO).
//
// Secrets necessários (Supabase Dashboard > Edge Functions > Secrets):
//   BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME   (mesmos de send-reminders)
//
// O professor vem da sessão do portal (`portal-identidade`, código no e-mail
// oficial). Até o pentest de 05/10/2026 bastava mandar `email` ou `professor_id`
// soltos no corpo para reservar — e disparar e-mail — em nome de qualquer um.
// A confirmação vai sempre para professores.email; sem e-mail no cadastro,
// gravamos um placeholder em agenda_inscricoes.email_usado (coluna NOT NULL) e
// pulamos o envio.
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/create-booking
//   Body: { "token": "<sessão do portal-identidade>", "horario_id": "..." }
//   Retorna: { reuniao: { titulo, data_hora, coordenador_nome, meet_link } }
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { jsonPara, preflight, resolverSessao, MSG_SESSAO } from '../_shared/portal.ts'

const DIAS_MIN_GRUPO = 60 // reunião em grupo só para quem já tem >= 2 meses de casa
const SCORE_MINIMO_GRUPO = 1300 // mesmo corte do portal-agendamento-lookup
const DIAS_JANELA_AGENDAMENTO = 7 // professor só reserva ocorrências até 7 dias à frente

/** Link TEMPLATE do Google Calendar — abre o formulário "adicionar evento" no
 *  calendário do PRÓPRIO professor (não cria evento em calendário de ninguém). */
function googleCalendarUrl(titulo: string, dataHoraIso: string, meetLink: string | null): string {
  const inicio = new Date(dataHoraIso)
  const fim = new Date(inicio.getTime() + 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo,
    dates: `${fmt(inicio)}/${fmt(fim)}`,
    details: meetLink ? `Link da reunião: ${meetLink}` : '',
    location: meetLink ?? '',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Dias completos desde data_inicio (meia-noite UTC). null se sem data / inválida. */
function diasDeCasa(dataIso: string | null): number | null {
  if (!dataIso) return null
  const d = new Date(dataIso)
  if (isNaN(d.getTime())) return null
  const agora = new Date()
  const dUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const agoraUTC = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
  return Math.round((agoraUTC - dUTC) / 86400000)
}

/** Garante o esquema https://. Links legados às vezes vêm como "meet.google.com/xxx"
 *  sem esquema — o que vira URL relativa (link quebrado) no e-mail/portal. */
function comHttps(link: string | null): string | null {
  if (!link) return link
  const l = link.trim()
  if (!l) return null
  return /^https?:\/\//i.test(l) ? l : `https://${l}`
}

function buildHtml({ professorNome, titulo, dataHoraFmt, meetLink, coordNome, calendarUrl }: {
  professorNome: string
  titulo:        string
  dataHoraFmt:   string
  meetLink:      string | null
  coordNome:     string
  calendarUrl:   string
}): string {
  const meetBtn = meetLink
    ? `<a href="${meetLink}"
          style="display:inline-block;background:#2563EB;color:#fff;padding:12px 24px;
                 border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          Entrar na reunião
        </a>`
    : ''

  const calendarBtn = `<a href="${calendarUrl}"
          style="display:inline-block;background:#fff;color:#1e293b;padding:12px 24px;
                 border:1px solid #cbd5e1;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          Adicionar ao calendário
        </a>`

  const acoesBtn = `<div style="margin:24px 0;line-height:2.4;">${meetBtn}${meetLink ? '&nbsp;&nbsp;' : ''}${calendarBtn}</div>`

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
                  <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1e293b;">${titulo}</p>
                  <p style="margin:0 0 2px;font-size:15px;font-weight:600;color:#1e293b;text-transform:capitalize;">${dataHoraFmt}</p>
                  <p style="margin:0;font-size:14px;color:#475569;">com ${coordNome}</p>
                </td>
              </tr>
            </table>
            ${acoesBtn}
            <p style="margin:16px 0 0;font-size:13px;color:#475569;line-height:1.6;">
              Atenção: este link é exclusivo da reunião de <strong style="color:#1e293b;">${dataHoraFmt}</strong>.
              Cada data tem um link diferente — entre sempre pelo link desta confirmação.
            </p>
            <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
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
  if (req.method === 'OPTIONS') return preflight(req)
  const json = jsonPara(req)
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: { token?: unknown; horario_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const horarioId = typeof body.horario_id === 'string' ? body.horario_id.trim() : ''
  if (!horarioId) return json({ error: 'Horário é obrigatório.' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Professor da sessão, ativo ────────────────────────────────────────────
  const sessao = await resolverSessao(admin, body.token)
  if (!sessao) return json({ error: MSG_SESSAO }, 401)

  // Log de correlação: identifica QUAL professor/horário em cada request, para
  // que os console.error de falha abaixo (materialização, insert) possam ser
  // rastreados até a reserva específica que quebrou.
  console.log(`[create-booking] req professor_id=${sessao.id} horario_id=${horarioId}`)

  const { data: professor } = await admin
    .from('professores')
    .select('id, nome, status, email, data_inicio')
    .eq('id', sessao.id)
    .maybeSingle()
  if (!professor || professor.status !== 'ativo') {
    return json({ error: 'Seu cadastro não está ativo. Fale com a coordenação.' }, 403)
  }

  // Score mínimo — o portal só mostra a opção a quem tem, mas a regra vale aqui.
  const { data: acomp } = await admin
    .from('professor_acompanhamento')
    .select('score_atual')
    .eq('professor_id', professor.id)
    .maybeSingle()
  if ((acomp?.score_atual ?? 0) < SCORE_MINIMO_GRUPO) {
    return json({ error: 'As reuniões em grupo ainda não estão liberadas para você.' }, 403)
  }

  // Trava dos 2 meses: create-booking só reserva reunião em grupo, então a regra
  // vale para toda reserva aqui. Gate autoritativo (server-side) — o portal e o
  // teacher-lookup já escondem/não listam, mas a validação real é esta.
  const diasCasa = diasDeCasa(professor.data_inicio)
  if (diasCasa == null || diasCasa < DIAS_MIN_GRUPO) {
    console.log(`[create-booking] bloqueado por tempo de casa: professor=${professor.id} dias=${diasCasa}`)
    return json({ error: 'As reuniões em grupo ficam disponíveis a partir de 2 meses de casa.' }, 403)
  }

  // E-mail real pra registrar/enviar confirmação: o do cadastro, senão nenhum —
  // nesse caso usamos um placeholder só pra satisfazer a coluna NOT NULL e
  // pulamos o envio de confirmação (ver passo 5).
  const emailReal = professor.email ? professor.email.trim().toLowerCase() : ''
  const emailParaRegistro = emailReal || `sem-email-${professor.id}@king.internal`

  // ── 2. Resolve o horário: linha real já materializada, ou ocorrência virtual
  //      de uma recorrência ("v|<recorrencia_id>|<data_hora ISO>") ────────────
  type AgendaInfo = {
    id: string; titulo: string; meet_link: string | null; ativo: boolean
    coordenador: { id: string; nome: string } | null
  }
  let horario: { id: string; data_hora: string; capacidade: number; meet_link: string | null; ativo: boolean }
  let agenda: AgendaInfo
  // Link fixo da recorrência = fonte única da verdade (informado pelo coordenador).
  let recorrenciaMeetLink: string | null = null

  // Teto da janela de agendamento: professor só reserva até 7 dias à frente
  // (espelha o teacher-lookup, que só lista essa janela). Gate autoritativo.
  const limiteAgendamento = new Date(Date.now() + DIAS_JANELA_AGENDAMENTO * 86400000)

  if (horarioId.startsWith('v|')) {
    const [, recorrenciaId, dataHoraIso] = horarioId.split('|')
    if (!recorrenciaId || !dataHoraIso) return json({ error: 'Horário inválido.' }, 400)
    if (new Date(dataHoraIso) <= new Date()) return json({ error: 'Este horário não está mais disponível.' }, 409)
    if (new Date(dataHoraIso) > limiteAgendamento) return json({ error: 'Só é possível agendar reuniões dos próximos 7 dias.' }, 409)

    const { data: recorrencia } = await admin
      .from('agenda_recorrencias')
      .select(`
        id, capacidade, meet_link, ativo,
        agenda:agenda_reunioes (
          id, titulo, meet_link, ativo, coordenador_id,
          coordenador:profiles!coordenador_id (id, nome)
        )
      `)
      .eq('id', recorrenciaId)
      .maybeSingle()

    if (!recorrencia || !recorrencia.ativo) return json({ error: 'Horário não encontrado.' }, 404)
    agenda = recorrencia.agenda as unknown as AgendaInfo
    if (!agenda || !agenda.ativo) return json({ error: 'Esta agenda não está mais disponível.' }, 409)
    recorrenciaMeetLink = recorrencia.meet_link

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
      // Link SEMPRE vem da recorrência (informado manualmente pelo coordenador).
      // O sistema não gera mais Meet nem cria evento no Google.
      const meetLink = recorrencia.meet_link
      if (!meetLink) {
        console.error('[create-booking] recorrência sem meet_link:', recorrenciaId)
        return json({ error: 'Esta reunião ainda não tem link definido. Avise a coordenação.' }, 409)
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
        recorrencia:agenda_recorrencias (meet_link),
        agenda:agenda_reunioes (
          id, titulo, meet_link, ativo, coordenador_id,
          coordenador:profiles!coordenador_id (id, nome)
        )
      `)
      .eq('id', horarioId)
      .maybeSingle()

    if (!horarioRow || !horarioRow.ativo) return json({ error: 'Horário não encontrado.' }, 404)
    if (new Date(horarioRow.data_hora) <= new Date()) return json({ error: 'Este horário não está mais disponível.' }, 409)
    if (new Date(horarioRow.data_hora) > limiteAgendamento) return json({ error: 'Só é possível agendar reuniões dos próximos 7 dias.' }, 409)

    agenda = horarioRow.agenda as unknown as AgendaInfo
    if (!agenda || !agenda.ativo) return json({ error: 'Esta agenda não está mais disponível.' }, 409)

    recorrenciaMeetLink = (horarioRow.recorrencia as unknown as { meet_link: string | null } | null)?.meet_link ?? null
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

  // ── 5. Fase 3: Criar/atualizar reunião de grupo via RPC transacional ────────
  // Atomicidade: insere reunioes + atualiza agenda_horarios.reuniao_id +
  // insere reuniao_professores para cada professor já inscrito + novo.
  const coordenadorId = agenda.coordenador?.id ?? null
  if (!coordenadorId) {
    console.error('[create-booking] Agenda sem coordenador_id: agenda_id=%s', agenda.id)
    return json({ error: 'Erro de configuração da agenda. Avise a coordenação.' }, 500)
  }

  const { data: rpcResult, error: rpcErr } = await admin.rpc('criar_reuniao_grupo', {
    p_horario_id: horario.id,
    p_professor_id: professor.id,
    p_agenda_id: agenda.id,
    p_agenda_titulo: agenda.titulo,
    p_data_hora: horario.data_hora,
    p_coordenador_id: coordenadorId,
  })

  if (rpcErr) {
    console.error('[create-booking] Erro ao criar reunião de grupo:', rpcErr.message)
    // CRÍTICO: inscrição entrou em agenda_inscricoes mas reunião falhou — estado inconsistente.
    // Reverter a inscrição pra evitar overbooking/inconsistência.
    await admin
      .from('agenda_inscricoes')
      .delete()
      .eq('horario_id', horario.id)
      .eq('professor_id', professor.id)
      .eq('status', 'confirmada')
    return json({ error: 'Erro ao confirmar participação. Tente novamente.' }, 500)
  }

  if (!rpcResult || !Array.isArray(rpcResult) || rpcResult.length === 0) {
    console.error('[create-booking] RPC retornou resultado vazio')
    await admin
      .from('agenda_inscricoes')
      .delete()
      .eq('horario_id', horario.id)
      .eq('professor_id', professor.id)
      .eq('status', 'confirmada')
    return json({ error: 'Erro ao confirmar participação. Tente novamente.' }, 500)
  }

  const criadaReuniaoId = rpcResult[0].reuniao_id
  console.log(`[create-booking] reunião criada/atualizada: reuniao_id=%s professor=%s`, criadaReuniaoId, professor.id)

  // ── 6. E-mail de confirmação (best-effort, não bloqueia a resposta) ──────────
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  const dataHoraFmt = new Date(horario.data_hora).toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
  const coordNome = agenda.coordenador?.nome ?? 'Coordenação'
  // Link canônico = o da recorrência (fonte única). Se JÁ havia inscritos antes
  // deste professor (passo 4, `count`), mantém o link da ocorrência — foi o que
  // eles receberam, não dá pra dividir a sala. Se este é o 1º inscrito, adota o
  // canônico e cura a linha (nenhum aviso foi enviado ainda com o link antigo).
  const canonicalLink = comHttps(recorrenciaMeetLink)
  const jaHaviaInscritos = (count ?? 0) > 0
  const meetLink = jaHaviaInscritos
    ? comHttps(horario.meet_link ?? recorrenciaMeetLink ?? agenda.meet_link)
    : (canonicalLink ?? comHttps(horario.meet_link ?? agenda.meet_link))
  if (!jaHaviaInscritos && canonicalLink && horario.meet_link !== canonicalLink) {
    await admin.from('agenda_horarios').update({ meet_link: canonicalLink }).eq('id', horario.id)
  }
  const calendarUrl = googleCalendarUrl(agenda.titulo, horario.data_hora, meetLink)

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
            calendarUrl,
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
