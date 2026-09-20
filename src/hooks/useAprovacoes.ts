import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Aprovacao {
  id: string
  email: string
  nome: string
  role_solicitada: string
  status: string
  created_at: string
  user_id: string
}

// Pedidos de acesso aguardando o admin. Era a página /admin/aprovacoes; desde
// 2026-09 é a aba "Aguardando aprovação" de Usuários — quem aprova é quem
// administra os usuários, e a tela de Usuários já mandava o admin para lá.

export function useAprovacoesPendentes() {
  return useQuery({
    queryKey: ['aprovacoes', 'pendentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_approvals')
        .select('*')
        .eq('status', 'pendente')
        .order('created_at')
      if (error) throw error
      return data as Aprovacao[]
    },
  })
}
