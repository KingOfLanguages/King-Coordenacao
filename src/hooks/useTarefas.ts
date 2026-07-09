import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type TarefaTime = 'coordenacao' | 'suporte'
export type TarefaStatus = 'aberto' | 'concluido'

export interface Tarefa {
  id: string
  titulo: string
  descricao: string | null
  criado_por: string
  atribuido_a: string | null
  atribuido_time: TarefaTime | null
  status: TarefaStatus
  concluido_em: string | null
  concluido_por: string | null
  created_at: string
  criador?: { id: string; nome: string } | null
  responsavel?: { id: string; nome: string } | null
}

const SELECT_TAREFA = `
  id, titulo, descricao, criado_por, atribuido_a, atribuido_time,
  status, concluido_em, concluido_por, created_at,
  criador:profiles!criado_por (id, nome),
  responsavel:profiles!atribuido_a (id, nome)
`

function normalizar(row: Record<string, unknown>): Tarefa {
  const criador = Array.isArray(row.criador) ? row.criador[0] : row.criador
  const responsavel = Array.isArray(row.responsavel) ? row.responsavel[0] : row.responsavel
  return { ...(row as unknown as Tarefa), criador: criador ?? null, responsavel: responsavel ?? null }
}

/** Todas as tarefas visíveis ao usuário (a RLS já filtra por criador/destino/time/admin). */
export function useTarefas() {
  return useQuery({
    queryKey: ['tarefas'],
    queryFn: async (): Promise<Tarefa[]> => {
      const { data, error } = await supabase
        .from('tarefas')
        .select(SELECT_TAREFA)
        .order('status', { ascending: true }) // 'aberto' antes de 'concluido'
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(r => normalizar(r as Record<string, unknown>))
    },
  })
}

/** Perfis que podem receber uma tarefa — interno a quem cuida dos professores
 *  (coordenação / suporte ao professor / admin). Suporte ao aluno fica de fora. */
export interface PessoaAtribuivel {
  id: string
  nome: string
  role: string
}

export function usePessoasAtribuiveis() {
  return useQuery({
    queryKey: ['tarefas', 'pessoas-atribuiveis'],
    queryFn: async (): Promise<PessoaAtribuivel[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, role')
        .eq('ativo', true)
        .in('role', ['coordenacao', 'suporte', 'admin'])
        .order('nome')
      if (error) throw error
      return (data ?? []) as PessoaAtribuivel[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export interface NovaTarefaInput {
  titulo: string
  descricao?: string | null
  atribuido_a?: string | null
  atribuido_time?: TarefaTime | null
}

export function useCriarTarefa() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: NovaTarefaInput) => {
      if (!profile?.id) throw new Error('Sessão inválida.')
      const { error } = await supabase.from('tarefas').insert({
        titulo: input.titulo.trim(),
        descricao: input.descricao?.trim() || null,
        criado_por: profile.id,
        atribuido_a: input.atribuido_a ?? null,
        atribuido_time: input.atribuido_time ?? null,
        status: 'aberto',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarefas'] }),
  })
}

export function useConcluirTarefa() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('tarefas')
        .update({ status: 'concluido', concluido_em: new Date().toISOString(), concluido_por: profile?.id ?? null })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Sem permissão para concluir esta tarefa.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarefas'] }),
  })
}

export function useReabrirTarefa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('tarefas')
        .update({ status: 'aberto', concluido_em: null, concluido_por: null })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Sem permissão para reabrir esta tarefa.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarefas'] }),
  })
}

export function useExcluirTarefa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('tarefas').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Sem permissão para excluir esta tarefa.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tarefas'] }),
  })
}
