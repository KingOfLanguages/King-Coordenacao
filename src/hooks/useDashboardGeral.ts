import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mesesDeCasa } from '@/lib/utils'

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

// ─── Reuniões por coordenação + movimento de professores (Fase 5) ────────────

export interface MovimentoRow {
  tipo: 'entrada' | 'saida'
  data: string           // 'AAAA-MM-DD'
  grupo_id: string | null
}

// Reuniões realizadas por dia (grão fino) — base de tudo que é reunião no
// dashboard. O RPC mensal (dashboard_geral_reunioes_por_periodo) não permite a
// visão semanal; este devolve por dia e o cliente agrupa em qualquer período.
export interface ReuniaoDatadaRow {
  grupo_id   : string | null
  data       : string   // 'AAAA-MM-DD'
  realizadas : number
}

export function useDashboardGeralReunioesDatadas() {
  return useQuery({
    queryKey: ['dashboard-geral', 'reunioes-datadas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_geral_reunioes_datadas')
      if (error) throw error
      return (data ?? []) as ReuniaoDatadaRow[]
    },
  })
}

export function useDashboardGeralMovimento() {
  return useQuery({
    queryKey: ['dashboard-geral', 'movimento'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_geral_movimento_professores')
      if (error) throw error
      return (data ?? []) as MovimentoRow[]
    },
  })
}

// ─── Meta mensal de reuniões (régua de tempo de casa) ─────────────────────────
// Professores ativos com data de início + grupo, para dimensionar quantas reuniões
// a coordenação deveria realizar no mês. Mesma régua do Dashboard da Coordenação.

export interface MetaProfRow {
  data_inicio: string | null
  grupo_id: string | null
}

export function useDashboardGeralMetaProfessores() {
  return useQuery({
    queryKey: ['dashboard-geral', 'meta-professores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select('data_inicio, grupo_id')
        .eq('status', 'ativo')
      if (error) throw error
      return (data ?? []) as MetaProfRow[]
    },
  })
}

// ─── Período: granularidade, janela e buckets ────────────────────────────────
//
// Uma granularidade só governa o dashboard inteiro (o filtro global no topo da
// página). Ela define duas coisas:
//   • a JANELA de apuração — o intervalo fechado de datas a que todo número da
//     tela se refere (period-to-date quando o período é o vigente);
//   • o BALDE das séries temporais — os gráficos mostram os últimos N períodos
//     desse tamanho terminando na janela, senão sobraria uma barra só.

export type Granularidade = 'semana' | 'mes' | 'trimestre' | 'semestre' | 'ano'

export const GRANULARIDADES: Granularidade[] = ['semana', 'mes', 'trimestre', 'semestre', 'ano']

export const LABEL_GRANULARIDADE: Record<Granularidade, string> = {
  semana: 'Semana', mes: 'Mês', trimestre: 'Trimestre', semestre: 'Semestre', ano: 'Ano',
}

/** Quantos períodos cada série temporal mostra, por granularidade. */
export const PERIODOS_NA_SERIE: Record<Granularidade, number> = {
  semana: 12, mes: 12, trimestre: 8, semestre: 6, ano: 5,
}

/** Data local → 'AAAA-MM-DD' (sem passar por UTC, pra bater com o período local). */
export const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Início do período que contém `ref`, deslocado de `offset` períodos
 * (0 = vigente, -1 = anterior…). Semana começa na segunda; meia-noite local.
 */
export function inicioDoPeriodo(periodo: Granularidade, ref: Date = new Date(), offset = 0): Date {
  const y = ref.getFullYear(), m = ref.getMonth(), d = ref.getDate()
  switch (periodo) {
    case 'ano':       return new Date(y + offset, 0, 1)
    case 'semestre':  return new Date(y, Math.floor(m / 6) * 6 + offset * 6, 1)
    case 'trimestre': return new Date(y, Math.floor(m / 3) * 3 + offset * 3, 1)
    case 'mes':       return new Date(y, m + offset, 1)
    case 'semana':    return new Date(y, m, d - ((ref.getDay() + 6) % 7) + offset * 7) // segunda=0
  }
}

/** Último dia do período que começa em `inicio`. */
export function fimDoPeriodo(periodo: Granularidade, inicio: Date): Date {
  const y = inicio.getFullYear(), m = inicio.getMonth(), d = inicio.getDate()
  switch (periodo) {
    case 'ano':       return new Date(y + 1, 0, 0)
    case 'semestre':  return new Date(y, m + 6, 0)
    case 'trimestre': return new Date(y, m + 3, 0)
    case 'mes':       return new Date(y, m + 1, 0)
    case 'semana':    return new Date(y, m, d + 6)
  }
}

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

