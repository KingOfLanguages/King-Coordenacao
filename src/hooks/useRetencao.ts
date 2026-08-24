import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Retenção/churn de aluno agregado no servidor (RPCs retencao_por_grupo /
// retencao_por_motivo) — evita o teto de 1000 linhas do PostgREST ao somar as
// saídas de todos os professores. Ver migration 20260752_ciclo_vida_alunos.
//
// churn    = saiu_da_escola true  (aluno saiu da escola)
// turnover = saiu_da_escola false (trocou de professor, segue matriculado) — o
//            campo tem esse nome no RPC; na tela é "trocou de professor", nunca
//            "turnover", que é o movimento do quadro de professores.
// total − churn − turnover = saídas sem o flag definido.

export interface RetencaoGrupoRow {
  grupo_id: string | null
  grupo_nome: string
  total_saidas: number
  churn: number
  turnover: number
}

export interface RetencaoMotivoRow {
  motivo: string
  total: number
  churn: number
  turnover: number
}

// bigint do Postgres pode chegar como número ou string no JSON — normaliza.
type RawGrupo = { grupo_id: string | null; grupo_nome: string; total_saidas: number | string; churn: number | string; turnover: number | string }
type RawMotivo = { motivo: string; total: number | string; churn: number | string; turnover: number | string }

export function useRetencao(desde: string, ate: string) {
  return useQuery({
    queryKey: ['retencao', desde, ate],
    queryFn: async () => {
      const [{ data: porGrupo, error: e1 }, { data: porMotivo, error: e2 }] = await Promise.all([
        supabase.rpc('retencao_por_grupo',  { p_desde: desde, p_ate: ate }),
        supabase.rpc('retencao_por_motivo', { p_desde: desde, p_ate: ate }),
      ])
      if (e1) throw e1
      if (e2) throw e2

      return {
        porGrupo: ((porGrupo ?? []) as RawGrupo[]).map((r): RetencaoGrupoRow => ({
          grupo_id: r.grupo_id,
          grupo_nome: r.grupo_nome,
          total_saidas: Number(r.total_saidas),
          churn: Number(r.churn),
          turnover: Number(r.turnover),
        })),
        porMotivo: ((porMotivo ?? []) as RawMotivo[]).map((r): RetencaoMotivoRow => ({
          motivo: r.motivo,
          total: Number(r.total),
          churn: Number(r.churn),
          turnover: Number(r.turnover),
        })),
      }
    },
    enabled: !!desde && !!ate,
  })
}
