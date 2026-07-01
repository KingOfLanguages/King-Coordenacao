import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type LinksCoordenador = {
  koalendar_link: string | null
  google_appointment_link: string | null
}

/** Links de agendamento cadastrados por um coordenador específico (não necessariamente o logado — admin edita em nome de outros). */
export function useLinksCoordenador(coordenadorId: string | null) {
  return useQuery({
    queryKey: ['links-coordenador', coordenadorId],
    enabled: !!coordenadorId,
    queryFn: async (): Promise<LinksCoordenador> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('koalendar_link, google_appointment_link')
        .eq('id', coordenadorId!)
        .single()
      if (error) throw error
      return data as LinksCoordenador
    },
  })
}

export function useAtualizarLinksCoordenador() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: LinksCoordenador & { coordenadorId: string }) => {
      const { coordenadorId, ...links } = input
      // .select() é necessário aqui: sem ele, um UPDATE que a RLS bloqueia
      // (0 linhas afetadas) volta sem erro nenhum — pareceria "salvo" mesmo
      // sem ter mudado nada.
      const { data, error } = await supabase
        .from('profiles')
        .update(links)
        .eq('id', coordenadorId)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Nada foi atualizado — você não tem permissão pra editar os links deste coordenador.')
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['links-coordenador', variables.coordenadorId] })
    },
  })
}
