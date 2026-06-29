import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { GrupoComCoordenador } from '@/types'

// ─── Lista de grupos ────────────────────────────────────────────────────────

export function useGrupos() {
  return useQuery({
    queryKey: ['grupos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grupos')
        .select('*, coordenador:profiles!coordenador_id (id, nome)')
        .order('created_at')
      if (error) throw error
      return data as GrupoComCoordenador[]
    },
  })
}

// ─── Edição de grupo (nome / coordenador) — admin ──────────────────────────────

export function useAtualizarGrupo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nome, coordenador_id }: {
      id: string
      nome?: string
      coordenador_id?: string | null
    }) => {
      const payload: Record<string, unknown> = {}
      if (nome !== undefined)           payload.nome = nome
      if (coordenador_id !== undefined) payload.coordenador_id = coordenador_id

      const { error } = await supabase.from('grupos').update(payload).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grupos'] })
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}

// ─── Distribuição inicial equilibrada (33/33/33 por faixa) — admin ─────────────

export type ResultadoDistribuicao = { grupo_id: string; nome: string; total: number }

export function useDistribuirInicial() {
  const queryClient = useQueryClient()
  return useMutation<ResultadoDistribuicao[], Error, boolean>({
    mutationFn: async (force) => {
      const { data, error } = await supabase.rpc('distribuir_professores_inicial', {
        p_force: force,
      })
      if (error) throw error
      return data as ResultadoDistribuicao[]
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professores'] })
      queryClient.invalidateQueries({ queryKey: ['grupos'] })
    },
  })
}
