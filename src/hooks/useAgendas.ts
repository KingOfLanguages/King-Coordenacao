import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type AgendaComContagem = {
  id: string
  titulo: string
  descricao: string | null
  meet_link: string | null
  grupos_autorizados: string[] | null
  ativo: boolean
  created_at: string
  coordenador: { id: string; nome: string } | null
  horarios: {
    id: string
    data_hora: string
    capacidade: number
    meet_link: string | null
    ativo: boolean
    inscritos: number
  }[]
}

/** Lista todas as agendas (coordenação/admin) com seus horários e contagem de inscritos. */
export function useAgendas() {
  return useQuery({
    queryKey: ['agendas'],
    queryFn: async (): Promise<AgendaComContagem[]> => {
      const { data, error } = await supabase
        .from('agenda_reunioes')
        .select(`
          id, titulo, descricao, meet_link, grupos_autorizados, ativo, created_at,
          coordenador:profiles!coordenador_id (id, nome),
          horarios:agenda_horarios (
            id, data_hora, capacidade, meet_link, ativo,
            inscricoes:agenda_inscricoes (id, status)
          )
        `)
        .order('created_at', { ascending: false })
      if (error) throw error

      return (data ?? []).map((a: Record<string, unknown>) => ({
        ...a,
        horarios: (a.horarios as Record<string, unknown>[]).map(h => ({
          id: h.id as string,
          data_hora: h.data_hora as string,
          capacidade: h.capacidade as number,
          meet_link: h.meet_link as string | null,
          ativo: h.ativo as boolean,
          inscritos: (h.inscricoes as { status: string }[]).filter(i => i.status === 'confirmada').length,
        })),
      })) as AgendaComContagem[]
    },
  })
}

export type NovoHorario = { data_hora: string; capacidade: number; meet_link?: string }

/** Gera (via Google Calendar, conta-hub) o link de Meet para um horário específico. */
async function gerarMeetLink(titulo: string, dataHoraIso: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-meet-link', {
    body: { titulo, data_hora: dataHoraIso },
  })
  if (error) {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
    if (ctx?.json) {
      const body = await ctx.json().catch(() => null)
      if (body?.error) throw new Error(body.error)
    }
    throw new Error(error.message)
  }
  return (data as { meet_link: string }).meet_link
}

/** Cria uma agenda com seus horários iniciais. Gera o Meet automaticamente para
 *  horários sem link manual informado. */
export function useCriarAgenda() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      titulo: string
      descricao?: string | null
      coordenador_id?: string | null
      meet_link?: string | null
      grupos_autorizados: string[] | null
      horarios: NovoHorario[]
    }) => {
      const { data: agenda, error: e1 } = await supabase
        .from('agenda_reunioes')
        .insert({
          titulo: input.titulo,
          descricao: input.descricao?.trim() || null,
          coordenador_id: input.coordenador_id ?? null,
          meet_link: input.meet_link?.trim() || null,
          grupos_autorizados: input.grupos_autorizados,
        })
        .select('id')
        .single()
      if (e1) throw e1

      if (input.horarios.length) {
        const horariosComLink = await Promise.all(input.horarios.map(async h => {
          const link = h.meet_link?.trim() || await gerarMeetLink(input.titulo, h.data_hora)
          return { agenda_id: agenda.id, data_hora: h.data_hora, capacidade: h.capacidade, meet_link: link }
        }))

        const { error: e2 } = await supabase.from('agenda_horarios').insert(horariosComLink)
        if (e2) throw e2
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] })
    },
  })
}

/** Ativa/desativa uma agenda (esconde/exibe na busca pública). */
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
