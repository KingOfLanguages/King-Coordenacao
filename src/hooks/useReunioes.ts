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

/** Edita a participação de um professor numa reunião (status/observação) e,
 *  se uma nova data for informada, também a data/hora da reunião pai. */
export function useEditarParticipacaoReuniao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ participanteId, reuniaoId, data, status, observacao }: {
      participanteId: string
      reuniaoId: string | null
      data?: string
      status: 'pendente' | 'realizada' | 'cancelada'
      observacao: string | null
    }) => {
      if (data && reuniaoId) {
        const { error } = await supabase.from('reunioes').update({ data }).eq('id', reuniaoId)
        if (error) throw error
      }
      const { error } = await supabase
        .from('reuniao_professores')
        .update({ status, observacao: observacao?.trim() || null })
        .eq('id', participanteId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}

/** Remove o registro de participação do professor nessa reunião (não apaga a reunião em si). */
export function useExcluirParticipacaoReuniao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (participanteId: string) => {
      const { error } = await supabase.from('reuniao_professores').delete().eq('id', participanteId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}
