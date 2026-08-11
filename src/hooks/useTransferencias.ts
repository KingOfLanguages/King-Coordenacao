import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TransferenciaAluno } from '@/types'

// ─── Modelo ───────────────────────────────────────────────────────────────────

export type TransferenciaComProfessor = TransferenciaAluno & {
  professor?: {
    id: string
    nome: string
    status: string
    telefone: string | null
    email: string | null
    grupo?: { id: string; nome: string } | null
    coordenador?: { id: string; nome: string } | null
  } | null
  assumido_por_perfil?: { id: string; nome: string } | null
  destino?: { id: string; nome: string } | null
}

/** Urgência de atendimento derivada do pedido — dá a ordem e o destaque da fila.
 *  `urgente` é o que o professor marcou; `parado` é o que envergonha a operação:
 *  pedido aberto há mais de uma semana sem desfecho. */
export type FaixaTransferencia = 'parado' | 'urgente' | 'recente'

/** A partir de quantos dias um pedido em aberto vira "parado". */
export const DIAS_PARADO = 7

/** Dias inteiros desde um timestamp. Compara só a parte de data, sem hora —
 *  evita o resultado mudar conforme a hora em que a tela é aberta. */
export function diasDesde(ts: string): number {
  const d = new Date(ts)
  const criado = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const agora = new Date()
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.round((hoje - criado) / 86_400_000)
}

export function faixaDaTransferencia(t: Pick<TransferenciaAluno, 'created_at' | 'urgencia'>): FaixaTransferencia {
  if (diasDesde(t.created_at) >= DIAS_PARADO) return 'parado'
  if (t.urgencia === 'alta') return 'urgente'
  return 'recente'
}

export const FAIXA_TRANSFERENCIA_META: Record<FaixaTransferencia, { label: string; descricao: string }> = {
  parado:  { label: 'Parados',     descricao: `Abertos há ${DIAS_PARADO} dias ou mais, ainda sem desfecho.` },
  urgente: { label: 'Urgentes',    descricao: 'O professor marcou como urgente.' },
  recente: { label: 'Na fila',     descricao: 'Dentro do prazo normal de atendimento.' },
}

const SELECT_TRANSFERENCIA = `
  *,
  professor:professores!professor_id (
    id, nome, status, telefone, email,
    grupo:grupos!grupo_id (id, nome),
    coordenador:profiles!coordenador_id (id, nome)
  ),
  assumido_por_perfil:profiles!assumido_por (id, nome),
  destino:professores!destino_professor_id (id, nome)
`

// ─── Consultas ────────────────────────────────────────────────────────────────

/** Fila de trabalho: pendentes e em atendimento, mais antigos primeiro (quem
 *  espera há mais tempo aparece antes). */
export function useTransferenciasFila() {
  return useQuery({
    queryKey: ['transferencias', 'fila'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transferencias_aluno')
        .select(SELECT_TRANSFERENCIA)
        .in('status', ['pendente', 'em_atendimento'])
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as TransferenciaComProfessor[]
    },
  })
}

/** Histórico: concluídos e recusados, para consulta e para medir desfecho. */
export function useTransferenciasFinalizadas() {
  return useQuery({
    queryKey: ['transferencias', 'finalizadas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transferencias_aluno')
        .select(SELECT_TRANSFERENCIA)
        .in('status', ['concluida', 'recusada'])
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as unknown as TransferenciaComProfessor[]
    },
  })
}

/** Pedidos de um professor — alimenta a seção no perfil dele. */
export function useTransferenciasDoProfessor(professorId?: string) {
  return useQuery({
    queryKey: ['transferencias', 'professor', professorId],
    enabled: !!professorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transferencias_aluno')
        .select(SELECT_TRANSFERENCIA)
        .eq('professor_id', professorId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as TransferenciaComProfessor[]
    },
  })
}

// ─── Dossiê do aluno ──────────────────────────────────────────────────────────

export type DossieVinculo = {
  aluno_id: number
  primeiro_nome: string | null
  data_adicao: string | null
  data_matricula_escola: string | null
  status_aluno: string | null
  status_vinculo_codigo: string | null
  tipo_vinculo: string | null
  dias_com_professor: number | null
}