/** Rótulo por extenso do período — o que aparece no seletor global. */
export function rotuloPeriodo(gran: Granularidade, inicio: Date): string {
  const m = inicio.getMonth(), y = inicio.getFullYear()
  switch (gran) {
    case 'ano':       return String(y)
    case 'semestre':  return `${Math.floor(m / 6) + 1}º semestre de ${y}`
    case 'trimestre': return `${Math.floor(m / 3) + 1}º trimestre de ${y}`
    case 'mes':       return `${MESES_PT[m]} de ${y}`
    case 'semana': {
      const fim = fimDoPeriodo('semana', inicio)
      return `${ddmm(inicio)} a ${ddmm(fim)} de ${fim.getFullYear()}`
    }
  }
}

/** Intervalo fechado de datas a que os números da tela se referem. */
export interface Janela {
  gran: Granularidade
  inicio: string   // 'AAAA-MM-DD'
  fim: string      // 'AAAA-MM-DD'
  label: string
  custom: boolean  // true = intervalo digitado à mão, fora da grade de períodos
}

export function janelaDoPeriodo(gran: Granularidade, offset = 0, ref: Date = new Date()): Janela {
  const inicio = inicioDoPeriodo(gran, ref, offset)
  return {
    gran,
    inicio: ymdLocal(inicio),
    fim: ymdLocal(fimDoPeriodo(gran, inicio)),
    label: rotuloPeriodo(gran, inicio),
    custom: false,
  }
}

// ─── Agrupamento por período (buckets das séries) ────────────────────────────

export interface Bucket { key: string; label: string; ordem: number }

/** Semana ISO (segunda a domingo) de uma data — ano+número, padrão internacional. */
function semanaIso(date: Date): { ano: number; semana: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const diaSeg0 = (d.getUTCDay() + 6) % 7          // segunda=0 … domingo=6
  d.setUTCDate(d.getUTCDate() - diaSeg0 + 3)       // quinta-feira desta semana
  const primeiraQuinta = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const diaSeg0Jan = (primeiraQuinta.getUTCDay() + 6) % 7
  primeiraQuinta.setUTCDate(primeiraQuinta.getUTCDate() - diaSeg0Jan + 3)
  const semana = 1 + Math.round((d.getTime() - primeiraQuinta.getTime()) / (7 * 864e5))
  return { ano: d.getUTCFullYear(), semana }
}

/** Chave ordenável + rótulo curto pt-BR de um período, na granularidade escolhida. */
export function bucketPeriodo(dataISO: string, gran: Granularidade): Bucket {
  const d = new Date(dataISO + 'T00:00:00')
  const ano = d.getFullYear()
  const mes = d.getMonth() + 1
  const yy = String(ano).slice(2)
  switch (gran) {
    case 'ano':
      return { key: String(ano), label: String(ano), ordem: ano * 1000 }
    case 'semestre': {
      const s = Math.floor((mes - 1) / 6) + 1
      return { key: `${ano}-S${s}`, label: `${s}º sem/${yy}`, ordem: ano * 10 + s }
    }
    case 'trimestre': {
      const q = Math.floor((mes - 1) / 3) + 1
      return { key: `${ano}-T${q}`, label: `${q}º tri/${yy}`, ordem: ano * 10 + q }
    }
    case 'mes': {
      const mm = String(mes).padStart(2, '0')
      return { key: `${ano}-${mm}`, label: `${mm}/${yy}`, ordem: ano * 100 + mes }
    }
    case 'semana': {
      const { ano: wAno, semana } = semanaIso(d)
      return { key: `${wAno}-W${semana}`, label: `S${semana}/${String(wAno).slice(2)}`, ordem: wAno * 100 + semana }
    }
  }
}

/**
 * Buckets vazios cobrindo [inicioISO, fimISO] — é o esqueleto dos gráficos, pra
 * que um período sem nenhum registro apareça como zero em vez de sumir do eixo.
 * Monta de trás pra frente: um intervalo absurdo (ex.: 20 anos por semana) corta
 * o começo, não o fim, que é o que interessa olhar.
 */
export function bucketsNoIntervalo(
  inicioISO: string, fimISO: string, gran: Granularidade, max = 240,
): Bucket[] {
  const out: Bucket[] = []
  const inicio = inicioDoPeriodo(gran, new Date(inicioISO + 'T00:00:00')).getTime()
  let cur = inicioDoPeriodo(gran, new Date(fimISO + 'T00:00:00'))
  while (cur.getTime() >= inicio && out.length < max) {
    out.push(bucketPeriodo(ymdLocal(cur), gran))
    cur = inicioDoPeriodo(gran, cur, -1)
  }
  return out.reverse()
}

