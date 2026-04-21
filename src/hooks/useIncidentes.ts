import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Incidente, UrgenciaNivel } from '@/types'
import { useAuth } from '@/contexts/AuthContext'

export interface FiltrosIncidente {
  status?: string
  tipo?: string
  urgencia?: UrgenciaNivel
  responsavel?: string
  dataInicio?: string
  dataFim?: string
  busca?: string
  precisaAcompanhamento?: boolean
}

const INCIDENTE_SELECT = `
  *,
  professores (nome),
  criador:profiles!incidentes_criado_por_fkey (nome),
  aprovador:profiles!incidentes_aprovado_por_fkey (nome)
`

type IncidenteComRelacoes = Incidente & {
  professores: { nome: string } | null
  criador: { nome: string } | null
  aprovador: { nome: string } | null
}

export function useIncidentes(filtros: FiltrosIncidente = {}) {
  return useQuery({
    queryKey: ['incidentes', filtros],
    queryFn: async () => {
      let query = supabase
        .from('incidentes')
        .select(INCIDENTE_SELECT)
        .order('created_at', { ascending: false })

      if (filtros.status)                 query = query.eq('status', filtros.status)
      if (filtros.tipo)                   query = query.eq('tipo', filtros.tipo)
      if (filtros.urgencia)               query = query.eq('urgencia', filtros.urgencia)
      if (filtros.responsavel)            query = query.ilike('responsavel', `%${filtros.responsavel}%`)
      if (filtros.dataInicio)             query = query.gte('created_at', filtros.dataInicio)
      if (filtros.dataFim)                query = query.lte('created_at', filtros.dataFim)
      if (filtros.busca)                  query = query.ilike('descricao', `%${filtros.busca}%`)
      if (filtros.precisaAcompanhamento)  query = query.eq('precisa_acompanhamento', true)

      const { data, error } = await query
      if (error) throw error
      return data as IncidenteComRelacoes[]
    },
  })
}

export function useIncidente(id: string) {
  return useQuery({
    queryKey: ['incidentes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incidentes')
        .select(INCIDENTE_SELECT)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as IncidenteComRelacoes
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
      urgencia?: UrgenciaNivel
      solucao?: string
      responsavel?: string
      precisa_acompanhamento?: boolean
      professor_id?: string
      imagens?: string[]
    }) => {
      const { error } = await supabase.from('incidentes').insert({
        ...incidente,
        urgencia: incidente.urgencia ?? 'baixa',
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
    mutationFn: async ({ id, status, descricao, tipo, urgencia, solucao, responsavel, precisa_acompanhamento }: {
      id: string
      status?: string
      descricao?: string
      tipo?: string
      urgencia?: UrgenciaNivel
      solucao?: string
      responsavel?: string
      precisa_acompanhamento?: boolean
    }) => {
      const updates: Record<string, unknown> = {}
      if (status !== undefined)                  { updates.status = status; updates.aprovado_por = profile!.id }
      if (descricao !== undefined)               updates.descricao = descricao
      if (tipo !== undefined)                    updates.tipo = tipo
      if (urgencia !== undefined)                updates.urgencia = urgencia
      if (solucao !== undefined)                 updates.solucao = solucao
      if (responsavel !== undefined)             updates.responsavel = responsavel
      if (precisa_acompanhamento !== undefined)  updates.precisa_acompanhamento = precisa_acompanhamento

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
      return data as IncidenteComRelacoes[]
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
      return data as IncidenteComRelacoes[]
    },
  })
}
