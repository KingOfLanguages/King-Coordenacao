import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Professor } from '@/types'

// ─── Basic list ───────────────────────────────────────────────────────────────

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

// ─── List with counters ───────────────────────────────────────────────────────

export type ProfessorComContadores = Professor & {
  _negativos:  number
  _incidentes: number
}

export function useProfessoresComContadores() {
  return useQuery({
    queryKey: ['professores', 'contadores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select(`
          *,
          observacoes (id, tipo),
          incidentes  (id, status)
        `)
        .eq('saiu', false)
        .eq('pausa', false)
        .order('nome')
      if (error) throw error

      return (data ?? []).map(p => {
        const obs       = (p.observacoes ?? []) as { id: string; tipo: string }[]
        const incidents = (p.incidentes  ?? []) as { id: string; status: string }[]
        return {
          ...p,
          _negativos:  obs.filter(o => o.tipo === 'feedback_negativo').length,
          _incidentes: incidents.filter(i => i.status !== 'rejeitado').length,
        } as ProfessorComContadores
      })
    },
  })
}

// ─── Detail ───────────────────────────────────────────────────────────────────

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
          ),
          incidentes (
            id, tipo, descricao, status, urgencia, solucao, created_at
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

// ─── Professores em pausa (BUG-14) ───────────────────────────────────────────

export function useProfessoresEmPausa() {
  return useQuery({
    queryKey: ['professores', 'pausa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select(`
          *,
          observacoes (id, tipo),
          incidentes  (id, status)
        `)
        .eq('saiu', false)
        .eq('pausa', true)
        .order('nome')
      if (error) throw error

      return (data ?? []).map(p => {
        const obs       = (p.observacoes ?? []) as { id: string; tipo: string }[]
        const incidents = (p.incidentes  ?? []) as { id: string; status: string }[]
        return {
          ...p,
          _negativos:  obs.filter(o => o.tipo === 'feedback_negativo').length,
          _incidentes: incidents.filter(i => i.status !== 'rejeitado').length,
        } as ProfessorComContadores
      })
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCriarProfessor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (professor: {
      nome: string
      data_inicio?: string | null
      tempo_na_king?: string | null
      renda?: string | null
    }) => {
      const { error } = await supabase.from('professores').insert({
        ...professor,
        monitoramento: false,
        pausa:         false,
        saiu:          false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
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
