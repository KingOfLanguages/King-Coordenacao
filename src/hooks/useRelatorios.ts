import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useDadosRelatorio(tipo: 'incidentes' | 'professores' | 'reunioes', mes?: number, ano?: number) {
  return useQuery({
    queryKey: ['relatorio', tipo, mes, ano],
    queryFn: async () => {
      if (tipo === 'incidentes') {
        let query = supabase
          .from('incidentes')
          .select('*, professores(nome), criador:profiles!incidentes_criado_por_fkey(nome)')
          .order('created_at', { ascending: false })

        if (mes && ano) {
          const inicio = new Date(ano, mes - 1, 1).toISOString()
          const fim    = new Date(ano, mes, 0, 23, 59, 59).toISOString()
          query = query.gte('created_at', inicio).lte('created_at', fim)
        }

        const { data, error } = await query
        if (error) throw error
        return data

      } else if (tipo === 'professores') {
        const { data, error } = await supabase
          .from('professores')
          .select('*, reunioes(id, status), observacoes(id, tipo)')
          .order('nome')
        if (error) throw error
        return data

      } else {
        let query = supabase
          .from('reunioes')
          .select('*, professores(nome), profiles(nome)')
          .order('data', { ascending: false })

        if (mes && ano) {
          const inicio = new Date(ano, mes - 1, 1).toISOString()
          const fim    = new Date(ano, mes, 0, 23, 59, 59).toISOString()
          query = query.gte('data', inicio).lte('data', fim)
        }

        const { data, error } = await query
        if (error) throw error
        return data
      }
    },
    enabled: false, // só carrega quando o usuário solicita
  })
}
