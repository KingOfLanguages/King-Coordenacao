import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type {
  ProjetoFase, ProjetoPrioridade, ProjetoStatus, ProjetoTipo,
} from '@/lib/projetos'

// ─────────────────────────────────────────────────────────────────────────────
// Projetos da King — migration 20260776_projetos_king.sql.
//
// Nada aqui faz join em `profiles`: a RLS da tabela só libera a própria linha,
// então join aninhado volta NULL SEM ERRO ([[ktm-perfis-publicos-rls]]). Os
// nomes são resolvidos na tela pelo mapa de `perfis_publicos`
// (useNomesPorPerfilId), que é a view feita pra isso.
// ─────────────────────────────────────────────────────────────────────────────

export interface Projeto {
  id: string
  titulo: string
  descricao: string
  tipo: ProjetoTipo
  impacto: string | null
  prioridade: ProjetoPrioridade
  status: ProjetoStatus
  fase: ProjetoFase
  data_entrega: string | null
  responsavel_id: string | null
  criado_por: string | null
  decidido_por: string | null
  decidido_em: string | null
  motivo_decisao: string | null
  concluido_em: string | null
  created_at: string
  updated_at: string
}

export interface PedidoInfo {
  id: string
  projeto_id: string
  pergunta: string
  solicitado_por: string | null
  destinatario_id: string | null
  resposta: string | null
  respondido_por: string | null
  respondido_em: string | null
  created_at: string
}

export interface AtualizacaoProjeto {
  id: string
  projeto_id: string
  texto: string
  autor_id: string | null
  created_at: string
}

const SELECT_PROJETO = `
  id, titulo, descricao, tipo, impacto, prioridade, status, fase,
  data_entrega, responsavel_id, criado_por, decidido_por, decidido_em,
  motivo_decisao, concluido_em, created_at, updated_at
`

const SELECT_PEDIDO = `
  id, projeto_id, pergunta, solicitado_por, destinatario_id,
  resposta, respondido_por, respondido_em, created_at
`

// ─── Consultas ───────────────────────────────────────────────────────────────

/** Todos os projetos. A lista é curta por natureza — filtragem é na tela. */
export function useProjetos() {
  return useQuery({
    queryKey: ['projetos'],
    queryFn: async (): Promise<Projeto[]> => {
      const { data, error } = await supabase
        .from('projetos')
        .select(SELECT_PROJETO)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Projeto[]
    },
  })
}

/** Pedidos de informação de TODOS os projetos — usados pra contar pendências
 *  no cabeçalho e montar a conversa dentro do detalhe. */
export function usePedidosInfo() {
  return useQuery({
    queryKey: ['projetos', 'pedidos-info'],
    queryFn: async (): Promise<PedidoInfo[]> => {
      const { data, error } = await supabase
        .from('projeto_pedidos_info')
        .select(SELECT_PEDIDO)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as PedidoInfo[]
    },
  })
}

