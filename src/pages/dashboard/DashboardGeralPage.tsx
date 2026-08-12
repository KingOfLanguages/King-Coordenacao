import { Fragment, useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown, ChevronRight, ChevronLeft, Search, CalendarRange,
  TrendingUp, TrendingDown, AlertTriangle, X,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useGrupos } from '@/hooks/useGrupos'
import {
  useDashboardGeralProfessores, useDashboardGeralScoreTrend,
  useDashboardGeralReunioesDatadas, useDashboardGeralMovimento,
  useDashboardGeralMetaProfessores,
  SCORE_BUCKETS, bucketFor, media, mediana, motivosAlerta, agregarPorCoordenacao,
  agruparMovimento, metaReunioesPeriodo, janelaDoPeriodo, serieAte, bucketsNoIntervalo,
  bucketPeriodo, ymdLocal, LABEL_ALERTA, LABEL_GRANULARIDADE, GRANULARIDADES,
  type ProfessorGeralRow, type CoordenacaoStats, type MotivoAlerta,
  type Granularidade, type Janela,
} from '@/hooks/useDashboardGeral'
import { IncidentesDashboardSection } from './IncidentesDashboardSection'
import { TurnoverDashboardSection } from './TurnoverDashboardSection'
import { cn } from '@/lib/utils'

const CORES_FAIXA = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#16a34a']
// Paleta categórica para os grupos (não implica score, ao contrário da escala de faixa).
const CORES_GRUPO = ['#d1333a', '#e0740c', '#12894a', '#2a5cff', '#6b1a8f', '#0891b2', '#c2410c']
const TODAS = 'todas'

const ALERTA_CHIP: Record<MotivoAlerta, string> = {
  score_baixo:          'bg-urg-critBg text-urg-critFg',
  queda_score:          'bg-urg-medBg text-urg-medFg',
  sem_reuniao_30d:      'bg-urg-highBg text-urg-highFg',
  sem_proxima_agendada: 'bg-urg-highBg text-urg-highFg',
}

const pct1 = (n: number) => n.toFixed(1).replace('.', ',')

/** 'AAAA-MM-DD' → 'DD/MM/AAAA'. */
const fmtBr = (iso: string) => {
  const [a, m, d] = iso.split('-')
  return d && m && a ? `${d}/${m}/${a}` : iso
}

// Rótulos da meta multi-período.
const TITULO_META: Record<Granularidade, string> = {
  semana: 'Meta da semana', mes: 'Meta do mês', trimestre: 'Meta do trimestre',
  semestre: 'Meta do semestre', ano: 'Meta do ano',
}
const ADMISSOES_LABEL: Record<Granularidade, string> = {
  semana: 'Admissões na semana', mes: 'Admissões do mês', trimestre: 'Admissões no trimestre',
  semestre: 'Admissões no semestre', ano: 'Admissões no ano',
}
const PERIODO_NOME: Record<Granularidade, string> = {
  semana: 'semana', mes: 'mês', trimestre: 'trimestre', semestre: 'semestre', ano: 'ano',
}
// Fator visível da faixa 4+ meses (cadência trimestral) na janela escolhida.
const NOTA_MULT_4: Record<Granularidade, string> = {
  semana: '~1/13', mes: '33,3%', trimestre: '100%', semestre: '2×', ano: '4×',
}

// ─── Ordenação genérica ─────────────────────────────────────────────────────

type SortKey = keyof CoordenacaoStats

function useSortable(rows: CoordenacaoStats[], defaultKey: SortKey) {
  const [key, setKey] = useState<SortKey>(defaultKey)
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[key], bv = b[key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string' && typeof bv === 'string') {
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [rows, key, dir])

  function toggle(k: SortKey) {
    if (k === key) setDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setKey(k); setDir('desc') }
  }

  return { sorted, key, dir, toggle }
}

