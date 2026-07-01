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

const SEMANAS_FUTURAS = 6
const BR_OFFSET = '-03:00' // Brasil não observa horário de verão desde 2019.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Próximas N datas (uma por semana) em que `diaSemana` (0=dom…6=sáb) cai, a partir de hoje, no horário `hora` (HH:MM:SS). */
function proximasOcorrencias(diaSemana: number, hora: string, semanas: number): string[] {
  const hoje = new Date()
  const [hh, mm] = hora.split(':')
  const datas: string[] = []

  // Encontra o primeiro dia (hoje ou futuro) que bate com diaSemana.
  const base = new Date(hoje)
  base.setUTCHours(0, 0, 0, 0)
  let delta = (diaSemana - base.getUTCDay() + 7) % 7
  base.setUTCDate(base.getUTCDate() + delta)

  for (let i = 0; i < semanas; i++) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + i * 7)
    const dataStr = d.toISOString().slice(0, 10)
    datas.push(`${dataStr}T${hh}:${mm}:00${BR_OFFSET}`)
  }
  return datas.filter(iso => new Date(iso) > hoje)
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
    .select('id, nome, status, grupo_id')
    .eq('id', idProfessor)
    .maybeSingle()

  if (!professor || professor.status !== 'ativo') {
    return json({ professor: null, agendas: [] })
  }

  // ── 2. Agendas ativas autorizadas para o grupo do professor ──────────────────
  const { data: agendas, error: agendasErr } = await admin
    .from('agenda_reunioes')
    .select(`
      id, titulo, descricao, meet_link, grupos_autorizados,
      coordenador:profiles!coordenador_id (id, nome),
      recorrencias:agenda_recorrencias (id, dia_semana, hora, capacidade, meet_link, ativo),
      horarios:agenda_horarios (id, recorrencia_id, data_hora, capacidade, meet_link, ativo)
    `)
    .eq('ativo', true)

  if (agendasErr) {
    console.error('[teacher-lookup] Erro ao buscar agendas:', agendasErr.message)
    return json({ error: 'Erro ao buscar agendas.' }, 500)
  }

  const agendasAutorizadas = (agendas ?? []).filter(a => {
    const grupos = a.grupos_autorizados as string[] | null
    return !grupos || grupos.length === 0 || (professor.grupo_id != null && grupos.includes(professor.grupo_id))
  })

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

  const resultado = agendasAutorizadas
    .map(a => {
      const horariosExistentes = (a.horarios as HorarioRow[]).filter(h => h.ativo)
      const materializadosPorRecorrencia = new Map<string, Set<string>>() // recorrencia_id -> set de data_hora já materializadas

      const horarios: HorarioSaida[] = []

      // 4a. Horários já materializados (avulsos antigos OU de uma recorrência, já com ≥1 reserva).
      for (const h of horariosExistentes) {
        if (new Date(h.data_hora) <= new Date()) continue
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
        for (const iso of proximasOcorrencias(r.dia_semana, r.hora, SEMANAS_FUTURAS)) {
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
