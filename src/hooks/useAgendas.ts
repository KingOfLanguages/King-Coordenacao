import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type RecorrenciaComReservas = {
  id: string
  dia_semana: number
  hora: string
  capacidade: number
  meet_link: string | null
  ativo: boolean
  proximas_reservas: number
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
              data_hora,
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
          const horarios = r.horarios as { data_hora: string; inscricoes: { status: string }[] }[]
          const proximas_reservas = horarios
            .filter(h => new Date(h.data_hora).getTime() > agora)
            .reduce((soma, h) => soma + h.inscricoes.filter(i => i.status === 'confirmada').length, 0)
          return {
            id: r.id as string,
            dia_semana: r.dia_semana as number,
            hora: r.hora as string,
            capacidade: r.capacidade as number,
            meet_link: r.meet_link as string | null,
            ativo: r.ativo as boolean,
            proximas_reservas,
          }
        }),
      })) as AgendaComRecorrencias[]
    },
  })
}

export type NovaRecorrencia = { dia_semana: number; hora: string; capacidade: number; meet_link?: string | null }

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
