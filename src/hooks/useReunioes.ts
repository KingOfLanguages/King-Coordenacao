import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Salva uma observação/feedback vinculada a um professor (e opcionalmente a uma reunião). */
export function useSalvarObservacao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (obs: {
      professor_id: string
      reuniao_id?: string
      coordenador_id: string
      tipo: string
      texto: string
    }) => {
      const { error } = await supabase.from('observacoes').insert(obs)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['professores', vars.professor_id] })
    },
  })
}
