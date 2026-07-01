import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Fetch ──────────────────────────────────────────────────────────────────

export interface ProfessorGeralRow {
  professor_id: string
  nome: string
  grupo_id: string | null
  grupo_nome: string | null
  coordenador_nome: string | null
  score_atual: number | null
  score_faixa: string | null
  score_hist_recente: number | null
  score_hist_anterior: number | null
  alertas_qtd: number
  ultima_reuniao_realizada: string | null
  proxima_reuniao_pendente: string | null
}

export interface ScoreTrendRow {
  grupo_id: string | null
  ano_mes: number
  score_medio: number
}

export function useDashboardGeralProfessores() {
  return useQuery({
    queryKey: ['dashboard-geral', 'professores'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_geral_professores')
      if (error) throw error
      return (data ?? []) as ProfessorGeralRow[]
    },
  })
}

export function useDashboardGeralScoreTrend() {
  return useQuery({
    queryKey: ['dashboard-geral', 'score-trend'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_geral_score_trend')
      if (error) throw error
      return (data ?? []) as ScoreTrendRow[]
    },
  })
}

// ─── Faixas de score (200–1500) ────────────────────────────────────────────

export const SCORE_BUCKETS = [
  { min: 200,  max: 399,  label: '200–399' },
  { min: 400,  max: 599,  label: '400–599' },
  { min: 600,  max: 799,  label: '600–799' },
  { min: 800,  max: 999,  label: '800–999' },
  { min: 1000, max: 1199, label: '1000–1199' },
  { min: 1200, max: 1399, label: '1200–1399' },
  { min: 1400, max: 1500, label: '1400–1500' },
] as const

export function bucketFor(score: number): (typeof SCORE_BUCKETS)[number] | null {
  return SCORE_BUCKETS.find(b => score >= b.min && score <= b.max) ?? null
}

// ─── Estatística ────────────────────────────────────────────────────────────

export function media(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function mediana(nums: number[]): number | null {
  if (!nums.length) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ─── Alertas inteligentes ───────────────────────────────────────────────────

export type MotivoAlerta =
  | 'score_baixo'
  | 'queda_score'
  | 'sem_reuniao_30d'
  | 'sem_proxima_agendada'

export const LABEL_ALERTA: Record<MotivoAlerta, string> = {
  score_baixo:          'Score crítico (< 400)',
  queda_score:          'Queda de score ≥ 15%',
  sem_reuniao_30d:      'Sem reunião há mais de 30 dias',
  sem_proxima_agendada: 'Sem próxima reunião agendada',
}

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000

export function motivosAlerta(row: ProfessorGeralRow): MotivoAlerta[] {
  const motivos: MotivoAlerta[] = []

  if (row.score_atual != null && row.score_atual < 400) motivos.push('score_baixo')

  if (
    row.score_hist_recente != null &&
    row.score_hist_anterior != null &&
    row.score_hist_anterior > 0 &&
    (row.score_hist_anterior - row.score_hist_recente) / row.score_hist_anterior >= 0.15
  ) {
    motivos.push('queda_score')
  }

  const semReuniaoHaMuitoTempo = row.ultima_reuniao_realizada == null
    || (Date.now() - new Date(row.ultima_reuniao_realizada).getTime()) > TRINTA_DIAS_MS
  if (semReuniaoHaMuitoTempo) motivos.push('sem_reuniao_30d')

  if (row.proxima_reuniao_pendente == null) motivos.push('sem_proxima_agendada')

  return motivos
}

// ─── Agregação por coordenação (= grupo) ───────────────────────────────────

export interface CoordenacaoStats {
  grupo_id: string | null
  grupo_nome: string
  coordenador_nome: string | null
  professores: number
  scoreMedio: number | null
  ultimaReuniaoRealizada: string | null
  pctAcima1200: number
  pctAbaixo600: number
}

export function agregarPorCoordenacao(rows: ProfessorGeralRow[]): CoordenacaoStats[] {
  const porGrupo = new Map<string, ProfessorGeralRow[]>()
  for (const r of rows) {
    const key = r.grupo_id ?? '__sem_grupo__'
    if (!porGrupo.has(key)) porGrupo.set(key, [])
    porGrupo.get(key)!.push(r)
  }

  return [...porGrupo.entries()].map(([key, grupo]) => {
    const scores = grupo.map(g => g.score_atual).filter((s): s is number => s != null)
    const ultimas = grupo.map(g => g.ultima_reuniao_realizada).filter((d): d is string => d != null)
    return {
      grupo_id: key === '__sem_grupo__' ? null : key,
      grupo_nome: grupo[0]?.grupo_nome ?? 'Sem grupo',
      coordenador_nome: grupo[0]?.coordenador_nome ?? null,
      professores: grupo.length,
      scoreMedio: media(scores),
      ultimaReuniaoRealizada: ultimas.length ? ultimas.sort().at(-1)! : null,
      pctAcima1200: grupo.length ? (scores.filter(s => s >= 1200).length / grupo.length) * 100 : 0,
      pctAbaixo600: grupo.length ? (scores.filter(s => s < 600).length / grupo.length) * 100 : 0,
    }
  })
}
