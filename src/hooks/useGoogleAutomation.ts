import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type GoogleAutomationStatus = {
  user_id:    string
  updated_at: string
} | null

/** Verifica se o coordenador atual tem importação automática configurada. */
export function useGoogleAutomation() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['google', 'automation', profile?.id],
    queryFn:  async () => {
      const { data } = await supabase
        .from('google_tokens')
        .select('user_id, updated_at')
        .eq('user_id', profile!.id)
        .maybeSingle()
      return data as GoogleAutomationStatus
    },
    enabled: !!profile?.id,
  })
}

/** Remove o token salvo, desativando a importação automática. */
export function useDesativarAutomacao() {
  const { profile } = useAuth()
  const qc          = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('google_tokens')
        .delete()
        .eq('user_id', profile!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['google', 'automation'] }),
  })
}