export function useAtualizacoesProjeto(projetoId: string | null | undefined) {
  return useQuery({
    queryKey: ['projetos', 'atualizacoes', projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<AtualizacaoProjeto[]> => {
      const { data, error } = await supabase
        .from('projeto_atualizacoes')
        .select('id, projeto_id, texto, autor_id, created_at')
        .eq('projeto_id', projetoId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as AtualizacaoProjeto[]
    },
  })
}

/** O que a Minha Área mostra: meus projetos (sugeridos ou sob minha
 *  responsabilidade) e as perguntas que estão esperando resposta minha. */
export function useMeusProjetos() {
  const { profile } = useAuth()
  const meuId = profile?.id ?? null
  const projetos = useProjetos()
  const pedidos = usePedidosInfo()

  const meus = (projetos.data ?? []).filter(
    p => p.criado_por === meuId || p.responsavel_id === meuId,
  )
  const meusIds = new Set(meus.map(p => p.id))
  const todosPedidos = pedidos.data ?? []

  return {
    projetos: meus,
    /** Perguntas endereçadas a mim e ainda sem resposta. */
    pedidosAbertos: todosPedidos.filter(q => q.destinatario_id === meuId && !q.resposta),
    /** Perguntas (respondidas ou não) dos projetos que são meus. */
    pedidosDosMeus: todosPedidos.filter(q => meusIds.has(q.projeto_id)),
    isLoading: projetos.isLoading || pedidos.isLoading,
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface NovoProjetoInput {
  titulo: string
  descricao: string
  tipo: ProjetoTipo
  impacto?: string | null
  prioridade: ProjetoPrioridade
  /** Prazo desejado, quando quem sugere já tem uma data em mente. */
  data_entrega?: string | null
}

export function useCriarProjeto() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: NovoProjetoInput) => {
      const { data, error } = await supabase
        .from('projetos')
        .insert({
          titulo: input.titulo.trim(),
          descricao: input.descricao.trim(),
          tipo: input.tipo,
          impacto: input.impacto?.trim() || null,
          prioridade: input.prioridade,
          data_entrega: input.data_entrega || null,
          criado_por: profile?.id ?? null,
        })
        .select(SELECT_PROJETO)
        .single()
      if (error) throw error
      return data as Projeto
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

/** Campos que o autor pode corrigir enquanto a proposta não foi avaliada. */
export function useEditarProjeto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: { id: string } & Partial<NovoProjetoInput>) => {
      const { error } = await supabase.from('projetos').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

/** Decisão da liderança. O trigger recusa quem não é líder/admin. */
export function useDecidirProjeto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      status: Exclude<ProjetoStatus, 'proposto'>
      motivo?: string | null
      data_entrega?: string | null
      responsavel_id?: string | null
    }) => {
      const patch: Record<string, unknown> = {
        status: input.status,
        motivo_decisao: input.motivo?.trim() || null,
      }
      // Aprovar já define prazo/responsável quando a liderança informou.
      if (input.data_entrega !== undefined)   patch.data_entrega = input.data_entrega || null
      if (input.responsavel_id !== undefined) patch.responsavel_id = input.responsavel_id || null

      const { error } = await supabase.from('projetos').update(patch).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

/** Prazo e responsável — liderança ou o próprio responsável. */
export function useAtualizarConducao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; data_entrega?: string | null; responsavel_id?: string | null }) => {
      const patch: Record<string, unknown> = {}
      if (input.data_entrega !== undefined)   patch.data_entrega = input.data_entrega || null
      if (input.responsavel_id !== undefined) patch.responsavel_id = input.responsavel_id || null
      if (!Object.keys(patch).length) return
      const { error } = await supabase.from('projetos').update(patch).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

export function useMoverFase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fase }: { id: string; fase: ProjetoFase }) => {
      const { error } = await supabase.from('projetos').update({ fase }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

export function useExcluirProjeto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projetos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

/** Liderança pergunta. Sem destinatário, o trigger manda pro responsável ou
 *  pro autor — e o aviso cai na Minha Área dele. */
export function usePedirInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { projetoId: string; pergunta: string; destinatarioId?: string | null }) => {
      const { error } = await supabase.from('projeto_pedidos_info').insert({
        projeto_id: input.projetoId,
        pergunta: input.pergunta.trim(),
        destinatario_id: input.destinatarioId || null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

export function useResponderInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, resposta }: { id: string; resposta: string }) => {
      const { error } = await supabase
        .from('projeto_pedidos_info')
        .update({ resposta: resposta.trim() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

export function useAdicionarAtualizacao() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ projetoId, texto }: { projetoId: string; texto: string }) => {
      const { error } = await supabase.from('projeto_atualizacoes').insert({
        projeto_id: projetoId,
        texto: texto.trim(),
        autor_id: profile?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

// ─── Permissões de tela ──────────────────────────────────────────────────────

/** Quem decide (aprovar/recusar, pedir informação, mexer em qualquer projeto). */
export function useSouLideranca(): boolean {
  const { profile } = useAuth()
  return profile?.is_lider === true || profile?.is_admin === true || profile?.role === 'admin'
}
