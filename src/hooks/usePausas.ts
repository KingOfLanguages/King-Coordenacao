import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Pausa, PausaStatus } from '@/types'

// ─── Modelo ───────────────────────────────────────────────────────────────────

export type PausaComProfessor = Pausa & {
  professor?: {
    id: string
    nome: string
    status: string
    grupo?: { id: string; nome: string } | null
    coordenador?: { id: string; nome: string } | null
  } | null
  assumido_por_perfil?: { id: string; nome: string } | null
}

/** Estágio da solicitação na fila, derivado das datas — é o que dá a ordem e o
 *  destaque visual da tela. `atrasada` é o caso que não pode acontecer: a data
 *  de início chegou e ninguém processou a retirada dos alunos. */
export type FaixaPausa = 'atrasada' | 'hoje' | 'proxima' | 'futura'

/** Quantos dias à frente ainda contam como "próximos dias" (faixa de atenção). */
export const DIAS_PROXIMA = 7

/** Dias inteiros de hoje até uma data ISO (YYYY-MM-DD). Negativo = passado.
 *  Compara só a parte de data, sem hora — evita o resultado mudar conforme a
 *  hora do dia em que a tela é aberta. */
export function diasAte(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = Date.UTC(a, m - 1, d)
  const agora = new Date()
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.round((alvo - hoje) / 86_400_000)
}

export function faixaDaPausa(p: Pick<Pausa, 'data_inicio'>): FaixaPausa {
  const dias = diasAte(p.data_inicio)
  if (dias < 0) return 'atrasada'
  if (dias === 0) return 'hoje'
  if (dias <= DIAS_PROXIMA) return 'proxima'
  return 'futura'
}

export const FAIXA_META: Record<FaixaPausa, { label: string; descricao: string }> = {
  atrasada: { label: 'Atrasadas',      descricao: 'A data de início já passou e a pausa não foi processada.' },
  hoje:     { label: 'Começam hoje',   descricao: 'Último dia de aula é hoje.' },
  proxima:  { label: 'Próximos dias',  descricao: `Começam nos próximos ${DIAS_PROXIMA} dias.` },
  futura:   { label: 'Mais adiante',   descricao: 'Ainda há tempo até o início.' },
}

export const STATUS_PAUSA_META: Record<PausaStatus, { label: string; cls: string }> = {
  pendente:       { label: 'Pendente',      cls: 'bg-urg-medBg text-urg-medFg' },
  em_atendimento: { label: 'Em atendimento', cls: 'bg-accentBlue-soft text-accentBlue' },
  concluida:      { label: 'Concluída',     cls: 'bg-urg-lowBg text-urg-lowFg' },
  recusada:       { label: 'Recusada',      cls: 'bg-surface-subtle text-ink-muted' },
}

const SELECT_PAUSA = `
  *,
  professor:professores!professor_id (
    id, nome, status,
    grupo:grupos!grupo_id (id, nome),
    coordenador:profiles!coordenador_id (id, nome)
  ),
  assumido_por_perfil:profiles!assumido_por (id, nome)
`

// ─── Consultas ────────────────────────────────────────────────────────────────

/** Fila de trabalho: pendentes e em atendimento, mais urgentes primeiro
 *  (proximidade da data de início). */
export function usePausasFila() {
  return useQuery({
    queryKey: ['pausas', 'fila'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pausas')
        .select(SELECT_PAUSA)
        .in('status', ['pendente', 'em_atendimento'])
        .order('data_inicio', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as PausaComProfessor[]
    },
  })
}

/** Pausas já ativas (o professor está pausado) e ainda não encerradas. É aqui
 *  que aparece quem já passou da data de fim e está esperando o contato. */
export function usePausasVigentes() {
  return useQuery({
    queryKey: ['pausas', 'vigentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pausas')
        .select(SELECT_PAUSA)
        .not('ativada_em', 'is', null)
        .is('encerrada_em', null)
        .order('data_fim', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as PausaComProfessor[]
    },
  })
}

/** Histórico: concluídas/recusadas já finalizadas, para consulta. */
export function usePausasFinalizadas() {
  return useQuery({
    queryKey: ['pausas', 'finalizadas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pausas')
        .select(SELECT_PAUSA)
        .or('status.eq.recusada,and(status.eq.concluida,encerrada_em.not.is.null)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as PausaComProfessor[]
    },
  })
}

// ─── Ações ────────────────────────────────────────────────────────────────────
// Toda escrita passa por função SECURITY DEFINER: `pausas` não tem policy de
// INSERT/UPDATE. É assim que o Suporte ao Aluno age sem ganhar UPDATE genérico
// em `professores`. Ver 20260738_pausas.sql.

function useAcaoPausa<TInput>(rpc: string, args: (input: TInput) => Record<string, unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TInput) => {
      const { error } = await supabase.rpc(rpc, args(input))
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pausas'] })
      qc.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}

/** Assume a solicitação — impede que duas pessoas processem a mesma pausa. */
export function useAssumirPausa() {
  return useAcaoPausa<string>('assumir_pausa', id => ({ p_id: id }))
}

/** Devolve a solicitação para a fila. */
export function useLargarPausa() {
  return useAcaoPausa<string>('largar_pausa', id => ({ p_id: id }))
}

/** Conclui: os alunos já foram retirados. Ativa a pausa se a data de início já
 *  chegou; senão o cron ativa no dia certo. */
export function useConcluirPausa() {
  return useAcaoPausa<string>('concluir_pausa', id => ({ p_id: id }))
}

/** Recusa a solicitação — sai da fila sem pausar o professor. */
export function useRecusarPausa() {
  return useAcaoPausa<{ id: string; motivo?: string }>(
    'recusar_pausa',
    ({ id, motivo }) => ({ p_id: id, p_motivo: motivo ?? null }),
  )
}

/** Encerra a pausa vigente do professor — o contato da coordenação aconteceu.
 *  Tira da pausa e fecha a linha de pausa numa transação só. Restrito à
 *  coordenação pela própria função no banco. */
export function useEncerrarPausa() {
  return useAcaoPausa<string>('encerrar_pausa', professorId => ({ p_professor_id: professorId }))
}
