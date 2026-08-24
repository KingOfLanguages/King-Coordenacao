import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Turnover de PROFESSOR — espelho da página de turnover da plataforma do King.
// Turnover é sempre movimento do quadro de professores; saída de ALUNO é churn
// (useChurnAlunos, mais abaixo) e é esse o número que a coordenação compara com
// a King. Metodologia e validação: migration 20260757.
//
// turnover % = saídas ÷ média(ativos no início, ativos no fim)

export interface TurnoverResumo {
  entradas: number
  saidas: number
  ativos_inicio: number
  ativos_fim: number
  turnover_pct: number
}

export interface TurnoverMotivo   { motivo: string; total: number }
export interface TurnoverFaixa    { faixa: string; ordem: number; total: number }
export interface TurnoverMes      extends TurnoverResumo { ano_mes: number }
export interface TurnoverGrupo    extends TurnoverResumo { grupo_id: string | null; grupo_nome: string }

// Postgres manda BIGINT/NUMERIC como string no JSON — normaliza tudo.
const n = (v: unknown) => Number(v ?? 0)
const resumoDe = (r: Record<string, unknown>): TurnoverResumo => ({
  entradas:      n(r.entradas),
  saidas:        n(r.saidas),
  ativos_inicio: n(r.ativos_inicio),
  ativos_fim:    n(r.ativos_fim),
  turnover_pct:  n(r.turnover_pct),
})

const RESUMO_VAZIO: TurnoverResumo = {
  entradas: 0, saidas: 0, ativos_inicio: 0, ativos_fim: 0, turnover_pct: 0,
}

export function useTurnoverProfessores(desde: string, ate: string) {
  return useQuery({
    queryKey: ['turnover-professores', desde, ate],
    queryFn: async () => {
      const args = { p_desde: desde, p_ate: ate }
      const [resumo, motivos, permanencia, mensal, porGrupo] = await Promise.all([
        supabase.rpc('turnover_professores_resumo', args),
        supabase.rpc('turnover_professores_motivos', args),
        supabase.rpc('turnover_professores_permanencia', args),
        supabase.rpc('turnover_professores_mensal', args),
        supabase.rpc('turnover_professores_por_grupo', args),
      ])
      for (const r of [resumo, motivos, permanencia, mensal, porGrupo]) {
        if (r.error) throw r.error
      }

      const linha = (resumo.data as Record<string, unknown>[] | null)?.[0]

      return {
        resumo: linha ? resumoDe(linha) : RESUMO_VAZIO,
        motivos: ((motivos.data ?? []) as Record<string, unknown>[]).map((r): TurnoverMotivo => ({
          motivo: String(r.motivo),
          total: n(r.total),
        })),
        permanencia: ((permanencia.data ?? []) as Record<string, unknown>[]).map((r): TurnoverFaixa => ({
          faixa: String(r.faixa),
          ordem: n(r.ordem),
          total: n(r.total),
        })),
        mensal: ((mensal.data ?? []) as Record<string, unknown>[]).map((r): TurnoverMes => ({
          ano_mes: n(r.ano_mes),
          ...resumoDe(r),
        })),
        porGrupo: ((porGrupo.data ?? []) as Record<string, unknown>[]).map((r): TurnoverGrupo => ({
          grupo_id: (r.grupo_id as string | null) ?? null,
          grupo_nome: String(r.grupo_nome),
          ...resumoDe(r),
        })),
      }
    },
    enabled: !!desde && !!ate,
  })
}

// CHURN de aluno — mesma fórmula do turnover de professor (migration 20260758),
// sobre a matrícula na escola e a saída da escola. Troca de professor NÃO é saída.
//
// Nome: aluno que sai da escola é churn, não turnover — turnover é movimento de
// entrada/saída do quadro (professor). As funções no banco ainda se chamam
// turnover_alunos_* e devolvem turnover_pct; é só o nome antigo do contrato, o
// número é o churn.
//
// Cuidado ao ler períodos antigos: a API devolve as saídas de aluno dos últimos
// ~12 meses, então antes disso a base de ativos fica inflada. A tabela é
// append-only, então a janela confiável cresce sozinha.
export function useChurnAlunos(desde: string, ate: string) {
  return useQuery({
    queryKey: ['churn-alunos', desde, ate],
    queryFn: async () => {
      const args = { p_desde: desde, p_ate: ate }
      const [resumo, porGrupo] = await Promise.all([
        supabase.rpc('turnover_alunos_resumo', args),
        supabase.rpc('turnover_alunos_por_grupo', args),
      ])
      if (resumo.error) throw resumo.error
      if (porGrupo.error) throw porGrupo.error

      const linha = (resumo.data as Record<string, unknown>[] | null)?.[0]
      return {
        resumo: linha ? resumoDe(linha) : RESUMO_VAZIO,
        porGrupo: ((porGrupo.data ?? []) as Record<string, unknown>[]).map((r): TurnoverGrupo => ({
          grupo_id: (r.grupo_id as string | null) ?? null,
          grupo_nome: String(r.grupo_nome),
          ...resumoDe(r),
        })),
      }
    },
    enabled: !!desde && !!ate,
  })
}

// "Nao informado" (sem til) é como a categoria default chega da King. Os motivos
// livres vêm com prefixo "Outro: " e texto inteiro do professor — a lista mostra
// o texto cru, mas o rótulo curto serve pra agrupar/legendar.
export function motivoCurto(motivo: string): string {
  if (motivo === 'Nao informado') return 'Não informado'
  if (motivo.startsWith('Outro: ')) return 'Outro'
  // Os motivos de catálogo são "Título curto (explicação longa entre parênteses)".
  const corte = motivo.indexOf(' (')
  return corte > 0 ? motivo.slice(0, corte) : motivo
}

export const mesLabel = (anoMes: number): string => {
  const ano = Math.floor(anoMes / 100)
  const mes = anoMes % 100
  return `${String(mes).padStart(2, '0')}/${ano}`
}