/** Intervalo dos `n` períodos que terminam no período que contém `fimISO`. */
export function serieAte(
  gran: Granularidade, fimISO: string, n: number = PERIODOS_NA_SERIE[gran],
): { inicio: string; fim: string } {
  const ref = new Date(fimISO + 'T00:00:00')
  return {
    inicio: ymdLocal(inicioDoPeriodo(gran, ref, -(n - 1))),
    fim: ymdLocal(fimDoPeriodo(gran, inicioDoPeriodo(gran, ref))),
  }
}

export interface PontoMovimento { periodo: string; ordem: number; entradas: number; saidas: number; saldo: number }

/**
 * Agrupa eventos de movimento por período, prontos pro gráfico (ordenados no
 * tempo). `buckets` (opcional) semeia os períodos vazios do intervalo.
 */
export function agruparMovimento(
  rows: MovimentoRow[], gran: Granularidade, buckets: Bucket[] = [],
): PontoMovimento[] {
  const mapa = new Map<string, PontoMovimento>()
  for (const b of buckets) {
    mapa.set(b.key, { periodo: b.label, ordem: b.ordem, entradas: 0, saidas: 0, saldo: 0 })
  }
  for (const r of rows) {
    if (!r.data) continue
    const { key, label, ordem } = bucketPeriodo(r.data, gran)
    let ponto = mapa.get(key)
    if (!ponto) { ponto = { periodo: label, ordem, entradas: 0, saidas: 0, saldo: 0 }; mapa.set(key, ponto) }
    if (r.tipo === 'entrada') ponto.entradas++
    else ponto.saidas++
  }
  const pontos = [...mapa.values()]
  for (const p of pontos) p.saldo = p.entradas - p.saidas
  return pontos.sort((a, b) => a.ordem - b.ordem)
}

// ─── Meta de reuniões (régua de tempo de casa) ───────────────────────────────

export interface MetaReunioes {
  meta: number
  admissoes: number   // admissões dentro da janela
  profs2a3: number    // faixa de tempo de casa medida no fim da janela
  profs4: number
}

/** Quantos "meses de cadência" cabem no período — fator de escala da meta. */
const MESES_NO_PERIODO: Record<Granularidade, number> = {
  semana:    7 / 30.44, // ~0,23 mês
  mes:       1,
  trimestre: 3,
  semestre:  6,
  ano:       12,
}

/**
 * Quantas reuniões a coordenação deve realizar NA JANELA para um conjunto de
 * professores ativos, pela régua de tempo de casa (mesma do Dashboard da
 * Coordenação): admissões do período (1x cada) + professores de 2–3 meses
 * (cadência mensal) + 4+ meses (cadência trimestral).
 *
 * A cadência é escalada em regime permanente: o nº de professores por faixa é
 * multiplicado pelos meses/trimestres que cabem no período. Com `gran='mes'` e a
 * janela do mês vigente reduz exatamente à fórmula mensal original
 *   (admissões do mês + profs 2–3 + 33,3% dos +4).
 *
 * O tempo de casa é medido no fim da janela (ou hoje, se a janela ainda está
 * aberta) — assim um período passado usa as faixas daquela época, não as de hoje.
 * A base é sempre o roster ATUAL de ativos: quem já saiu não volta pro cálculo.
 */
export function metaReunioesPeriodo(
  profs: { data_inicio: string | null }[],
  gran: Granularidade,
  janela: { inicio: string; fim: string },
): MetaReunioes {
  const inicio = new Date(janela.inicio + 'T00:00:00').getTime()
  const fim = new Date(janela.fim + 'T23:59:59').getTime()
  const ref = new Date(Math.min(fim, Date.now()))
  const mesesP = MESES_NO_PERIODO[gran]
  let admissoes = 0, profs2a3 = 0, profs4 = 0
  for (const p of profs) {
    if (p.data_inicio) {
      const t0 = new Date(p.data_inicio).getTime()
      if (t0 >= inicio && t0 <= fim) admissoes++
    }
    const t = mesesDeCasa(p.data_inicio, ref)
    if (t !== null && t >= 2 && t <= 3) profs2a3++
    if (t !== null && t > 4) profs4++
  }
  // 2–3 meses = mensal (×mesesP); 4+ meses = trimestral (×mesesP/3).
  const meta = admissoes + Math.round(profs2a3 * mesesP) + Math.round(profs4 * mesesP / 3)
  return { meta, admissoes, profs2a3, profs4 }
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
