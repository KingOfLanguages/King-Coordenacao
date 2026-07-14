import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type OcorrenciaComLink = {
  id: string
  data_hora: string
  meet_link: string | null
  inscritos: number
  coordenador_confirmado: boolean
}

export type RecorrenciaComReservas = {
  id: string
  dia_semana: number
  hora: string
  capacidade: number
  meet_link: string | null
  ativo: boolean
  proximas_reservas: number
  proximas_ocorrencias: OcorrenciaComLink[]
  /** True quando as próximas ocorrências foram pré-criadas com o coordenador confirmado. */
  coordenador_confirmado: boolean
}

export type AgendaComRecorrencias = {
  id: string
  titulo: string
  descricao: string | null
  meet_link: string | null
  grupos_autorizados: string[] | null
  ativo: boolean
  created_at: string
  coordenador: { id: string; nome: string } | null
  recorrencias: RecorrenciaComReservas[]
}

/** Lista todas as agendas (coordenação/admin) com suas recorrências e reservas futuras. */
export function useAgendas() {
  return useQuery({
    queryKey: ['agendas'],
    queryFn: async (): Promise<AgendaComRecorrencias[]> => {
      const { data, error } = await supabase
        .from('agenda_reunioes')
        .select(`
          id, titulo, descricao, meet_link, grupos_autorizados, ativo, created_at,
          coordenador:profiles!coordenador_id (id, nome),
          recorrencias:agenda_recorrencias (
            id, dia_semana, hora, capacidade, meet_link, ativo,
            horarios:agenda_horarios (
              id, data_hora, meet_link, coordenador_confirmado,
              inscricoes:agenda_inscricoes (status)
            )
          )
        `)
        .order('created_at', { ascending: false })
      if (error) throw error

      const agora = Date.now()
      return (data ?? []).map((a: Record<string, unknown>) => ({
        ...a,
        recorrencias: (a.recorrencias as Record<string, unknown>[]).map(r => {
          const horarios = r.horarios as { id: string; data_hora: string; meet_link: string | null; coordenador_confirmado: boolean; inscricoes: { status: string }[] }[]
          const futuros = horarios
            .filter(h => new Date(h.data_hora).getTime() > agora)
            .sort((x, y) => x.data_hora.localeCompare(y.data_hora))
          const proximas_reservas = futuros
            .reduce((soma, h) => soma + h.inscricoes.filter(i => i.status === 'confirmada').length, 0)
          return {
            id: r.id as string,
            dia_semana: r.dia_semana as number,
            hora: r.hora as string,
            capacidade: r.capacidade as number,
            meet_link: r.meet_link as string | null,
            ativo: r.ativo as boolean,
            proximas_reservas,
            proximas_ocorrencias: futuros.map(h => ({
              id: h.id,
              data_hora: h.data_hora,
              meet_link: h.meet_link,
              inscritos: h.inscricoes.filter(i => i.status === 'confirmada').length,
              coordenador_confirmado: !!h.coordenador_confirmado,
            })),
            coordenador_confirmado: futuros.length > 0 && futuros.every(h => !!h.coordenador_confirmado),
          }
        }),
      })) as AgendaComRecorrencias[]
    },
  })
}

export type NovaRecorrencia = { dia_semana: number; hora: string; capacidade: number; meet_link?: string | null }

/** Pré-gera as ocorrências (Meet próprio por ocorrência + coordenador confirmado)
 *  de uma agenda logo após criá-la ou adicionar um horário. Best-effort: se o
 *  Google falhar, a agenda segue criada e o create-booking gera o link na 1ª
 *  reserva (fallback). */
export type MaterializacaoResultado = { materializou: boolean; aviso?: string }

async function materializarAgenda(agendaId: string): Promise<MaterializacaoResultado> {
  try {
    const { data, error } = await supabase.functions.invoke('materializar-ocorrencias', {
      body: { agenda_id: agendaId },
    })
    if (error) return { materializou: false, aviso: 'Não deu pra pré-gerar os links agora — eles serão criados na primeira reserva.' }
    const d = data as { criadas?: number; erros?: number } | null
    if (d && (d.erros ?? 0) > 0 && (d.criadas ?? 0) === 0) {
      return { materializou: false, aviso: 'Não foi possível gerar os links no Google agora. Verifique a integração.' }
    }
    return { materializou: true }
  } catch {
    return { materializou: false, aviso: 'Não deu pra pré-gerar os links agora — eles serão criados na primeira reserva.' }
  }
}

/** Cria uma agenda recorrente com suas regras de horário semanal. */
export function useCriarAgenda() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      titulo: string
      descricao?: string | null
      coordenador_id?: string | null
      grupos_autorizados: string[] | null
      recorrencias: NovaRecorrencia[]
    }) => {
      const { data: agenda, error: e1 } = await supabase
        .from('agenda_reunioes')
        .insert({
          titulo: input.titulo,
          descricao: input.descricao?.trim() || null,
          coordenador_id: input.coordenador_id ?? null,
          grupos_autorizados: input.grupos_autorizados,
        })
        .select('id')
        .single()
      if (e1) throw e1

      if (input.recorrencias.length) {
        const { error: e2 } = await supabase.from('agenda_recorrencias').insert(
          input.recorrencias.map(r => ({
            agenda_id: agenda.id,
            dia_semana: r.dia_semana,
            hora: r.hora,
            capacidade: r.capacidade,
            meet_link: r.meet_link?.trim() || null,
          })),
        )
        if (e2) throw e2
      }

      return { agendaId: agenda.id, ...(await materializarAgenda(agenda.id)) }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] })
    },
  })
}

