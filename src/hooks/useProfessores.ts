import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
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
  grupo?:       { id: string; nome: string } | null
  coordenador?: { id: string; nome: string } | null
}

export function useProfessoresComContadores() {
  return useQuery({
    queryKey: ['professores', 'contadores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select(`
          *,
          grupo:grupos!grupo_id (id, nome),
          coordenador:profiles!coordenador_id (id, nome),
          observacoes (id, tipo)
        `)
        .eq('saiu', false)
        .eq('pausa', false)
        .order('nome')
      if (error) throw error

      return (data ?? []).map(p => {
        const obs = (p.observacoes ?? []) as { id: string; tipo: string }[]
        return {
          ...p,
          _negativos: obs.filter(o => o.tipo === 'feedback_negativo').length,
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
          grupo:grupos!grupo_id (id, nome),
          coordenador:profiles!coordenador_id (id, nome),
          reuniao_professores (
            id, status, numero, observacao, confirmado_em,
            confirmado_por:profiles!confirmado_por (nome),
            reuniao:reunioes!reuniao_id (id, data, titulo)
          ),
          observacoes (
            id, tipo, texto, created_at, snapshot, resolvido, resolvido_em,
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

// ─── Professores em pausa (BUG-14) ───────────────────────────────────────────

export function useProfessoresEmPausa() {
  return useQuery({
    queryKey: ['professores', 'pausa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select(`
          *,
          grupo:grupos!grupo_id (id, nome),
          coordenador:profiles!coordenador_id (id, nome),
          observacoes (id, tipo)
        `)
        .eq('saiu', false)
        .eq('pausa', true)
        .order('nome')
      if (error) throw error

      return (data ?? []).map(p => {
        const obs = (p.observacoes ?? []) as { id: string; tipo: string }[]
        return {
          ...p,
          _negativos: obs.filter(o => o.tipo === 'feedback_negativo').length,
        } as ProfessorComContadores
      })
    },
  })
}

// ─── Retorno de pausa (tirar da pausa manualmente + acompanhamento) ───────────

export type ProfessorDespausado = ProfessorComContadores & {
  despausado_por_perfil?: { id: string; nome: string } | null
}

/** Professores tirados da pausa manualmente (em acompanhamento). */
export function useProfessoresDespausados() {
  return useQuery({
    queryKey: ['professores', 'despausados'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select(`
          *,
          grupo:grupos!grupo_id (id, nome),
          coordenador:profiles!coordenador_id (id, nome),
          despausado_por_perfil:profiles!despausado_por (id, nome),
          observacoes (id, tipo)
        `)
        .not('despausado_em', 'is', null)
        .order('despausado_em', { ascending: false })
      if (error) throw error

      return (data ?? []).map(p => {
        const obs = (p.observacoes ?? []) as { id: string; tipo: string }[]
        return {
          ...p,
          _negativos: obs.filter(o => o.tipo === 'feedback_negativo').length,
        } as ProfessorDespausado
      })
    },
  })
}

/** Tira o professor da pausa: status vira "ativo" e trava contra o sync do KMS. */
export function useTirarDaPausa() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('professores')
        .update({
          status: 'ativo',
          status_manual: true,
          despausado_em: new Date().toISOString(),
          despausado_por: profile?.id ?? null,
        })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Nada foi atualizado — você não tem permissão para tirar este professor da pausa.')
      }
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['professores'] })
      queryClient.invalidateQueries({ queryKey: ['professores', id] })
    },
  })
}

/** Encerra o acompanhamento: libera a trava (o KMS volta a governar o status). */
export function useConcluirAcompanhamentoPausa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('professores')
        .update({ status_manual: false, despausado_em: null, despausado_por: null })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Nada foi atualizado — sem permissão para encerrar o acompanhamento.')
      }
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['professores'] })
      queryClient.invalidateQueries({ queryKey: ['professores', id] })
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

// ─── Troca de grupo (herda o coordenador do novo grupo) ───────────────────────

export function useAtualizarGrupoProfessor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, grupo_id }: { id: string; grupo_id: string }) => {
      // Busca o coordenador do grupo de destino para herdar como responsável.
      const { data: grupo, error: gErr } = await supabase
        .from('grupos')
        .select('coordenador_id')
        .eq('id', grupo_id)
        .single()
      if (gErr) throw gErr

      const { error } = await supabase
        .from('professores')
        .update({ grupo_id, coordenador_id: grupo?.coordenador_id ?? null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}
