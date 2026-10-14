import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { QuemFinalizou, SaidaStatus } from '@/lib/saidaProfessor'

// ─────────────────────────────────────────────────────────────────────────────
// Saídas de professor (20260797). Lidas e escritas direto na tabela: a RLS
// libera coordenação, suporte e admin, e o gatilho carimba autor e
// encerramento com quem está logado.
// ─────────────────────────────────────────────────────────────────────────────

export interface SaidaProfessor {
  id: string
  professor_id: string
  data_saida: string | null
  observacao: string | null
  status: SaidaStatus
  quem_finalizou: QuemFinalizou | null
  nota_encerramento: string | null
  registrado_por: string | null
  created_at: string
  updated_at: string | null
  encerrada_por: string | null
  encerrada_em: string | null
  /** Status no King (via sync): 'desligado' é a pista de que a saída aconteceu. */
  professor: { id: string; nome: string; status: string; desligado_em: string | null } | null
}

const SELECT_SAIDA = `
  id, professor_id, data_saida, observacao, status, quem_finalizou, nota_encerramento,
  registrado_por, created_at, updated_at, encerrada_por, encerrada_em,
  professor:professores!professor_id (id, nome, status, desligado_em)
`

function normalizar(r: Record<string, unknown>): SaidaProfessor {
  const p = r.professor
  return { ...(r as unknown as SaidaProfessor), professor: (Array.isArray(p) ? p[0] : p) ?? null }
}

function mensagemDeErro(e: { code?: string; message: string }): Error {
  if (e.code === '23505') return new Error('Este professor já tem uma saída em aberto.')
  return new Error(e.message)
}

/** Saídas ainda sem confirmação — a lista da Minha Área. */
export function useSaidasAbertas(enabled = true) {
  return useQuery({
    queryKey: ['saidas-professor', 'abertas'],
    enabled,
    queryFn: async (): Promise<SaidaProfessor[]> => {
      const { data, error } = await supabase
        .from('saidas_professor')
        .select(SELECT_SAIDA)
        .eq('status', 'aguardando')
        .order('created_at')
      if (error) throw error
      return (data ?? []).map(r => normalizar(r as Record<string, unknown>))
    },
  })
}

/** Todas as saídas de um professor, a mais recente primeiro. */
export function useSaidasDoProfessor(professorId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['saidas-professor', 'professor', professorId],
    enabled: enabled && !!professorId,
    queryFn: async (): Promise<SaidaProfessor[]> => {
      const { data, error } = await supabase
        .from('saidas_professor')
        .select(SELECT_SAIDA)
        .eq('professor_id', professorId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => normalizar(r as Record<string, unknown>))
    },
  })
}

function useInvalidarSaidas() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['saidas-professor'] })
}

export function useRegistrarSaida() {
  const invalidar = useInvalidarSaidas()
  return useMutation({
    mutationFn: async (v: { professor_id: string; data_saida: string | null; observacao: string | null }) => {
      const { error } = await supabase.from('saidas_professor').insert(v)
      if (error) throw mensagemDeErro(error)
    },
    onSuccess: invalidar,
  })
}

/** Data e observação continuam editáveis enquanto a saída está aberta. */
export function useAtualizarSaida() {
  const invalidar = useInvalidarSaidas()
  return useMutation({
    mutationFn: async ({ id, ...v }: { id: string; data_saida: string | null; observacao: string | null }) => {
      const { error } = await supabase.from('saidas_professor').update(v).eq('id', id)
      if (error) throw mensagemDeErro(error)
    },
    onSuccess: invalidar,
  })
}

/** Concluída (dizendo quem fez o desligamento) ou cancelada. */
export function useEncerrarSaida() {
  const invalidar = useInvalidarSaidas()
  return useMutation({
    mutationFn: async ({ id, status, quem_finalizou, nota }: {
      id: string
      status: 'concluida' | 'cancelada'
      quem_finalizou: QuemFinalizou | null
      nota: string | null
    }) => {
      const { error } = await supabase
        .from('saidas_professor')
        .update({ status, quem_finalizou: status === 'concluida' ? quem_finalizou : null, nota_encerramento: nota })
        .eq('id', id)
        .eq('status', 'aguardando')
      if (error) throw mensagemDeErro(error)
    },
    onSuccess: invalidar,
  })
}
