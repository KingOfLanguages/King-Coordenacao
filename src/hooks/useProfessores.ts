import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Professor } from '@/types'

export function useProfessores() {
  return useQuery({
    queryKey: ['professores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select('*')
        .order('nome')
      if (error) throw error
      return data as Professor[]
    },
  })
}

export function useProfessoresAtivos() {
  return useQuery({
    queryKey: ['professores', 'ativos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select('*')
        .eq('saiu', false)
        .eq('pausa', false)
        .order('nome')
      if (error) throw error
      return data as Professor[]
    },
  })
}

export function useProfessor(id: string) {
  return useQuery({
    queryKey: ['professores', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select(`
          *,
          reunioes (
            id, data, status, notas,
            profiles (nome)
          ),
          observacoes (
            id, tipo, texto, created_at,
            profiles (nome)
          )
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useAtualizarMonitoramento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, monitoramento }: { id: string; monitoramento: boolean }) => {
      const { error } = await supabase
        .from('professores')
        .update({ monitoramento })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}