export type DossieSaida = {
  data_saida: string
  motivo_saida: string | null
  saiu_da_escola: boolean | null
  data_inicio_aulas: string | null
  professor_nome: string | null
}

export type DossiePedido = {
  id: string
  created_at: string
  motivo: string
  status: string
  desfecho: string | null
  professor_nome: string | null
}

export type DossieOcorrencia = {
  id: string
  created_at: string
  problem_type: string
  urgency: string
  description: string
  resolved: boolean
  aluno_nome: string | null
}

export type Dossie = {
  vinculo: DossieVinculo | null
  saidas: DossieSaida[]
  pedidos_anteriores: DossiePedido[]
  ocorrencias: DossieOcorrencia[]
  professor: {
    qtd_alunos: number
    pedidos_total: number
    pedidos_90d: number
    saidas_90d: number
  } | null
}

/**
 * Tudo que sabemos sobre o aluno do pedido, numa chamada só.
 *
 * É uma RPC e não N queries de propósito: `usePainelProfessores` já mostrou que
 * um Promise.all de várias queries zera a tela inteira quando UMA coluna some
 * do schema. Aqui, se uma fonte vier vazia, as outras continuam aparecendo.
 *
 * Só busca quando o card é aberto — a fila não paga o custo do dossiê de todos.
 */
export function useTransferenciaDossie(id: string | null) {
  return useQuery({
    queryKey: ['transferencias', 'dossie', id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async (): Promise<Dossie | null> => {
      const { data, error } = await supabase.rpc('transferencia_dossie', { p_id: id! })
      if (error) throw error
      return (data ?? null) as Dossie | null
    },
  })
}

// ─── Ações ────────────────────────────────────────────────────────────────────
// Toda escrita passa por função SECURITY DEFINER: `transferencias_aluno` não tem
// policy de INSERT/UPDATE. É assim que o Suporte ao Aluno processa a fila sem
// ganhar UPDATE genérico em `professores`. Ver 20260760_transferencias_aluno.sql.

function useAcaoTransferencia<TInput>(rpc: string, args: (input: TInput) => Record<string, unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TInput) => {
      const { error } = await supabase.rpc(rpc, args(input))
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transferencias'] })
      // O desfecho reescreve a observação no perfil do professor.
      qc.invalidateQueries({ queryKey: ['professor'] })
      qc.invalidateQueries({ queryKey: ['observacoes'] })
    },
  })
}

/** Assume o pedido — impede que duas pessoas atendam o mesmo. */
export function useAssumirTransferencia() {
  return useAcaoTransferencia<string>('assumir_transferencia', id => ({ p_id: id }))
}

/** Devolve o pedido para a fila. */
export function useLargarTransferencia() {
  return useAcaoTransferencia<string>('largar_transferencia', id => ({ p_id: id }))
}

export type ConcluirTransferenciaInput = {
  id: string
  desfecho: 'transferido' | 'mantido' | 'saiu_da_escola' | 'outro'
  /** Professor que recebeu o aluno — só faz sentido com desfecho 'transferido'. */
  destinoId?: string | null
  nota?: string
}

/** Conclui com o desfecho real. A transferência em si já foi feita (ou não) na
 *  plataforma do King — aqui registramos o que aconteceu. */
export function useConcluirTransferencia() {
  return useAcaoTransferencia<ConcluirTransferenciaInput>(
    'concluir_transferencia',
    ({ id, desfecho, destinoId, nota }) => ({
      p_id: id,
      p_desfecho: desfecho,
      p_destino: destinoId ?? null,
      p_nota: nota ?? null,
    }),
  )
}

/** Recusa o pedido — sai da fila sem transferir ninguém. O registro no perfil
 *  do professor permanece, fechado com o motivo. */
export function useRecusarTransferencia() {
  return useAcaoTransferencia<{ id: string; motivo?: string }>(
    'recusar_transferencia',
    ({ id, motivo }) => ({ p_id: id, p_motivo: motivo ?? null }),
  )
}
