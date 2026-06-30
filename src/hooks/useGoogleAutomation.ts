import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type GoogleAutomationStatus = {
  ativo:         boolean
  atualizado_em: string | null
}

/**
 * Verifica se a importação automática está ativa — modelo de conta
 * compartilhada: uma única conexão Google serve todos os coordenadores,
 * não depende de quem está logado no momento.
 */
export function useGoogleAutomation() {
  return useQuery({
    queryKey: ['google', 'automation'],
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('google_automation_status').single()
      if (error) throw error
      return data as GoogleAutomationStatus
    },
  })
}

/** Desativa a importação automática (remove a conexão salva). Apenas admin. */
export function useDesativarAutomacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('google_tokens')
        .delete()
        .neq('user_id', '00000000-0000-0000-0000-000000000000')
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['google', 'automation'] }),
  })
}
