import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useGrupos } from '@/hooks/useGrupos'
import {
  useDashboardGeralProfessores, useDashboardGeralScoreTrend,
  useDashboardGeralReunioes, useDashboardGeralMovimento,
  SCORE_BUCKETS, bucketFor, media, mediana, motivosAlerta, agregarPorCoordenacao,
  agruparMovimento, LABEL_ALERTA, LABEL_GRANULARIDADE,
  type ProfessorGeralRow, type CoordenacaoStats, type MotivoAlerta, type Granularidade,
} from '@/hooks/useDashboardGeral'
import { cn } from '@/lib/utils'

const CORES_FAIXA = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#16a34a']
const TODAS = 'todas'

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
  label, sortKey, active, dir, onClick,
}: { label: string; sortKey: SortKey; active: SortKey; dir: 'asc' | 'desc'; onClick: (k: SortKey) => void }) {
  return (
    <th
      onClick={() => onClick(sortKey)}
      className="px-3 py-2 text-left font-medium cursor-pointer select-none hover:text-ink"
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

  const distribuicaoTable = useSortable(coordenacoes, 'professores')
  const rankingTable = useSortable(coordenacoes, 'scoreMedio')

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
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="space-y-0.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Dashboard Geral</h1>
        <p className="text-[13px] text-ink-muted">Visão consolidada de todas as coordenações.</p>
      </header>

      {/* ── 7. Filtros ── */}
      <section className="card-surface p-4 flex flex-wrap items-center gap-2">
        <Select value={coordenacaoFiltro} onValueChange={setCoordenacaoFiltro}>
          <SelectTrigger className="h-9 w-[160px] text-[12px] bg-surface-canvas border-line text-ink">
            <SelectValue placeholder="Coordenação" />
          </SelectTrigger>
          <SelectContent className="bg-surface-canvas border-line text-ink">
            <SelectItem value={TODAS} className="text-[12px]">Todas as coordenações</SelectItem>
            {grupos.map(g => (
              <SelectItem key={g.id} value={g.id} className="text-[12px]">{g.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <Input
            placeholder="Buscar professor…"
            value={professorFiltro}
            onChange={e => setProfessorFiltro(e.target.value)}
            className="pl-9 h-9 bg-surface-canvas border-line"
          />
        </div>

        <Select value={faixaFiltro} onValueChange={setFaixaFiltro}>
          <SelectTrigger className="h-9 w-[150px] text-[12px] bg-surface-canvas border-line text-ink">
            <SelectValue placeholder="Faixa de score" />
          </SelectTrigger>
          <SelectContent className="bg-surface-canvas border-line text-ink">
            <SelectItem value={TODAS} className="text-[12px]">Todas as faixas</SelectItem>
            {SCORE_BUCKETS.map(b => (
              <SelectItem key={b.label} value={b.label} className="text-[12px]">{b.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <input type="date" value={dataInicial} onChange={e => setDataInicial(e.target.value)}
            className="h-9 rounded-md border border-line bg-surface-canvas px-2 text-[12px] text-ink" />
          <span>até</span>
          <input type="date" value={dataFinal} onChange={e => setDataFinal(e.target.value)}
            className="h-9 rounded-md border border-line bg-surface-canvas px-2 text-[12px] text-ink" />
        </div>
        <span className="text-[11px] text-ink-subtle">(as datas afetam os gráficos de score, reuniões e movimento)</span>
      </section>

      {/* ── 1. Resumo geral ── */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Coordenadores ativos" value={resumo.coordenadoresAtivos} />
        <StatCard label="Professores ativos" value={resumo.professoresAtivos} />
        <StatCard label="Score médio da escola" value={resumo.scoreMedio != null ? Math.round(resumo.scoreMedio) : '—'} />
        <StatCard label="Grupos de coordenação" value={resumo.totalGrupos} />
        <StatCard label="Sem reunião registrada" value={resumo.semReuniaoRegistrada} tone={resumo.semReuniaoRegistrada > 0 ? 'warn' : undefined} />
        <StatCard label="Sem próxima agendada" value={resumo.semProximaAgendada} tone={resumo.semProximaAgendada > 0 ? 'warn' : undefined} />
      </section>

      {/* ── 2. Distribuição por coordenação ── */}
      <section className="card-surface p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="label-micro">Distribuição por coordenação</h2>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] text-ink-muted uppercase tracking-wide">
              <th className="px-3 py-2 text-left font-medium w-6"></th>
              <SortHeader label="Coordenação" sortKey="grupo_nome" active={distribuicaoTable.key} dir={distribuicaoTable.dir} onClick={distribuicaoTable.toggle} />
              <SortHeader label="Professores" sortKey="professores" active={distribuicaoTable.key} dir={distribuicaoTable.dir} onClick={distribuicaoTable.toggle} />
              <SortHeader label="Score médio" sortKey="scoreMedio" active={distribuicaoTable.key} dir={distribuicaoTable.dir} onClick={distribuicaoTable.toggle} />
              <SortHeader label="Última reunião realizada" sortKey="ultimaReuniaoRealizada" active={distribuicaoTable.key} dir={distribuicaoTable.dir} onClick={distribuicaoTable.toggle} />
            </tr>
          </thead>
          <tbody>
            {distribuicaoTable.sorted.map(c => {
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
                    className="border-b border-line-soft cursor-pointer hover:bg-surface-subtle"
                  >
                    <td className="px-3 py-2">{aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                    <td className="px-3 py-2 font-medium text-ink">{c.grupo_nome}</td>
                    <td className="px-3 py-2 tabular-nums">{c.professores}</td>
                    <td className="px-3 py-2 tabular-nums">{c.scoreMedio != null ? Math.round(c.scoreMedio) : '—'}</td>
                    <td className="px-3 py-2 text-ink-muted">
                      {c.ultimaReuniaoRealizada ? new Date(c.ultimaReuniaoRealizada).toLocaleDateString('pt-BR') : '—'}
                    </td>
                  </tr>
                  {aberto && (
                    <tr>
                      <td colSpan={5} className="bg-surface-subtle px-3 py-2">
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
      </section>

      {/* ── 3. Distribuição por score ── */}
      <section className="card-surface p-5 space-y-4">
        <h2 className="label-micro">Distribuição por score</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={distribuicaoScore}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Professores" isAnimationActive={false}>
                {distribuicaoScore.map((_, i) => <Cell key={i} fill={CORES_FAIXA[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={distribuicaoScore} dataKey="count" nameKey="label" outerRadius={90} isAnimationActive={false}
                label={({ name, percent }: { name?: string; percent?: number }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {distribuicaoScore.map((_, i) => <Cell key={i} fill={CORES_FAIXA[i]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] text-ink-muted uppercase tracking-wide">
              <th className="px-3 py-2 text-left font-medium">Faixa</th>
              <th className="px-3 py-2 text-left font-medium">Professores</th>
              <th className="px-3 py-2 text-left font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {distribuicaoScore.map((b, i) => (
              <tr key={b.label} className="border-b border-line-soft last:border-0">
                <td className="px-3 py-2 text-ink flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CORES_FAIXA[i] }} />
                  {b.label}
                </td>
                <td className="px-3 py-2 tabular-nums">{b.count}</td>
                <td className="px-3 py-2 tabular-nums text-ink-muted">{b.pct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── 4. Indicadores de score ── */}
      <section className="card-surface p-5 space-y-4">
        <h2 className="label-micro">Indicadores de score</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Maior score" value={indicadores.max ?? '—'} />
          <StatCard label="Menor score" value={indicadores.min ?? '—'} />
          <StatCard label="Score médio" value={indicadores.media != null ? Math.round(indicadores.media) : '—'} />
          <StatCard label="Mediana" value={indicadores.mediana != null ? Math.round(indicadores.mediana) : '—'} />
          <StatCard label="Acima de 1200" value={indicadores.acima1200} />
          <StatCard label="Abaixo de 600" value={indicadores.abaixo600} />
        </div>
        <div>
          <p className="text-[11px] text-ink-muted mb-2">Evolução do score médio — escola e por coordenação</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendChartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="ano_mes" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="escola" stroke="var(--accent-blue)" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
              {grupos.map((g, i) => (
                <Line key={g.id} type="monotone" dataKey={g.nome} stroke={CORES_FAIXA[i % CORES_FAIXA.length]} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── 5. Ranking das coordenações ── */}
      <section className="card-surface p-5 space-y-3">
        <h2 className="label-micro">Ranking das coordenações</h2>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] text-ink-muted uppercase tracking-wide">
              <SortHeader label="Coordenação" sortKey="grupo_nome" active={rankingTable.key} dir={rankingTable.dir} onClick={rankingTable.toggle} />
              <SortHeader label="Professores" sortKey="professores" active={rankingTable.key} dir={rankingTable.dir} onClick={rankingTable.toggle} />
              <SortHeader label="Score médio" sortKey="scoreMedio" active={rankingTable.key} dir={rankingTable.dir} onClick={rankingTable.toggle} />
              <SortHeader label="% acima de 1200" sortKey="pctAcima1200" active={rankingTable.key} dir={rankingTable.dir} onClick={rankingTable.toggle} />
              <SortHeader label="% abaixo de 600" sortKey="pctAbaixo600" active={rankingTable.key} dir={rankingTable.dir} onClick={rankingTable.toggle} />
            </tr>
          </thead>
          <tbody>
            {rankingTable.sorted.map(c => (
              <tr key={c.grupo_id ?? '__sem_grupo__'} className="border-b border-line-soft last:border-0">
                <td className="px-3 py-2 font-medium text-ink">{c.grupo_nome}</td>
                <td className="px-3 py-2 tabular-nums">{c.professores}</td>
                <td className="px-3 py-2 tabular-nums">{c.scoreMedio != null ? Math.round(c.scoreMedio) : '—'}</td>
                <td className="px-3 py-2 tabular-nums">{c.pctAcima1200.toFixed(1)}%</td>
                <td className="px-3 py-2 tabular-nums">{c.pctAbaixo600.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── 6. Reuniões por coordenação ── */}
      <section className="card-surface p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="label-micro">Reuniões realizadas por coordenação</h2>
          <span className="text-[12px] text-ink-muted">
            Total: <span className="font-semibold text-ink tabular-nums">{reunioesPorCoord.total}</span>
          </span>
        </div>
        {reunioesPorCoord.linhas.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Nenhuma reunião realizada no período selecionado.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 lg:items-center">
            <ResponsiveContainer width="100%" height={Math.max(160, reunioesPorCoord.linhas.length * 44)}>
              <BarChart data={reunioesPorCoord.linhas} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="grupo_nome" tick={{ fontSize: 11 }} width={92} />
                <Tooltip />
                <Bar dataKey="realizadas" name="Reuniões" fill="var(--accent-blue)" radius={[0, 3, 3, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] text-ink-muted uppercase tracking-wide">
                  <th className="px-3 py-2 text-left font-medium">Coordenação</th>
                  <th className="px-3 py-2 text-left font-medium">Reuniões</th>
                  <th className="px-3 py-2 text-left font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {reunioesPorCoord.linhas.map(l => (
                  <tr key={l.grupo_id ?? '__sem_grupo__'} className="border-b border-line-soft last:border-0">
                    <td className="px-3 py-2 font-medium text-ink">{l.grupo_nome}</td>
                    <td className="px-3 py-2 tabular-nums">{l.realizadas}</td>
                    <td className="px-3 py-2 tabular-nums text-ink-muted">
                      {reunioesPorCoord.total ? ((l.realizadas / reunioesPorCoord.total) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 7. Movimento de professores (entradas / saídas) ── */}
      <section className="card-surface p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="label-micro">Movimento de professores</h2>
          <Select value={granMovimento} onValueChange={v => setGranMovimento(v as Granularidade)}>
            <SelectTrigger className="h-8 w-[130px] text-[12px] bg-surface-canvas border-line text-ink">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-surface-canvas border-line text-ink">
              {(['semana', 'mes', 'trimestre', 'ano'] as Granularidade[]).map(g => (
                <SelectItem key={g} value={g} className="text-[12px]">{LABEL_GRANULARIDADE[g]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Entradas no período" value={movimentoResumo.entradas} />
          <StatCard label="Saídas no período" value={movimentoResumo.saidas} tone={movimentoResumo.saidas > 0 ? 'warn' : undefined} />
          <StatCard label="Saldo" value={movimentoResumo.saldo > 0 ? `+${movimentoResumo.saldo}` : String(movimentoResumo.saldo)} />
        </div>
        {movimentoPontos.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Sem entradas ou saídas no período selecionado.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={movimentoPontos}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="entradas" name="Entradas" fill="#22c55e" isAnimationActive={false} />
              <Bar dataKey="saidas" name="Saídas" fill="#ef4444" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="text-[11px] text-ink-subtle">
          Saídas passaram a ser datadas em 2026-07-10; desligamentos anteriores não aparecem na série temporal.
        </p>
      </section>

      {/* ── 8. Alertas inteligentes ── */}
      <section className="card-surface p-5 space-y-3">
        <h2 className="label-micro">Alertas inteligentes ({alertas.length})</h2>
        {coordenacoesAbaixoMedia.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {coordenacoesAbaixoMedia.map(c => (
              <span key={c.grupo_id ?? '__sem_grupo__'} className="inline-flex items-center rounded-full bg-urg-medBg text-urg-medFg px-2.5 py-1 text-[11px] font-medium">
                {c.grupo_nome} abaixo da média geral
              </span>
            ))}
          </div>
        )}
        {alertas.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Nenhum alerta no momento.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {alertas.slice(0, 200).map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                <span className="text-ink">{a.professor.nome}</span>
                <span className="inline-flex items-center rounded-full bg-urg-highBg text-urg-highFg px-2 py-0.5 text-[11px] font-medium">
                  {LABEL_ALERTA[a.motivo]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ─── Stat card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: 'warn' }) {
  return (
    <div className="card-surface p-4 space-y-1">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className={cn('text-xl font-semibold tabular-nums', tone === 'warn' ? 'text-urg-highFg' : 'text-ink')}>{value}</p>
    </div>
  )
}
