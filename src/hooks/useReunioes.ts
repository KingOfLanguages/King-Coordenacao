import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export function useReunioesHoje() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['reunioes', 'hoje', profile?.id],
    queryFn: async () => {
      const hoje  = new Date()
      const inicio = new Date(hoje.setHours(0, 0, 0, 0)).toISOString()
      const fim    = new Date(hoje.setHours(23, 59, 59, 999)).toISOString()

      const { data, error } = await supabase
        .from('reunioes')
        .select('*, professores(nome), profiles(nome)')
        .gte('data', inicio)
        .lte('data', fim)
        .order('data')
      if (error) throw error
      return data
    },
  })
}

export function useCriarReuniao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (reuniao: {
      professor_id: string
      coordenador_id: string
      data: string
      notas?: string
    }) => {
      const { error } = await supabase.from('reunioes').insert(reuniao)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes'] })
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}

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
