import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Incidente } from '@/types'
import { useAuth } from '@/contexts/AuthContext'

export interface FiltrosIncidente {
  status?: string
  tipo?: string
  dataInicio?: string
  dataFim?: string
  busca?: string
}

export function useIncidentes(filtros: FiltrosIncidente = {}) {
  return useQuery({
    queryKey: ['incidentes', filtros],
    queryFn: async () => {
      let query = supabase
        .from('incidentes')
        .select(`
          *,
          professores (nome),
          criador:profiles!incidentes_criado_por_fkey (nome),
          aprovador:profiles!incidentes_aprovado_por_fkey (nome)
        `)
        .order('created_at', { ascending: false })

      if (filtros.status)     query = query.eq('status', filtros.status)
      if (filtros.tipo)       query = query.eq('tipo', filtros.tipo)
      if (filtros.dataInicio) query = query.gte('created_at', filtros.dataInicio)
      if (filtros.dataFim)    query = query.lte('created_at', filtros.dataFim)
      if (filtros.busca)      query = query.ilike('descricao', `%${filtros.busca}%`)

      const { data, error } = await query
      if (error) throw error
      return data as (Incidente & {
        professores: { nome: string } | null
        criador: { nome: string } | null
        aprovador: { nome: string } | null
      })[]
    },
  })
}

export function useIncidente(id: string) {
  return useQuery({
    queryKey: ['incidentes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incidentes')
        .select(`
          *,
          professores (nome),
          criador:profiles!incidentes_criado_por_fkey (nome),
          aprovador:profiles!incidentes_aprovado_por_fkey (nome)
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCriarIncidente() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (incidente: {
      tipo: string
      descricao: string
      professor_id?: string
      imagens?: string[]
    }) => {
      const { error } = await supabase.from('incidentes').insert({
        ...incidente,
        criado_por: profile!.id,
        status: 'pendente',
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidentes'] }),
  })
}

export function useAtualizarIncidente() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ id, status, descricao, tipo }: {
      id: string
      status?: string
      descricao?: string
      tipo?: string
    }) => {
      const updates: Record<string, unknown> = {}
      if (status)    { updates.status = status; updates.aprovado_por = profile!.id }
      if (descricao) updates.descricao = descricao
      if (tipo)      updates.tipo = tipo

      const { error } = await supabase.from('incidentes').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['incidentes'] })
      queryClient.invalidateQueries({ queryKey: ['incidentes', vars.id] })
    },
  })
}

export function usePendentesAprovacao() {
  return useQuery({
    queryKey: ['incidentes', 'pendentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incidentes')
        .select(`*, professores(nome), criador:profiles!incidentes_criado_por_fkey(nome)`)
        .eq('status', 'pendente')
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useIncidentesPorMes(ano: number, mes: number) {
  return useQuery({
    queryKey: ['incidentes', 'mes', ano, mes],
    queryFn: async () => {
      const inicio = new Date(ano, mes - 1, 1).toISOString()
      const fim    = new Date(ano, mes, 0, 23, 59, 59).toISOString()

      const { data, error } = await supabase
        .from('incidentes')
        .select('*, professores(nome)')
        .gte('created_at', inicio)
        .lte('created_at', fim)
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}
