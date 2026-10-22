import { useMemo } from 'react'
import { useAgora } from '@/hooks/useAgora'
import { situacaoTrilha, type SituacaoTrilha } from '@/lib/prazoTrilha'
import {
  useAcompanhamentoTrilha, useEtapasAdmin, useProgressoTodos,
  type AcompanhamentoTrilha, type ProgressoAdmin,
} from '@/hooks/useWelcomePathAdmin'

// ─────────────────────────────────────────────────────────────────────────────
// O que as abas da área Welcome Path (/trilha) dividem: a linha de cada
// professor com a situação calculada no relógio de quem olha, e como cada
// situação aparece. Professores e Revisões leem daqui; o painel do professor
// recebe a linha pronta.
// ─────────────────────────────────────────────────────────────────────────────

export type LinhaTrilha = AcompanhamentoTrilha & {
  situacao: SituacaoTrilha
  porEtapa: Map<string, ProgressoAdmin>
}

export const SITUACAO: Record<SituacaoTrilha, { label: string; cls: string; peso: number }> = {
  bloqueado:     { label: 'Bloqueado',        cls: 'bg-aviso-warnBg text-aviso-warnFg',    peso: 0 },
  acabando:      { label: 'Menos de 24h',     cls: 'bg-urg-medBg text-urg-medFg',          peso: 1 },
  falta_reuniao: { label: 'Falta 1ª reunião', cls: 'bg-aviso-infoBg text-aviso-infoFg',    peso: 2 },
  sem_convite:   { label: 'Sem convite',      cls: 'bg-surface-subtle text-ink-secondary', peso: 3 },
  convidado:     { label: 'Convidado',        cls: 'bg-surface-subtle text-ink-muted',     peso: 4 },
  andamento:     { label: 'Em andamento',     cls: 'bg-accentBlue-soft text-accentBlue',   peso: 5 },
  finalizado:    { label: 'Finalizado',       cls: 'bg-aviso-okBg text-aviso-okFg',        peso: 6 },
  dispensado:    { label: 'Dispensado',       cls: 'bg-surface-subtle text-ink-secondary', peso: 7 },
}

/** Fora da conta de "em aberto": já resolvidos, de um jeito ou de outro. */
export const FECHADAS: SituacaoTrilha[] = ['finalizado', 'dispensado']

export function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/** Contas de teste da coordenação ficam de fora dos números por padrão. */
export function ehTeste(nome: string): boolean {
  return norm(nome).includes('teste')
}

export function useLinhasTrilha() {
  const { data: base = [], isLoading } = useAcompanhamentoTrilha()
  const { data: etapas = [] } = useEtapasAdmin()
  const { data: progresso = [] } = useProgressoTodos()
  const agora = useAgora(30_000)

  const ativas = useMemo(() => etapas.filter(e => e.ativa), [etapas])

  const linhas = useMemo<LinhaTrilha[]>(() => {
    const porProfessor = new Map<string, Map<string, ProgressoAdmin>>()
    for (const p of progresso) {
      if (!porProfessor.has(p.professor_id)) porProfessor.set(p.professor_id, new Map())
      porProfessor.get(p.professor_id)!.set(p.etapa_id, p)
    }
    return base.map(l => ({
      ...l,
      situacao: situacaoTrilha(l, agora),
      porEtapa: porProfessor.get(l.professor_id) ?? new Map(),
    }))
  }, [base, progresso, agora])

  return { linhas, etapas, ativas, carregando: isLoading, agora }
}
