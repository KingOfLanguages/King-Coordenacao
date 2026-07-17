// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: teacher-lookup
//
// Usada pela tela pública /agendar (sem login). Recebe o e-mail informado
// pelo professor, identifica-o via professor_emails e retorna as ocorrências
// futuras (próximas semanas) das agendas recorrentes coletivas disponíveis
// para ele (público autorizado, com vagas).
//
// Cada agenda tem uma ou mais regras de recorrência semanal (agenda_recorrencias:
// dia da semana + hora). As próximas N semanas de cada regra ativa são
// calculadas aqui em runtime ("ocorrências virtuais"); só viram uma linha real
// em agenda_horarios quando alguém reserva (ver create-booking). Por isso,
// uma ocorrência virtual sempre tem vagas = capacidade da regra; só ocorrências
// já materializadas (com pelo menos 1 reserva) têm contagem real.
//
// Não expõe nenhuma informação sobre professores/agendas que não pertençam
// ao professor informado. Roda com service-role pois anon não tem acesso
// direto às tabelas de agendamento (ver migrations 20260630_agendamentos.sql
// e 20260702_agenda_recorrencias.sql).
//
// Aceita `email` (fluxo antigo, via professor_emails) OU `professorId`
// (usado pelo novo Portal de Agendamento, que identifica o professor só
// pelo nome — a maioria não tem e-mail cadastrado — em
// portal-agendamento-lookup e repassa o id já resolvido).
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/teacher-lookup
//   Body: { "email": "professor@exemplo.com" } OU { "professorId": "uuid" }
//   Retorna: { professor: {id, nome} | null, agendas: AgendaComHorarios[] }
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DIAS_JANELA_AGENDAMENTO = 7 // professor só vê/reserva ocorrências até 7 dias à frente
const BR_OFFSET = '-03:00' // Brasil não observa horário de verão desde 2019.
const DIAS_MIN_GRUPO = 60 // reunião em grupo só para quem já tem >= 2 meses de casa

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
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

/** Ocorrências em que `diaSemana` (0=dom…6=sáb) cai no horário `hora` (HH:MM:SS),
 *  de hoje até `dias` à frente. Numa janela de 7 dias há no máximo uma por regra. */
