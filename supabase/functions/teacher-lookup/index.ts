// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: teacher-lookup
//
// Usada pela tela pública /agendar (sem login). Recebe o e-mail informado
// pelo professor, identifica-o via professor_emails e retorna as agendas
// coletivas disponíveis para ele (público autorizado, com vagas, futuras).
//
// Não expõe nenhuma informação sobre professores/agendas que não pertençam
// ao e-mail informado. Roda com service-role pois anon não tem acesso direto
// às tabelas de agendamento (ver migration 20260630_agendamentos.sql).
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/teacher-lookup
//   Body: { "email": "professor@exemplo.com" }
//   Retorna: { professor: {id, nome} | null, agendas: AgendaComHorarios[] }
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: { email?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) return json({ error: 'E-mail é obrigatório.' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Identifica o professor pelo e-mail ────────────────────────────────────
  const { data: emailRow } = await admin
    .from('professor_emails')
    .select('professor_id')
    .ilike('email', email)
    .maybeSingle()

  if (!emailRow) return json({ professor: null, agendas: [] })

  const { data: professor } = await admin
    .from('professores')
    .select('id, nome, status, grupo_id')
    .eq('id', emailRow.professor_id)
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
      horarios:agenda_horarios (id, data_hora, capacidade, ativo)
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

  // ── 3. Inscrições confirmadas (para calcular vagas e "já inscrito") ──────────
  const horarioIds = agendasAutorizadas.flatMap(a =>
    (a.horarios as { id: string }[]).map(h => h.id),
  )

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

  const agora = new Date()

  const resultado = agendasAutorizadas
    .map(a => {
      const horarios = (a.horarios as { id: string; data_hora: string; capacidade: number; ativo: boolean }[])
        .filter(h => h.ativo && new Date(h.data_hora) > agora)
        .map(h => ({
          id:           h.id,
          data_hora:    h.data_hora,
          capacidade:   h.capacidade,
          vagas:        h.capacidade - (contagemPorHorario.get(h.id) ?? 0),
          ja_inscrito:  inscritoPorHorario.has(h.id),
        }))
        .filter(h => h.vagas > 0 || h.ja_inscrito)
        .sort((x, y) => x.data_hora.localeCompare(y.data_hora))

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
