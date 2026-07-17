import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type TipoNotificacao =
  | 'incidente_novo'
  | 'incidente_critico'
  | 'incidente_assumido'
  | 'incidente_concluido'

export interface Notificacao {
  id: string
  tipo: TipoNotificacao | string
  titulo: string
  corpo: string | null
  incidente_id: string | null
  lida: boolean
  created_at: string
}

/** Avisos do usuário logado (RLS já restringe às próprias). Recarrega a cada
 *  minuto e ao voltar o foco — não é realtime, mas mantém o sino fresco. */
export function useNotificacoes() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['notificacoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notificacoes')
        .select('id, tipo, titulo, corpo, incidente_id, lida, created_at')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as Notificacao[]
    },
    enabled: !!profile?.id,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}

export function useMarcarNotificacaoLida() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notificacoes')
        .update({ lida: true, lida_em: new Date().toISOString() })
        .eq('id', id)
        .eq('lida', false)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificacoes'] }),
  })
}

export function useMarcarTodasLidas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notificacoes')
        .update({ lida: true, lida_em: new Date().toISOString() })
        .eq('lida', false)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificacoes'] }),
  })
}