function proximasOcorrencias(diaSemana: number, hora: string, dias: number): string[] {
  const hoje = new Date()
  const limite = new Date(hoje.getTime() + dias * 86_400_000)
  const [hh, mm] = hora.split(':')

  // Encontra o primeiro dia (hoje ou futuro) que bate com diaSemana.
  const base = new Date(hoje)
  base.setUTCHours(0, 0, 0, 0)
  const delta = (diaSemana - base.getUTCDay() + 7) % 7
  base.setUTCDate(base.getUTCDate() + delta)

  const datas: string[] = []
  // Duas iterações cobrem o caso de borda em que a 1ª ocorrência do dia já passou
  // de hora e a próxima (semana seguinte) ainda cai dentro da janela.
  for (let i = 0; i < 2; i++) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + i * 7)
    const iso = `${d.toISOString().slice(0, 10)}T${hh}:${mm}:00${BR_OFFSET}`
    const dt = new Date(iso)
    if (dt <= hoje) continue
    if (dt > limite) break
    datas.push(iso)
  }
  return datas
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: { email?: unknown; professorId?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const professorId = typeof body.professorId === 'string' ? body.professorId : ''
  if (!email && !professorId) return json({ error: 'E-mail ou professorId é obrigatório.' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Identifica o professor pelo e-mail ou pelo id já resolvido ────────────
  let idProfessor = professorId
  if (!idProfessor) {
    const { data: emailRow } = await admin
      .from('professor_emails')
      .select('professor_id')
      .ilike('email', email)
      .maybeSingle()

    if (!emailRow) return json({ professor: null, agendas: [] })
    idProfessor = emailRow.professor_id
  }

  const { data: professor } = await admin
    .from('professores')
    .select('id, nome, status, data_inicio')
    .eq('id', idProfessor)
    .maybeSingle()

  if (!professor || professor.status !== 'ativo') {
    return json({ professor: null, agendas: [] })
  }

  // Trava dos 2 meses: reunião em grupo só para quem já tem >= 60 dias de casa.
  // Defesa em profundidade — o portal já esconde a opção (portal-agendamento-lookup),
  // mas se alguém chamar direto aqui, não listamos horário nenhum.
  const dias = diasDeCasa(professor.data_inicio)
  if (dias == null || dias < DIAS_MIN_GRUPO) {
    return json({ professor: { id: professor.id, nome: professor.nome }, agendas: [] })
  }

  // ── 2. Agendas ativas de todos os coordenadores ──────────────────────────────
  // Reunião em grupo é sempre apresentada com as agendas de todos os
  // coordenadores juntas — `grupos_autorizados` não filtra mais a visibilidade
  // pro professor (o campo continua existindo no admin, mas sem efeito aqui).
  const { data: agendas, error: agendasErr } = await admin
    .from('agenda_reunioes')
    .select(`
      id, titulo, descricao, meet_link,
      coordenador:profiles!coordenador_id (id, nome),
      recorrencias:agenda_recorrencias (id, dia_semana, hora, capacidade, meet_link, ativo),
      horarios:agenda_horarios (id, recorrencia_id, data_hora, capacidade, meet_link, ativo)
    `)
    .eq('ativo', true)

  if (agendasErr) {
    console.error('[teacher-lookup] Erro ao buscar agendas:', agendasErr.message)
    return json({ error: 'Erro ao buscar agendas.' }, 500)
  }

  const agendasAutorizadas = agendas ?? []

  if (agendasAutorizadas.length === 0) {
    return json({ professor: { id: professor.id, nome: professor.nome }, agendas: [] })
  }

  // ── 3. Ocorrências já materializadas (para vagas reais e "já inscrito") ──────
  type HorarioRow = { id: string; recorrencia_id: string | null; data_hora: string; capacidade: number; meet_link: string | null; ativo: boolean }
  const horarioIds = agendasAutorizadas.flatMap(a => (a.horarios as HorarioRow[]).map(h => h.id))

  const { data: inscricoes } = horarioIds.length
    ? await admin
        .from('agenda_inscricoes')
        .select('horario_id, professor_id')
        .eq('status', 'confirmada')
        .in('horario_id', horarioIds)
    : { data: [] as { horario_id: string; professor_id: string }[] }

  const contagemPorHorario = new Map<string, number>()
  const inscritoPorHorario = new Set<string>()
  for (const i of inscricoes ?? []) {
    contagemPorHorario.set(i.horario_id, (contagemPorHorario.get(i.horario_id) ?? 0) + 1)
    if (i.professor_id === professor.id) inscritoPorHorario.add(i.horario_id)
  }

  // ── 4. Monta a lista de horários (materializados + ocorrências virtuais) ────
  type HorarioSaida = { id: string; data_hora: string; capacidade: number; meet_link: string | null; vagas: number; ja_inscrito: boolean }

  const agora = new Date()
  const limiteAgendamento = new Date(agora.getTime() + DIAS_JANELA_AGENDAMENTO * 86_400_000)

  const resultado = agendasAutorizadas
    .map(a => {
      const horariosExistentes = (a.horarios as HorarioRow[]).filter(h => h.ativo)
      const materializadosPorRecorrencia = new Map<string, Set<string>>() // recorrencia_id -> set de data_hora já materializadas

      const horarios: HorarioSaida[] = []

      // 4a. Horários já materializados (avulsos antigos OU de uma recorrência, já com ≥1 reserva).
      for (const h of horariosExistentes) {
        if (new Date(h.data_hora) <= agora) continue
        if (new Date(h.data_hora) > limiteAgendamento) continue // fora da janela de 7 dias
        const vagas = h.capacidade - (contagemPorHorario.get(h.id) ?? 0)
        const jaInscrito = inscritoPorHorario.has(h.id)
        if (vagas <= 0 && !jaInscrito) continue
        horarios.push({
          id: h.id,
          data_hora: h.data_hora,
          capacidade: h.capacidade,
          meet_link: h.meet_link ?? a.meet_link,
          vagas,
          ja_inscrito: jaInscrito,
        })
        if (h.recorrencia_id) {
          if (!materializadosPorRecorrencia.has(h.recorrencia_id)) materializadosPorRecorrencia.set(h.recorrencia_id, new Set())
          // Postgres normaliza timestamptz para UTC na resposta — compara pelo instante, não pela string.
          materializadosPorRecorrencia.get(h.recorrencia_id)!.add(new Date(h.data_hora).getTime())
        }
      }

      // 4b. Ocorrências virtuais das recorrências ativas (ainda sem nenhuma reserva nesta data).
      const recorrencias = (a.recorrencias as { id: string; dia_semana: number; hora: string; capacidade: number; meet_link: string | null; ativo: boolean }[])
        .filter(r => r.ativo)

      for (const r of recorrencias) {
        const jaMaterializadas = materializadosPorRecorrencia.get(r.id) ?? new Set()
        for (const iso of proximasOcorrencias(r.dia_semana, r.hora, DIAS_JANELA_AGENDAMENTO)) {
          if (jaMaterializadas.has(new Date(iso).getTime())) continue // já coberto pelo passo 4a
          horarios.push({
            id: `v|${r.id}|${iso}`,
            data_hora: iso,
            capacidade: r.capacidade,
            meet_link: r.meet_link ?? a.meet_link,
            vagas: r.capacidade,
            ja_inscrito: false,
          })
        }
      }

      horarios.sort((x, y) => x.data_hora.localeCompare(y.data_hora))

      return {
        id:          a.id,
        titulo:      a.titulo,
        descricao:   a.descricao,
        meet_link:   a.meet_link,
        coordenador: a.coordenador,
        horarios,
      }
    })
    .filter(a => a.horarios.length > 0)

  return json({ professor: { id: professor.id, nome: professor.nome }, agendas: resultado })
})