function SortHeader({
  label, sortKey, active, dir, onClick, className,
}: { label: string; sortKey: SortKey; active: SortKey; dir: 'asc' | 'desc'; onClick: (k: SortKey) => void; className?: string }) {
  return (
    <th
      onClick={() => onClick(sortKey)}
      className={cn('px-3 py-2.5 text-left text-[10.5px] uppercase tracking-[0.06em] font-semibold text-ink-muted cursor-pointer select-none hover:text-ink', className)}
    >
      {label}{active === sortKey && (dir === 'asc' ? ' ▲' : ' ▼')}
    </th>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────

export function DashboardGeralPage() {
  const { data: rows = [], isLoading } = useDashboardGeralProfessores()
  const { data: trend = [] } = useDashboardGeralScoreTrend()
  const { data: reunioesDatadas = [] } = useDashboardGeralReunioesDatadas()
  const { data: movimento = [] } = useDashboardGeralMovimento()
  const { data: metaProfs = [] } = useDashboardGeralMetaProfessores()
  const { data: grupos = [] } = useGrupos()

  const [coordenacaoFiltro, setCoordenacaoFiltro] = useState(TODAS)
  const [professorFiltro, setProfessorFiltro] = useState('')
  const [faixaFiltro, setFaixaFiltro] = useState(TODAS)
  // Filtro de período global: granularidade + deslocamento (0 = período vigente).
  // Um intervalo digitado à mão sobrepõe a grade de períodos.
  const [gran, setGran] = useState<Granularidade>('mes')
  const [offset, setOffset] = useState(0)
  const [customDe, setCustomDe] = useState('')
  const [customAte, setCustomAte] = useState('')
  const [expandido, setExpandido] = useState<Set<string>>(new Set())

  const janela: Janela = useMemo(() => {
    if (customDe || customAte) {
      const inicio = customDe || '2000-01-01'
      const fim = customAte || ymdLocal(new Date())
      return { gran, inicio, fim, custom: true, label: `${fmtBr(inicio)} a ${fmtBr(fim)}` }
    }
    return janelaDoPeriodo(gran, offset)
  }, [gran, offset, customDe, customAte])

  // Janela das SÉRIES temporais: os últimos N períodos terminando na janela de
  // apuração — um gráfico com uma barra só não diria nada. Com intervalo
  // personalizado, a série é o próprio intervalo.
  const serie = useMemo(
    () => (janela.custom ? { inicio: janela.inicio, fim: janela.fim } : serieAte(gran, janela.fim)),
    [janela, gran],
  )
  const serieBuckets = useMemo(
    () => bucketsNoIntervalo(serie.inicio, serie.fim, gran),
    [serie, gran],
  )

  // O score vem da King apurado por MÊS (professor_score_historico), então a
  // visão semanal cai pro mês — é o grão mais fino que existe pra esse dado.
  const granScore: Granularidade = gran === 'semana' ? 'mes' : gran
  const serieScore = useMemo(
    () => (janela.custom ? { inicio: janela.inicio, fim: janela.fim } : serieAte(granScore, janela.fim)),
    [janela, granScore],
  )

  const filteredRows = useMemo(() => rows.filter(r =>
    (coordenacaoFiltro === TODAS || r.grupo_id === coordenacaoFiltro) &&
    (professorFiltro.trim() === '' || r.nome.toLowerCase().includes(professorFiltro.trim().toLowerCase())) &&
    (faixaFiltro === TODAS || (r.score_atual != null && bucketFor(r.score_atual)?.label === faixaFiltro))
  ), [rows, coordenacaoFiltro, professorFiltro, faixaFiltro])

  // professor_id → grupo_id de todos os professores ativos — usado para recortar
  // os incidentes por coordenação (a tabela de incidentes não guarda o grupo).
  const professorGrupo = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const r of rows) m.set(r.professor_id, r.grupo_id)
    return m
  }, [rows])

  // Cor categórica de um grupo (pela ordem em `grupos`), reusada em gráfico de
  // linha, tabela de coordenações e barras de reuniões.
  const corDoGrupo = (grupoId: string | null): string => {
    if (!grupoId) return 'var(--fg-subtle)'
    const i = grupos.findIndex(g => g.id === grupoId)
    return i >= 0 ? CORES_GRUPO[i % CORES_GRUPO.length] : 'var(--fg-subtle)'
  }

  // Reuniões realizadas por coordenação NA JANELA (do RPC datado, que permite
  // qualquer granularidade — inclusive semana). Respeita o filtro de coordenação.
  const reunioesPorCoord = useMemo(() => {
    const porGrupo = new Map<string, number>()
    let total = 0
    for (const r of reunioesDatadas) {
      if (r.data < janela.inicio || r.data > janela.fim) continue
      if (coordenacaoFiltro !== TODAS && r.grupo_id !== coordenacaoFiltro) continue
      const key = r.grupo_id ?? '__sem_grupo__'
      porGrupo.set(key, (porGrupo.get(key) ?? 0) + r.realizadas)
      total += r.realizadas
    }
    const linhas = [...porGrupo.entries()]
      .map(([key, realizadas]) => ({
        grupo_id: key === '__sem_grupo__' ? null : key,
        grupo_nome: key === '__sem_grupo__' ? 'Sem grupo' : (grupos.find(g => g.id === key)?.nome ?? '—'),
        realizadas,
      }))
      .sort((a, b) => b.realizadas - a.realizadas)
    return { linhas, total }
  }, [reunioesDatadas, janela, coordenacaoFiltro, grupos])

  // Reuniões da janela vs meta esperada (régua de tempo de casa), respeitando o
  // filtro de coordenação. Com um período passado selecionado, a meta é apurada
  // com o tempo de casa daquela época.
  const reunioesPeriodoVsMeta = useMemo(() => {
    const realizadas = reunioesPorCoord.total
    const profsDoFiltro = coordenacaoFiltro === TODAS
      ? metaProfs
      : metaProfs.filter(p => p.grupo_id === coordenacaoFiltro)
    const { meta, admissoes, profs2a3, profs4 } = metaReunioesPeriodo(profsDoFiltro, gran, janela)
    const pct = meta > 0 ? Math.min(100, Math.round((realizadas / meta) * 100)) : 0
    return { realizadas, meta, admissoes, profs2a3, profs4, pct, atingiu: meta > 0 && realizadas >= meta }
  }, [reunioesPorCoord.total, gran, janela, coordenacaoFiltro, metaProfs])

  // Movimento de professores (entradas/saídas) — recorte por coordenação; os
  // totais usam a janela, o gráfico usa a série de períodos.
  const movimentoDoGrupo = useMemo(
    () => movimento.filter(m => coordenacaoFiltro === TODAS || m.grupo_id === coordenacaoFiltro),
    [movimento, coordenacaoFiltro],
  )

  const movimentoPontos = useMemo(
    () => agruparMovimento(
      movimentoDoGrupo.filter(m => m.data >= serie.inicio && m.data <= serie.fim),
      gran, serieBuckets,
    ),
    [movimentoDoGrupo, gran, serie, serieBuckets],
  )

  const movimentoResumo = useMemo(() => {
    const naJanela = movimentoDoGrupo.filter(m => m.data >= janela.inicio && m.data <= janela.fim)
    const entradas = naJanela.filter(m => m.tipo === 'entrada').length
    const saidas   = naJanela.filter(m => m.tipo === 'saida').length
    return { entradas, saidas, saldo: entradas - saidas }
  }, [movimentoDoGrupo, janela])

  const scores = useMemo(
    () => filteredRows.map(r => r.score_atual).filter((s): s is number => s != null),
    [filteredRows],
  )

  const coordenacoes = useMemo(() => agregarPorCoordenacao(filteredRows), [filteredRows])

  const resumo = useMemo(() => ({
    coordenadoresAtivos: new Set(filteredRows.map(r => r.coordenador_nome).filter(Boolean)).size,
    professoresAtivos: filteredRows.length,
    scoreMedio: media(scores),
    totalGrupos: new Set(filteredRows.map(r => r.grupo_id).filter(Boolean)).size,
    semReuniaoRegistrada: filteredRows.filter(r => r.ultima_reuniao_realizada == null).length,
    semProximaAgendada: filteredRows.filter(r => r.proxima_reuniao_pendente == null).length,
  }), [filteredRows, scores])

  const coordenadoresNomes = useMemo(
    () => [...new Set(filteredRows.map(r => r.coordenador_nome).filter((n): n is string => !!n))],
    [filteredRows],
  )

  // Com uma coordenação selecionada, o gráfico de score mostra só ela + a escola.
  const gruposVisiveis = useMemo(
    () => (coordenacaoFiltro === TODAS ? grupos : grupos.filter(g => g.id === coordenacaoFiltro)),
    [grupos, coordenacaoFiltro],
  )

  // Série do score na granularidade escolhida: o histórico da King é mensal, então
  // um período maior (tri/semestre/ano) é a média dos meses que ele contém.
  const scoreSerie = useMemo(() => {
    const buckets = bucketsNoIntervalo(serieScore.inicio, serieScore.fim, granScore)
    const acc = new Map<string, Map<string, { soma: number; n: number }>>(
      buckets.map(b => [b.key, new Map()]),
    )
    for (const t of trend) {
      const dia = `${String(t.ano_mes).slice(0, 4)}-${String(t.ano_mes).slice(4, 6)}-01`
      if (dia < serieScore.inicio || dia > serieScore.fim) continue
      const porSerie = acc.get(bucketPeriodo(dia, granScore).key)
      if (!porSerie) continue
      const chave = t.grupo_id ?? '__escola__'
      const cel = porSerie.get(chave) ?? { soma: 0, n: 0 }
      cel.soma += Number(t.score_medio)
      cel.n++
      porSerie.set(chave, cel)
    }
    return buckets.map(b => {
      const porSerie = acc.get(b.key)!
      const val = (chave: string) => {
        const cel = porSerie.get(chave)
        return cel ? cel.soma / cel.n : null
      }
      const ponto: Record<string, number | string | null> = { periodo: b.label, escola: val('__escola__') }
      for (const g of gruposVisiveis) ponto[g.nome] = val(g.id)
      return ponto
    })
  }, [trend, serieScore, granScore, gruposVisiveis])

  // Trajetória do score da escola para o sparkline + delta do KPI.
  const escolaTrend = useMemo(
    () => scoreSerie.map(p => p.escola).filter((v): v is number => v != null),
    [scoreSerie],
  )
  const scoreDelta = escolaTrend.length >= 2
    ? Math.round(escolaTrend[escolaTrend.length - 1] - escolaTrend[escolaTrend.length - 2])
    : null

  const distribuicaoScore = useMemo(() => {
    const counts = new Map(SCORE_BUCKETS.map(b => [b.label, 0]))
    for (const s of scores) {
      const b = bucketFor(s)
      if (b) counts.set(b.label, (counts.get(b.label) ?? 0) + 1)
    }
    const total = scores.length
    return SCORE_BUCKETS.map(b => ({
      label: b.label,
      count: counts.get(b.label) ?? 0,
      pct: total ? ((counts.get(b.label) ?? 0) / total) * 100 : 0,
    }))
  }, [scores])
  const maxFaixa = Math.max(1, ...distribuicaoScore.map(b => b.count))

  const indicadores = useMemo(() => ({
    max: scores.length ? Math.max(...scores) : null,
    min: scores.length ? Math.min(...scores) : null,
    media: media(scores),
    mediana: mediana(scores),
    acima1200: scores.filter(s => s >= 1200).length,
    abaixo600: scores.filter(s => s < 600).length,
  }), [scores])

  const alertas = useMemo(() => {
    const list: { professor: ProfessorGeralRow; motivo: MotivoAlerta }[] = []
    for (const r of filteredRows) {
      for (const m of motivosAlerta(r)) list.push({ professor: r, motivo: m })
    }
    return list
  }, [filteredRows])

  const coordenacoesAbaixoMedia = useMemo(() => {
    const geral = resumo.scoreMedio ?? 0
    return coordenacoes.filter(c => c.scoreMedio != null && c.scoreMedio < geral)
  }, [coordenacoes, resumo.scoreMedio])

  // Tabela única de coordenações (funde a antiga "Distribuição" + "Ranking").
  const coordTable = useSortable(coordenacoes, 'scoreMedio')

  const maxReal = Math.max(1, ...reunioesPorCoord.linhas.map(l => l.realizadas))

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
  )

  return (
    <div className="px-6 py-7 max-w-[1320px] mx-auto">
      {/* ── Topbar: título ── */}
      <div className="mb-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_0_3px_var(--brand-red-soft)]" />
          Panorama da escola
        </div>
        <h1 className="mt-2 text-[30px] font-bold tracking-tight leading-[1.05] text-ink">Dashboard Geral</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Visão consolidada de <b className="font-semibold text-ink-secondary">{resumo.totalGrupos} {resumo.totalGrupos === 1 ? 'coordenação' : 'coordenações'}</b>
          {' · '}<b className="font-semibold text-ink-secondary tabular-nums">{resumo.professoresAtivos} professores ativos</b>
        </p>
      </div>

      {/* ── Filtro global: período + recortes (vale para a página inteira) ── */}
      <div className="mb-7 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-line-soft bg-surface-canvas px-3 py-2.5 shadow-card">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Período</span>

        <Select value={gran} onValueChange={v => { setGran(v as Granularidade); setOffset(0) }}>
          <SelectTrigger className="h-9 w-[124px] text-[12px] bg-surface-subtle/60 border-transparent text-ink">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface-canvas border-line text-ink">
            {GRANULARIDADES.map(g => (
              <SelectItem key={g} value={g} className="text-[12px]">{LABEL_GRANULARIDADE[g]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Navegação entre períodos — desligada com intervalo personalizado */}
        <div className={cn('flex items-center rounded-md bg-surface-subtle/60 h-9', janela.custom && 'opacity-40')}>
          <NavPeriodo dir="ant" onClick={() => setOffset(o => o - 1)} disabled={janela.custom} />
          <span className="px-2.5 text-[12px] font-medium text-ink whitespace-nowrap min-w-[150px] text-center">
            {janela.label}
          </span>
          <NavPeriodo dir="prox" onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={janela.custom || offset >= 0} />
        </div>

        {offset !== 0 && !janela.custom && (
          <button onClick={() => setOffset(0)}
            className="h-9 rounded-md px-2.5 text-[12px] font-medium text-accentBlue hover:bg-surface-subtle/60">
            Período atual
          </button>
        )}

        <div className="flex items-center gap-1.5 text-[12px] text-ink-muted"
          title="Intervalo personalizado — sobrepõe a grade de períodos e vale para a página inteira.">
          <CalendarRange className="h-3.5 w-3.5 text-ink-subtle" />
          <input type="date" value={customDe} onChange={e => setCustomDe(e.target.value)}
            className="h-9 rounded-md border border-line-soft bg-surface-subtle/60 px-2 text-[12px] text-ink" />
          <span className="text-ink-subtle">até</span>
          <input type="date" value={customAte} onChange={e => setCustomAte(e.target.value)}
            className="h-9 rounded-md border border-line-soft bg-surface-subtle/60 px-2 text-[12px] text-ink" />
          {janela.custom && (
            <button onClick={() => { setCustomDe(''); setCustomAte('') }} title="Voltar para a grade de períodos"
              className="grid h-6 w-6 place-items-center rounded-md text-ink-muted hover:bg-surface-subtle hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <span className="mx-1 hidden h-6 w-px bg-line-soft lg:block" />

        <Select value={coordenacaoFiltro} onValueChange={setCoordenacaoFiltro}>
          <SelectTrigger className="h-9 w-[168px] text-[12px] bg-surface-subtle/60 border-transparent text-ink">
            <SelectValue placeholder="Coordenação" />
          </SelectTrigger>
          <SelectContent className="bg-surface-canvas border-line text-ink">
            <SelectItem value={TODAS} className="text-[12px]">Todas as coordenações</SelectItem>
            {grupos.map(g => (
              <SelectItem key={g.id} value={g.id} className="text-[12px]">{g.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative w-44">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <Input
            placeholder="Buscar professor…"
            value={professorFiltro}
            onChange={e => setProfessorFiltro(e.target.value)}
            className="pl-9 h-9 bg-surface-subtle/60 border-transparent"
          />
        </div>

        <Select value={faixaFiltro} onValueChange={setFaixaFiltro}>
          <SelectTrigger className="h-9 w-[140px] text-[12px] bg-surface-subtle/60 border-transparent text-ink">
            <SelectValue placeholder="Faixa de score" />
          </SelectTrigger>
          <SelectContent className="bg-surface-canvas border-line text-ink">
            <SelectItem value={TODAS} className="text-[12px]">Todas as faixas</SelectItem>
            {SCORE_BUCKETS.map(b => (
              <SelectItem key={b.label} value={b.label} className="text-[12px]">{b.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Faixa-herói ── */}
      <div className="relative rounded-2xl overflow-hidden ring-1 ring-line-soft shadow-card mb-2.5">
        <span className="absolute left-0 top-0 z-10 h-full w-[3px] bg-brand" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-line-soft">
          <HeroKpi label="Professores ativos" value={resumo.professoresAtivos} hoje
            sub={`em ${resumo.totalGrupos} ${resumo.totalGrupos === 1 ? 'grupo' : 'grupos'}`} />
          <div className="bg-surface-canvas px-5 py-5 sm:px-6">
            <p className="text-[11.5px] font-medium text-ink-muted mb-3 flex items-center gap-1.5">
              Score médio da escola <TagHoje />
            </p>
            <div className="flex items-end gap-2">
              <p className="text-[34px] font-semibold tracking-tight leading-none tabular-nums text-ink">
                {resumo.scoreMedio != null ? Math.round(resumo.scoreMedio) : '—'}
              </p>
              {scoreDelta != null && scoreDelta !== 0 && (
                <span className={cn('inline-flex items-center gap-0.5 text-[11.5px] font-semibold mb-1',
                  scoreDelta > 0 ? 'text-urg-lowFg' : 'text-urg-highFg')}>
                  {scoreDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {scoreDelta > 0 ? '+' : ''}{scoreDelta}
                </span>
              )}
            </div>
            <Sparkline data={escolaTrend} />
          </div>
          <HeroKpi label="Reuniões no período" value={reunioesPorCoord.total} sub={janela.label} />
          <HeroKpi label="Coordenadores ativos" value={resumo.coordenadoresAtivos} hoje
            sub={coordenadoresNomes.slice(0, 3).join(' · ') + (coordenadoresNomes.length > 3 ? ' …' : '')} />
          <HeroKpi label="Sem reunião registrada" value={resumo.semReuniaoRegistrada} hoje
            warn={resumo.semReuniaoRegistrada > 0}
            sub={resumo.professoresAtivos ? `${pct1(resumo.semReuniaoRegistrada / resumo.professoresAtivos * 100)}% dos professores` : undefined} />
          <HeroKpi label="Sem próxima agendada" value={resumo.semProximaAgendada} hoje
            warn={resumo.semProximaAgendada > 0} sub="exige acompanhamento" />
        </div>
      </div>

      <p className="mb-11 text-[11px] text-ink-subtle">
        Tudo nesta página respeita o período selecionado. Os cartões marcados com
        <span className="mx-1 inline-flex items-center rounded-[4px] bg-surface-muted px-1 py-px text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-muted">hoje</span>
        são o retrato do cadastro atual — score, roster e agenda vêm do King sem histórico diário.
      </p>

      {/* ══ ZONA: SCORE & DESEMPENHO ══ */}
      <section className="mb-11 space-y-4">
        <Zone label="Score & desempenho" meta={`evolução por ${PERIODO_NOME[granScore]} · distribuição de hoje`} />

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Evolução */}
          <div className="lg:col-span-2 card-surface p-5 space-y-4">
            <SectionHead
              title="Evolução do score médio"
              hint={gran === 'semana'
                ? 'escola e por coordenação · o King apura o score por mês, então a visão semanal cai pro mês'
                : `escola e por coordenação · média por ${PERIODO_NOME[granScore]}`}
            />
            <ResponsiveContainer width="100%" height={264}>
              <LineChart data={scoreSerie} margin={{ left: -8, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} domain={['auto', 'auto']} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="escola" stroke="var(--accent-blue)" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                {gruposVisiveis.map(g => (
                  <Line key={g.id} type="monotone" dataKey={g.nome} stroke={corDoGrupo(g.id)} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Distribuição por faixa */}
          <div className="card-surface p-5 space-y-4">
            <SectionHead title="Distribuição por faixa" hint="score atual dos professores" />
            <div className="flex flex-col gap-2.5 pt-1">
              {[...distribuicaoScore].reverse().map((b) => {
                const i = SCORE_BUCKETS.findIndex(x => x.label === b.label)
                return (
                  <div key={b.label} className="grid grid-cols-[72px_1fr_34px] items-center gap-2.5 text-[12px]" title={`${b.pct.toFixed(1)}%`}>
                    <span className="text-ink-secondary tabular-nums">{b.label}</span>
                    <div className="h-2 rounded-full bg-surface-subtle overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(b.count / maxFaixa) * 100}%`, background: CORES_FAIXA[i] }} />
                    </div>
                    <span className="text-right tabular-nums text-ink-muted text-[11.5px]">{b.count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Indicadores */}
        <Metrics items={[
          { label: 'Maior score', value: indicadores.max ?? '—' },
          { label: 'Menor score', value: indicadores.min ?? '—' },
          { label: 'Score médio', value: indicadores.media != null ? Math.round(indicadores.media) : '—' },
          { label: 'Mediana', value: indicadores.mediana != null ? Math.round(indicadores.mediana) : '—' },
          { label: 'Acima de 1200', value: indicadores.acima1200 },
          { label: 'Abaixo de 600', value: indicadores.abaixo600 },
        ]} />

        {/* Tabela de coordenações (distribuição + ranking unificados) */}
        <div className="card-surface overflow-hidden">
          <div className="px-5 pt-4 pb-1">
            <SectionHead title="Coordenações" hint="Score e faixas de hoje; a última reunião é a mais recente registrada. Clique numa linha para ver os professores do grupo." />
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line">
                <th className="w-8" />
                <SortHeader label="Coordenação" sortKey="grupo_nome" active={coordTable.key} dir={coordTable.dir} onClick={coordTable.toggle} />
                <SortHeader label="Professores" sortKey="professores" active={coordTable.key} dir={coordTable.dir} onClick={coordTable.toggle} />
                <SortHeader label="Score médio" sortKey="scoreMedio" active={coordTable.key} dir={coordTable.dir} onClick={coordTable.toggle} />
                <SortHeader label="% ≥ 1200" sortKey="pctAcima1200" active={coordTable.key} dir={coordTable.dir} onClick={coordTable.toggle} />
                <SortHeader label="% < 600" sortKey="pctAbaixo600" active={coordTable.key} dir={coordTable.dir} onClick={coordTable.toggle} />
                <SortHeader label="Última reunião" sortKey="ultimaReuniaoRealizada" active={coordTable.key} dir={coordTable.dir} onClick={coordTable.toggle} />
              </tr>
            </thead>
            <tbody>
              {coordTable.sorted.map(c => {
                const chave = c.grupo_id ?? '__sem_grupo__'
                const aberto = expandido.has(chave)
                const professoresDoGrupo = filteredRows.filter(r => (r.grupo_id ?? '__sem_grupo__') === chave)
                return (
                  <Fragment key={chave}>
                    <tr
                      onClick={() => setExpandido(prev => {
                        const next = new Set(prev)
                        if (next.has(chave)) next.delete(chave)
                        else next.add(chave)
                        return next
                      })}
                      className="border-b border-line-soft last:border-0 cursor-pointer hover:bg-surface-subtle/60 transition-colors"
                    >
                      <td className="pl-5 py-2.5 text-ink-subtle">{aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                      <td className="px-3 py-2.5 font-medium text-ink">
                        <span className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-[3px] flex-none" style={{ background: corDoGrupo(c.grupo_id) }} />
                          {c.grupo_nome}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{c.professores}</td>
                      <td className="px-3 py-2.5 tabular-nums font-medium">{c.scoreMedio != null ? Math.round(c.scoreMedio) : '—'}</td>
                      <td className="px-3 py-2.5 tabular-nums text-ink-secondary">{c.pctAcima1200.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 tabular-nums text-ink-secondary">{c.pctAbaixo600.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-ink-muted tabular-nums">
                        {c.ultimaReuniaoRealizada ? new Date(c.ultimaReuniaoRealizada).toLocaleDateString('pt-BR') : '—'}
                      </td>
                    </tr>
                    {aberto && (
                      <tr>
                        <td colSpan={7} className="bg-surface-subtle/50 px-5 py-3">
                          <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-[12px] text-ink-secondary">
                            {professoresDoGrupo.map(p => (
                              <li key={p.professor_id} className="flex items-center justify-between gap-2 py-0.5">
                                <span className="truncate">{p.nome}</span>
                                <span className="tabular-nums text-ink-muted">{p.score_atual ?? '—'}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ══ ZONA: REUNIÕES ══ */}
      <section className="mb-11 space-y-4">
        <Zone label="Reuniões" meta={janela.label} />
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Meta do período selecionado */}
          <div className="card-surface p-5 space-y-4">
            <SectionHead
              title={janela.custom ? 'Meta do intervalo' : TITULO_META[gran]}
              hint={janela.custom ? `${fmtBr(janela.inicio)} a ${fmtBr(janela.fim)}` : janela.label}
            />
            <div className="flex items-center gap-5">
              <Ring pct={reunioesPeriodoVsMeta.pct} color={reunioesPeriodoVsMeta.atingiu ? 'var(--urg-low-fg)' : 'var(--accent-blue)'} />
              <div className="flex-1 text-[12px] text-ink-secondary space-y-2">
                <MetaLinha label="Realizadas" value={reunioesPeriodoVsMeta.realizadas} strong={reunioesPeriodoVsMeta.atingiu} />
                <MetaLinha label="Meta esperada" value={reunioesPeriodoVsMeta.meta} />
                <MetaLinha label={janela.custom ? 'Admissões no intervalo' : ADMISSOES_LABEL[gran]} value={reunioesPeriodoVsMeta.admissoes} />
                <MetaLinha label="Professores 2–3 meses" value={reunioesPeriodoVsMeta.profs2a3} />
                <MetaLinha label="Professores 4+ meses" value={reunioesPeriodoVsMeta.profs4} last />
              </div>
            </div>
            <p className="text-[10.5px] text-ink-subtle leading-relaxed">
              Meta = admissões do período + professores de 2–3 meses (cadência mensal)
              + {NOTA_MULT_4[gran]} dos de 4+ meses (cadência trimestral)
              {coordenacaoFiltro === TODAS ? ', somando todas as coordenações.' : ', na coordenação selecionada.'}
              {' '}As faixas de tempo de casa são medidas no fim do período.
            </p>
          </div>

          {/* Reuniões por coordenação */}
          <div className="lg:col-span-2 card-surface p-5 space-y-4">
            <SectionHead
              title="Reuniões realizadas por coordenação"
              hint={janela.label}
              right={<span className="inline-flex items-center rounded-full bg-surface-subtle px-2.5 py-0.5 text-[11px] font-semibold text-ink-secondary tabular-nums">{reunioesPorCoord.total} no total</span>}
            />
            {reunioesPorCoord.linhas.length === 0 ? (
              <p className="text-[13px] text-ink-muted py-6 text-center">Nenhuma reunião realizada no período selecionado.</p>
            ) : (
              <div className="flex flex-col gap-3.5 pt-1">
                {reunioesPorCoord.linhas.map(l => {
                  const pctTotal = reunioesPorCoord.total ? (l.realizadas / reunioesPorCoord.total) * 100 : 0
                  return (
                    <div key={l.grupo_id ?? '__sem_grupo__'}>
                      <div className="flex items-baseline justify-between text-[12.5px] mb-1.5">
                        <span className="text-ink">{l.grupo_nome}</span>
                        <span className="text-ink-muted"><b className="font-semibold text-ink tabular-nums">{l.realizadas}</b> · {pctTotal.toFixed(1)}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-surface-subtle overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(l.realizadas / maxReal) * 100}%`, background: corDoGrupo(l.grupo_id) }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══ ZONA: INCIDENTES & INFORMES ══ */}
      <section className="mb-11 space-y-4">
        <Zone label="Incidentes & informes" meta={janela.label} />
        <IncidentesDashboardSection
          grupoId={coordenacaoFiltro === TODAS ? null : coordenacaoFiltro}
          professorGrupo={professorGrupo}
          janela={janela}
          serie={serie}
          serieBuckets={serieBuckets}
        />
      </section>

      {/* ══ ZONA: TURNOVER ══ */}
      <section className="mb-11 space-y-4">
        <Zone label="Turnover" meta={`professor e aluno · ${janela.label}`} />
        <TurnoverDashboardSection
          grupoId={coordenacaoFiltro === TODAS ? null : coordenacaoFiltro}
          janela={janela}
        />
      </section>

      {/* ══ ZONA: MOVIMENTO & ALERTAS ══ */}
      <section className="space-y-4">
        <Zone label="Movimento & alertas" />
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Movimento */}
          <div className="lg:col-span-2 card-surface p-5 space-y-4">
            <SectionHead
              title="Movimento de professores"
              hint={`totais de ${janela.label.toLowerCase()}`}
            />
            <div className="grid grid-cols-3 gap-px rounded-xl bg-line-soft ring-1 ring-line-soft overflow-hidden">
              <MiniStat label="Entradas" value={movimentoResumo.entradas} dot="#22c55e" />
              <MiniStat label="Saídas" value={movimentoResumo.saidas} dot="#ef4444" warn={movimentoResumo.saidas > 0} />
              <MiniStat label="Saldo" value={movimentoResumo.saldo > 0 ? `+${movimentoResumo.saldo}` : String(movimentoResumo.saldo)} />
            </div>
            {movimentoPontos.every(p => p.entradas === 0 && p.saidas === 0) ? (
              <p className="text-[13px] text-ink-muted py-6 text-center">Sem entradas ou saídas no período selecionado.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={movimentoPontos} margin={{ left: -12, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--bg-subtle)', opacity: 0.5 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="entradas" name="Entradas" fill="#22c55e" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="saidas" name="Saídas" fill="#ef4444" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-[10.5px] text-ink-subtle">
              Entradas e saídas com as datas reais da King — as mesmas que alimentam o turnover
              acima. Os três números são do período selecionado; o gráfico mostra
              {' '}{movimentoPontos.length} {movimentoPontos.length === 1 ? 'período' : `períodos (por ${PERIODO_NOME[gran]})`} até ele.
            </p>
          </div>

          {/* Alertas */}
          <div className="card-surface p-5 space-y-4">
            <SectionHead
              title="Alertas inteligentes"
              hint="situação de hoje, independe do período"
              right={<span className="inline-flex items-center rounded-full bg-surface-subtle px-2.5 py-0.5 text-[11px] font-semibold text-ink-secondary tabular-nums">{alertas.length}</span>}
            />
            {coordenacoesAbaixoMedia.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {coordenacoesAbaixoMedia.map(c => (
                  <span key={c.grupo_id ?? '__sem_grupo__'} className="inline-flex items-center gap-1.5 rounded-full bg-urg-medBg text-urg-medFg px-2.5 py-1 text-[11px] font-medium">
                    <AlertTriangle className="h-3 w-3" />{c.grupo_nome} abaixo da média
                  </span>
                ))}
              </div>
            )}
            {alertas.length === 0 ? (
              <p className="text-[13px] text-ink-muted py-6 text-center">Nenhum alerta no momento.</p>
            ) : (
              <ul className="divide-y divide-line-soft -mt-1 max-h-[360px] overflow-y-auto">
                {alertas.slice(0, 200).map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2.5 text-[13px]">
                    <span className="text-ink truncate">{a.professor.nome}</span>
                    <span className={cn('inline-flex flex-none items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold', ALERTA_CHIP[a.motivo])}>
                      {LABEL_ALERTA[a.motivo]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── Navegação entre períodos ────────────────────────────────────────────────

function NavPeriodo({ dir, onClick, disabled }: { dir: 'ant' | 'prox'; onClick: () => void; disabled?: boolean }) {
  const Icone = dir === 'ant' ? ChevronLeft : ChevronRight
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'ant' ? 'Período anterior' : 'Próximo período'}
      title={dir === 'ant' ? 'Período anterior' : 'Próximo período'}
      className="grid h-9 w-8 place-items-center rounded-md text-ink-muted enabled:hover:bg-surface-subtle enabled:hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <Icone className="h-4 w-4" />
    </button>
  )
}

// ─── Faixa-herói: KPI grande ─────────────────────────────────────────────────

/** Marca os números que são retrato do cadastro atual, não do período escolhido. */
function TagHoje() {
  return (
    <span
      title="Dado de hoje — o King não guarda histórico diário de score, roster e agenda."
      className="inline-flex items-center rounded-[4px] bg-surface-muted px-1 py-px text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
    >
      hoje
    </span>
  )
}

function HeroKpi({ label, value, sub, warn, hoje }: { label: string; value: ReactNode; sub?: string; warn?: boolean; hoje?: boolean }) {
  return (
    <div className="bg-surface-canvas px-5 py-5 sm:px-6">
      <p className="text-[11.5px] font-medium text-ink-muted mb-3 flex items-center gap-1.5">
        <span className="truncate" title={label}>{label}</span>{hoje && <TagHoje />}
      </p>
      <p className={cn('text-[34px] font-semibold tracking-tight leading-none tabular-nums', warn ? 'text-urg-highFg' : 'text-ink')}>{value}</p>
      {sub && <p className="mt-2.5 text-[11.5px] text-ink-subtle truncate" title={sub}>{sub}</p>}
    </div>
  )
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <div className="h-6 mt-2.5" />
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${22 - ((v - min) / range) * 20}`).join(' ')
  return (
    <svg className="block mt-2.5 w-full h-6 overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--accent-blue)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ─── Anel de progresso (meta) ────────────────────────────────────────────────

function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 50, c = 2 * Math.PI * r
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100)
  return (
    <div className="relative h-[112px] w-[112px] shrink-0">
      <svg width="112" height="112" viewBox="0 0 118 118">
        <circle cx="59" cy="59" r={r} fill="none" stroke="var(--bg-muted)" strokeWidth="11" />
        <circle cx="59" cy="59" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 59 59)"
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.32,.72,0,1)' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <span className="block text-[26px] font-semibold tracking-tight tabular-nums leading-none text-ink">{pct}%</span>
          <span className="text-[10.5px] text-ink-muted">da meta</span>
        </div>
      </div>
    </div>
  )
}

function MetaLinha({ label, value, strong, last }: { label: string; value: number; strong?: boolean; last?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', !last && 'border-b border-dashed border-line-soft pb-2')}>
      <span>{label}</span>
      <span className={cn('tabular-nums', strong ? 'font-semibold text-urg-lowFg' : 'text-ink')}>{value}</span>
    </div>
  )
}

// ─── Cabeçalho de seção / card ───────────────────────────────────────────────

function SectionHead({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="space-y-0.5">
        <h2 className="text-[14px] font-semibold tracking-tight text-ink">{title}</h2>
        {hint && <p className="text-[11.5px] text-ink-muted">{hint}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

// ─── Rótulo de zona (overline + filete) ──────────────────────────────────────

function Zone({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted whitespace-nowrap">{label}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
      {meta && <span className="text-[11.5px] text-ink-subtle whitespace-nowrap">{meta}</span>}
    </div>
  )
}

// ─── Faixa de métricas (sem card-in-card) ────────────────────────────────────

interface Metric { label: string; value: ReactNode; tone?: 'warn' }

function Metrics({ items, cols = 6 }: { items: Metric[]; cols?: 3 | 6 }) {
  return (
    <div className={cn(
      'grid grid-cols-2 sm:grid-cols-3 gap-px rounded-xl bg-line-soft ring-1 ring-line-soft overflow-hidden',
      cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-6',
    )}>
      {items.map((m, i) => (
        <div key={i} className="bg-surface-canvas px-4 py-3.5 space-y-1.5">
          <p className="text-[11px] text-ink-muted truncate" title={m.label}>{m.label}</p>
          <p className={cn('text-[22px] font-semibold tabular-nums leading-none', m.tone === 'warn' ? 'text-urg-highFg' : 'text-ink')}>{m.value}</p>
        </div>
      ))}
    </div>
  )
}

// Métrica compacta com marcador de cor (usada no bloco de movimento).
function MiniStat({ label, value, dot, warn }: { label: string; value: ReactNode; dot?: string; warn?: boolean }) {
  return (
    <div className="bg-surface-canvas px-4 py-3 space-y-1.5">
      <p className="text-[11px] text-ink-muted flex items-center gap-1.5">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}{label}
      </p>
      <p className={cn('text-[20px] font-semibold tabular-nums leading-none', warn ? 'text-urg-highFg' : 'text-ink')}>{value}</p>
    </div>
  )
}

const TOOLTIP_STYLE = {
  background: 'var(--bg-canvas)',
  border: '1px solid var(--border-default)',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 12px 32px -8px rgba(0,0,0,0.14)',
} as const