/** Adiciona uma nova regra de horário recorrente a uma agenda já existente. */
export function useAdicionarRecorrencia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ agendaId, recorrencia }: { agendaId: string; recorrencia: NovaRecorrencia }) => {
      const { error } = await supabase.from('agenda_recorrencias').insert({
        agenda_id: agendaId,
        dia_semana: recorrencia.dia_semana,
        hora: recorrencia.hora,
        capacidade: recorrencia.capacidade,
        meet_link: recorrencia.meet_link?.trim() || null,
      })
      if (error) throw error

      return materializarAgenda(agendaId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] })
    },
  })
}

/** Edita dia/hora/capacidade/link de uma regra de horário recorrente. */
export function useEditarRecorrencia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; dia_semana: number; hora: string; capacidade: number; meet_link?: string | null }) => {
      const { error } = await supabase
        .from('agenda_recorrencias')
        .update({
          dia_semana: input.dia_semana,
          hora: input.hora,
          capacidade: input.capacidade,
          meet_link: input.meet_link?.trim() || null,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] })
    },
  })
}

/** Pausa/reativa uma regra de horário recorrente (some/volta a aparecer em /agendar). */
export function useAlternarRecorrencia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('agenda_recorrencias').update({ ativo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] })
    },
  })
}

/** Exclui definitivamente uma regra de horário recorrente (e suas reservas futuras). */
export function useExcluirRecorrencia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agenda_recorrencias').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] })
    },
  })
}

/** Ativa/desativa uma agenda inteira (esconde/exibe todas as suas recorrências em /agendar). */
export function useAlternarAgenda() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('agenda_reunioes').update({ ativo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] })
    },
  })
}

/** Edita coordenador/público autorizado de uma agenda. */
export function useEditarAgenda() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; titulo: string; coordenador_id: string | null; grupos_autorizados: string[] | null }) => {
      const { error } = await supabase
        .from('agenda_reunioes')
        .update({
          titulo: input.titulo,
          coordenador_id: input.coordenador_id,
          grupos_autorizados: input.grupos_autorizados,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] })
    },
  })
}

/** Exclui definitivamente uma agenda (e todas as suas recorrências/reservas). */
export function useExcluirAgenda() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agenda_reunioes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] })
    },
  })
}

// ─── Reuniões de feedback (agendamento) do dia, para um coordenador ─────────

export type ParticipanteAgendaCard = { id: string; nome: string; score_atual: number | null }

export type AgendaOcorrenciaCard = {
  id: string
  data_hora: string
  capacidade: number
  meet_link: string | null
  titulo: string
  /** Reunião de grupo (reunioes) gerada por este horário, se já houver. Quando
   *  preenchido, o card canônico é o de grupo — este é escondido para não duplicar. */
  reuniao_id: string | null
  participantes: ParticipanteAgendaCard[]
}

async function fetchAgendaOcorrencias(coordId: string, inicio: string, fim: string): Promise<AgendaOcorrenciaCard[]> {
  // Inclui agendas do próprio coordenador + agendas gerais (sem coordenador
  // específico) — antes ficavam de fora do calendário de todo mundo.
  const { data: recorrencias, error: e1 } = await supabase
    .from('agenda_recorrencias')
    .select('id, agenda:agenda_reunioes!inner (titulo, coordenador_id)')
    .or(`coordenador_id.eq.${coordId},coordenador_id.is.null`, { foreignTable: 'agenda' })
  if (e1) throw e1

  const recorrenciaIds = (recorrencias ?? []).map(r => r.id)
  if (!recorrenciaIds.length) return []

  const tituloPorRecorrencia = new Map(
    (recorrencias ?? []).map(r => [r.id, (r.agenda as unknown as { titulo: string }).titulo]),
  )

  const { data: horarios, error: e2 } = await supabase
    .from('agenda_horarios')
    .select(`
      id, data_hora, capacidade, meet_link, recorrencia_id, reuniao_id,
      inscricoes:agenda_inscricoes (
        id, status, email_usado,
        professor:professores (nome, professor_acompanhamento (score_atual))
      )
    `)
    .in('recorrencia_id', recorrenciaIds)
    .gte('data_hora', inicio)
    .lte('data_hora', fim)
    .order('data_hora')
  if (e2) throw e2

  type AcompRaw = { score_atual: number | null }
  type InscricaoRaw = {
    id: string; status: string; email_usado: string
    professor: { nome: string; professor_acompanhamento: AcompRaw | AcompRaw[] | null } | null
  }

  return (horarios ?? []).map(h => ({
    id: h.id,
    data_hora: h.data_hora,
    capacidade: h.capacidade,
    meet_link: h.meet_link,
    reuniao_id: (h.reuniao_id as string | null) ?? null,
    titulo: tituloPorRecorrencia.get(h.recorrencia_id as string) ?? 'Reunião em Grupo',
    participantes: (h.inscricoes as unknown as InscricaoRaw[])
      .filter(i => i.status === 'confirmada')
      .map(i => {
        const acomp = Array.isArray(i.professor?.professor_acompanhamento)
          ? i.professor?.professor_acompanhamento[0]
          : i.professor?.professor_acompanhamento
        return { id: i.id, nome: i.professor?.nome ?? i.email_usado, score_atual: acomp?.score_atual ?? null }
      }),
  }))
}

/** Reuniões de feedback num intervalo arbitrário (visões de semana/mês da agenda). */
export function useAgendaReunioesPeriodo(coordId: string | null, inicio: Date, fim: Date) {
  const chave = `${inicio.toISOString()}_${fim.toISOString()}`
  return useQuery({
    queryKey: ['agenda-reunioes-periodo', coordId, chave],
    enabled: !!coordId,
    queryFn: () => fetchAgendaOcorrencias(coordId!, inicio.toISOString(), fim.toISOString()),
    staleTime: 60 * 1000,
  })
}
