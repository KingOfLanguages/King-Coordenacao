import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Search, CalendarRange, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
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
  useDashboardGeralReunioes, useDashboardGeralMovimento, useDashboardGeralMetaProfessores,
  SCORE_BUCKETS, bucketFor, media, mediana, motivosAlerta, agregarPorCoordenacao,
  agruparMovimento, metaReunioesMensal, LABEL_ALERTA, LABEL_GRANULARIDADE,
  type ProfessorGeralRow, type CoordenacaoStats, type MotivoAlerta, type Granularidade,
} from '@/hooks/useDashboardGeral'
import { IncidentesDashboardSection } from './IncidentesDashboardSection'
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
  const { data: reunioesPeriodo = [] } = useDashboardGeralReunioes()
  const { data: movimento = [] } = useDashboardGeralMovimento()
  const { data: metaProfs = [] } = useDashboardGeralMetaProfessores()
  const { data: grupos = [] } = useGrupos()

  const [coordenacaoFiltro, setCoordenacaoFiltro] = useState(TODAS)
  const [professorFiltro, setProfessorFiltro] = useState('')
  const [faixaFiltro, setFaixaFiltro] = useState(TODAS)
  const [dataInicial, setDataInicial] = useState('')
  const [dataFinal, setDataFinal] = useState('')
  const [granMovimento, setGranMovimento] = useState<Granularidade>('mes')
  const [expandido, setExpandido] = useState<Set<string>>(new Set())

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

  const trendFiltrado = useMemo(() => {
    const from = dataInicial ? Number(dataInicial.slice(0, 7).replace('-', '')) : null
    const to   = dataFinal   ? Number(dataFinal.slice(0, 7).replace('-', ''))   : null
    return trend.filter(t => (from == null || t.ano_mes >= from) && (to == null || t.ano_mes <= to))
  }, [trend, dataInicial, dataFinal])

  // Reuniões realizadas por coordenação (respeita filtro de coordenação + intervalo de datas)
  const reunioesPorCoord = useMemo(() => {
    const from = dataInicial ? Number(dataInicial.slice(0, 7).replace('-', '')) : null
    const to   = dataFinal   ? Number(dataFinal.slice(0, 7).replace('-', ''))   : null
    const porGrupo = new Map<string, number>()
    let total = 0
    for (const r of reunioesPeriodo) {
      if (from != null && r.ano_mes < from) continue
      if (to != null && r.ano_mes > to) continue
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
  }, [reunioesPeriodo, dataInicial, dataFinal, coordenacaoFiltro, grupos])

  // Reuniões do mês vigente vs meta esperada (régua de tempo de casa).
  // Sempre o mês corrente (ignora o intervalo de datas); respeita o filtro de coordenação.
  const reunioesMesVsMeta = useMemo(() => {
    const now = new Date()
    const anoMesAtual = now.getFullYear() * 100 + (now.getMonth() + 1)
    let realizadas = 0
    for (const r of reunioesPeriodo) {
      if (r.ano_mes !== anoMesAtual) continue
      if (coordenacaoFiltro !== TODAS && r.grupo_id !== coordenacaoFiltro) continue
      realizadas += r.realizadas
    }
    const profsDoFiltro = coordenacaoFiltro === TODAS
      ? metaProfs
      : metaProfs.filter(p => p.grupo_id === coordenacaoFiltro)
    const { meta, admissoesMes, profs2a3, profs4 } = metaReunioesMensal(profsDoFiltro)
    const pct = meta > 0 ? Math.min(100, Math.round((realizadas / meta) * 100)) : 0
    return { realizadas, meta, admissoesMes, profs2a3, profs4, pct, atingiu: meta > 0 && realizadas >= meta }
  }, [reunioesPeriodo, coordenacaoFiltro, metaProfs])

  // Movimento de professores (entradas/saídas) — respeita filtro de coordenação + datas
  const movimentoFiltrado = useMemo(() => movimento.filter(m =>
    (coordenacaoFiltro === TODAS || m.grupo_id === coordenacaoFiltro) &&
    (!dataInicial || m.data >= dataInicial) &&
    (!dataFinal || m.data <= dataFinal)
  ), [movimento, coordenacaoFiltro, dataInicial, dataFinal])

  const movimentoPontos = useMemo(
    () => agruparMovimento(movimentoFiltrado, granMovimento),
    [movimentoFiltrado, granMovimento],
  )

  const movimentoResumo = useMemo(() => {
    const entradas = movimentoFiltrado.filter(m => m.tipo === 'entrada').length
    const saidas   = movimentoFiltrado.filter(m => m.tipo === 'saida').length
    return { entradas, saidas, saldo: entradas - saidas }
  }, [movimentoFiltrado])

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

  // Trajetória do score da escola (grupo_id null) para o sparkline + delta do KPI.
  const escolaTrend = useMemo(
    () => trend.filter(t => t.grupo_id === null).sort((a, b) => a.ano_mes - b.ano_mes).map(t => t.score_medio),
    [trend],
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

  const trendChartData = useMemo(() => {
    const mesesSet = new Set(trendFiltrado.map(t => t.ano_mes))
    const meses = [...mesesSet].sort()
    return meses.map(ano_mes => {
      const ponto: Record<string, number | string | null> = { ano_mes: `${String(ano_mes).slice(4)}/${String(ano_mes).slice(2, 4)}` }
      ponto.escola = trendFiltrado.find(t => t.grupo_id === null && t.ano_mes === ano_mes)?.score_medio ?? null
      for (const g of grupos) {
        ponto[g.nome] = trendFiltrado.find(t => t.grupo_id === g.id && t.ano_mes === ano_mes)?.score_medio ?? null
      }
      return ponto
    })
  }, [trendFiltrado, grupos])

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
  )

  return (
    <div className="px-6 py-7 max-w-[1320px] mx-auto">
      {/* ── Topbar: título + resumo + filtros ── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-7">
        <div>
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

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line-soft bg-surface-canvas px-2.5 py-2 shadow-card">
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

          <div className="relative w-48">
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

          <div className="flex items-center gap-1.5 text-[12px] text-ink-muted" title="O período afeta os gráficos de score, reuniões, movimento e incidentes.">
            <CalendarRange className="h-3.5 w-3.5 text-ink-subtle" />
            <input type="date" value={dataInicial} onChange={e => setDataInicial(e.target.value)}
              className="h-9 rounded-md border border-line-soft bg-surface-subtle/60 px-2 text-[12px] text-ink" />
            <span className="text-ink-subtle">até</span>
            <input type="date" value={dataFinal} onChange={e => setDataFinal(e.target.value)}
              className="h-9 rounded-md border border-line-soft bg-surface-subtle/60 px-2 text-[12px] text-ink" />
          </div>
        </div>
      </div>

      {/* ── Faixa-herói ── */}
      <div className="relative rounded-2xl overflow-hidden ring-1 ring-line-soft shadow-card mb-11">
        <span className="absolute left-0 top-0 z-10 h-full w-[3px] bg-brand" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-line-soft">
          <HeroKpi label="Professores ativos" value={resumo.professoresAtivos}
            sub={`em ${resumo.totalGrupos} ${resumo.totalGrupos === 1 ? 'grupo' : 'grupos'}`} />
          <div className="bg-surface-canvas px-5 py-5 sm:px-6">
            <p className="text-[11.5px] font-medium text-ink-muted mb-3">Score médio da escola</p>
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
          <HeroKpi label="Coordenadores ativos" value={resumo.coordenadoresAtivos}
            sub={coordenadoresNomes.slice(0, 3).join(' · ') + (coordenadoresNomes.length > 3 ? ' …' : '')} />
          <HeroKpi label="Sem reunião registrada" value={resumo.semReuniaoRegistrada}
            warn={resumo.semReuniaoRegistrada > 0}
            sub={resumo.professoresAtivos ? `${pct1(resumo.semReuniaoRegistrada / resumo.professoresAtivos * 100)}% dos professores` : undefined} />
          <HeroKpi label="Sem próxima agendada" value={resumo.semProximaAgendada}
            warn={resumo.semProximaAgendada > 0} sub="exige acompanhamento" />
        </div>
      </div>

      {/* ══ ZONA: SCORE & DESEMPENHO ══ */}
      <section className="mb-11 space-y-4">
        <Zone label="Score & desempenho" meta="evolução e distribuição" />

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Evolução */}
          <div className="lg:col-span-2 card-surface p-5 space-y-4">
            <SectionHead title="Evolução do score médio" hint="escola e por coordenação" />
            <ResponsiveContainer width="100%" height={264}>
              <LineChart data={trendChartData} margin={{ left: -8, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="ano_mes" tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} domain={['auto', 'auto']} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="escola" stroke="var(--accent-blue)" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                {grupos.map(g => (
                  <Line key={g.id} type="monotone" dataKey={g.nome} stroke={corDoGrupo(g.id)} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Distribuição por faixa */}
          <div className="card-surface p-5 space-y-4">
            <SectionHead title="Distribuição por faixa" />
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
            <SectionHead title="Coordenações" hint="Clique numa linha para ver os professores do grupo." />
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
        <Zone label="Reuniões" meta="mês vigente" />
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Meta do mês */}
          <div className="card-surface p-5 space-y-4">
            <SectionHead title="Meta do mês" />
            <div className="flex items-center gap-5">
              <Ring pct={reunioesMesVsMeta.pct} color={reunioesMesVsMeta.atingiu ? 'var(--urg-low-fg)' : 'var(--accent-blue)'} />
              <div className="flex-1 text-[12px] text-ink-secondary space-y-2">
                <MetaLinha label="Realizadas" value={reunioesMesVsMeta.realizadas} strong={reunioesMesVsMeta.atingiu} />
                <MetaLinha label="Meta esperada" value={reunioesMesVsMeta.meta} />
                <MetaLinha label="Admissões do mês" value={reunioesMesVsMeta.admissoesMes} />
                <MetaLinha label="Professores 2–3 meses" value={reunioesMesVsMeta.profs2a3} last />
              </div>
            </div>
            <p className="text-[10.5px] text-ink-subtle leading-relaxed">
              Meta = admissões do mês + professores de 2–3 meses + 33,3% dos de 4+ meses
              {coordenacaoFiltro === TODAS ? ', somando todas as coordenações.' : ', na coordenação selecionada.'}
            </p>
          </div>

          {/* Reuniões por coordenação */}
          <div className="lg:col-span-2 card-surface p-5 space-y-4">
            <SectionHead
              title="Reuniões realizadas por coordenação"
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
        <Zone label="Incidentes & informes" />
        <IncidentesDashboardSection
          grupoId={coordenacaoFiltro === TODAS ? null : coordenacaoFiltro}
          professorGrupo={professorGrupo}
          dataInicial={dataInicial}
          dataFinal={dataFinal}
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
              right={
                <Select value={granMovimento} onValueChange={v => setGranMovimento(v as Granularidade)}>
                  <SelectTrigger className="h-8 w-[130px] text-[12px] bg-surface-subtle/60 border-transparent text-ink">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-canvas border-line text-ink">
                    {(['semana', 'mes', 'trimestre', 'ano'] as Granularidade[]).map(g => (
                      <SelectItem key={g} value={g} className="text-[12px]">{LABEL_GRANULARIDADE[g]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <div className="grid grid-cols-3 gap-px rounded-xl bg-line-soft ring-1 ring-line-soft overflow-hidden">
              <MiniStat label="Entradas" value={movimentoResumo.entradas} dot="#22c55e" />
              <MiniStat label="Saídas" value={movimentoResumo.saidas} dot="#ef4444" warn={movimentoResumo.saidas > 0} />
              <MiniStat label="Saldo" value={movimentoResumo.saldo > 0 ? `+${movimentoResumo.saldo}` : String(movimentoResumo.saldo)} />
            </div>
            {movimentoPontos.length === 0 ? (
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
              Saídas passaram a ser datadas em 2026-07-10; desligamentos anteriores não aparecem na série temporal.
            </p>
          </div>

          {/* Alertas */}
          <div className="card-surface p-5 space-y-4">
            <SectionHead
              title="Alertas inteligentes"
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

// ─── Faixa-herói: KPI grande ─────────────────────────────────────────────────

function HeroKpi({ label, value, sub, warn }: { label: string; value: ReactNode; sub?: string; warn?: boolean }) {
  return (
    <div className="bg-surface-canvas px-5 py-5 sm:px-6">
      <p className="text-[11.5px] font-medium text-ink-muted mb-3">{label}</p>
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
