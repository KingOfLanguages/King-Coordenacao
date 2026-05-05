import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, BarChart3, Clock, CheckCircle2, AlertOctagon,
  Search, SlidersHorizontal, X, Bell,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useIncidentes } from '@/hooks/useIncidentes'
import type { FiltrosIncidente } from '@/hooks/useIncidentes'
import type { UrgenciaNivel } from '@/types'
import { NovoIncidentePanel } from '@/components/incidentes/NovoIncidentePanel'
import type { Categoria } from '@/components/incidentes/NovoIncidentePanel'
import { StatCard } from '@/components/incidentes/StatCard'
import { FrequencyBars } from '@/components/incidentes/FrequencyBars'
import { UrgencyBadge, urgencyFromIncidente } from '@/components/incidentes/IncidenteStatusBadge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type TabKey = 'recentes' | 'solucionados' | 'controle' | 'ci-solucionados'
type UrgFilter = 'todas' | UrgenciaNivel
type PeriodoTemporal = 'Semana' | 'Mês'

// Suporte types (shown when tab is recentes/solucionados)
const TIPOS_SUPORTE = [
  'Suporte', 'Didático', 'Plataforma', 'Aluno',
  'Administrativo', 'Financeiro', 'Dúvida', 'Ocorrência',
]

// Controle Interno types (shown when tab is controle/ci-solucionados)
const TIPOS_CI = [
  'Mês de análise', 'No-Show', 'Muitas pendências', 'Muitas faltas',
  'Reclamação', 'Profissionalismo', 'Organização', 'Erros de lançamento',
]

function isCITipo(tipo: string) {
  return TIPOS_CI.some(t => tipo?.toLowerCase() === t.toLowerCase())
}

type IncidenteRow = {
  id: string
  tipo: string
  descricao: string
  status: string
  urgencia?: string
  created_at: string
  professores: { nome: string } | null
  criador: { nome: string } | null
  responsavel?: string | null
}

export function IncidentesPage() {
  const navigate = useNavigate()
  const [filtros, setFiltros]       = useState<FiltrosIncidente>({})
  const [tab, setTab]               = useState<TabKey>('recentes')
  const [categoria, setCategoria]   = useState<Categoria>('Suporte')
  const [periodo, setPeriodo]       = useState<'hoje' | 'mes'>('hoje')
  const [tipoFilter, setTipoFilter] = useState<string>('Todos')
  const [urgFilter, setUrgFilter]   = useState<UrgFilter>('todas')
  const [respFilter, setRespFilter] = useState('')
  const [toastDismissed, setToastDismissed]       = useState(false)
  const [periodoTemporal, setPeriodoTemporal]     = useState<PeriodoTemporal>('Semana')

  // Tab → categoria sync (CI tabs flip the form panel)
  function handleTabChange(t: TabKey) {
    setTab(t)
    setTipoFilter('Todos')
    if (t === 'controle' || t === 'ci-solucionados') {
      setCategoria('Controle Interno')
    } else {
      setCategoria('Suporte')
    }
  }

  // Categoria → tab sync (form panel toggle flips to matching tab)
  function handleCategoriaChange(c: Categoria) {
    setCategoria(c)
    setTipoFilter('Todos')
    if (c === 'Controle Interno' && tab !== 'controle' && tab !== 'ci-solucionados') {
      setTab('controle')
    } else if (c === 'Suporte' && (tab === 'controle' || tab === 'ci-solucionados')) {
      setTab('recentes')
    }
  }

  const isCIMode = tab === 'controle' || tab === 'ci-solucionados'
  const tipoOpts = ['Todos', ...(isCIMode ? TIPOS_CI : TIPOS_SUPORTE)]

  // Server-side filters
  const filtrosComUrg: FiltrosIncidente = {
    ...filtros,
    urgencia:    urgFilter !== 'todas' ? urgFilter : undefined,
    responsavel: respFilter.trim() || undefined,
  }
  const { data: incidentes, isLoading } = useIncidentes(filtrosComUrg)
  const rows = (incidentes ?? []) as unknown as IncidenteRow[]

  // Metrics
  const metricas = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const mesInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const base = rows.filter(i => {
      const d = new Date(i.created_at)
      return periodo === 'hoje' ? d >= hoje : d >= mesInicio
    })
    const ciBase = base.filter(i => isCITipo(i.tipo))
    const baseAtivo = isCIMode ? ciBase : base

    const total      = baseAtivo.length
    const pendentes  = rows.filter(i => i.status === 'pendente' && (isCIMode ? isCITipo(i.tipo) : !isCITipo(i.tipo))).length
    const resolvidos = rows.filter(i => i.status === 'aprovado'  && (isCIMode ? isCITipo(i.tipo) : !isCITipo(i.tipo))).length
    const urgentes   = rows.filter(i =>
      urgencyFromIncidente(i) === 'alta' &&
      i.status !== 'aprovado' &&
      (isCIMode ? isCITipo(i.tipo) : !isCITipo(i.tipo))
    ).length

    const pctBase = isCIMode
      ? ciBase.filter(i => i.tipo?.toLowerCase() === 'mês de análise').length
      : base.filter(i => i.tipo?.toLowerCase().includes('plataforma')).length
    const pct = baseAtivo.length > 0 ? Math.round((pctBase / baseAtivo.length) * 100) : 0

    return { total, pct, pendentes, resolvidos, urgentes }
  }, [rows, periodo, isCIMode])

  // Frequency bars — categories change with mode
  const frequencia = useMemo(() => {
    const list = isCIMode ? TIPOS_CI : TIPOS_SUPORTE
    const buckets: Record<string, number> = {}
    list.forEach(t => { buckets[t] = 0 })
    rows.forEach(i => {
      const match = list.find(t => i.tipo?.toLowerCase() === t.toLowerCase())
      if (match) buckets[match]++
    })
    return list.map(label => ({ label, value: buckets[label] }))
  }, [rows, isCIMode])

  // Temporal chart data — grouped by day for the selected period
  const chartDataTemporal = useMemo(() => {
    const hoje = new Date()
    const dias  = periodoTemporal === 'Semana' ? 7 : 30
    const buckets: Record<string, number> = {}
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(hoje)
      d.setDate(d.getDate() - i)
      buckets[d.toISOString().slice(0, 10)] = 0
    }
    rows.forEach(r => {
      const key = r.created_at.slice(0, 10)
      if (key in buckets) buckets[key]++
    })
    return Object.entries(buckets).map(([date, value]) => ({
      name:  new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      value,
    }))
  }, [rows, periodoTemporal])

  // Table — tab + tipo pill filter
  const filtradas = useMemo(() => {
    let list = rows

    // Tab filter — BUG-06: 'controle' shows only pending CI items
    if (tab === 'recentes')        list = list.filter(i => i.status === 'pendente' && !isCITipo(i.tipo))
    if (tab === 'solucionados')    list = list.filter(i => i.status === 'aprovado'  && !isCITipo(i.tipo))
    if (tab === 'controle')        list = list.filter(i => isCITipo(i.tipo) && i.status === 'pendente')
    if (tab === 'ci-solucionados') list = list.filter(i => i.status === 'aprovado'  && isCITipo(i.tipo))

    // Tipo pill
    if (tipoFilter !== 'Todos') {
      list = list.filter(i => i.tipo?.toLowerCase() === tipoFilter.toLowerCase())
    }

    return list
  }, [rows, tab, tipoFilter])

  // Tab counts — BUG-06: controle count matches filter (pending only)
  const tabCounts = useMemo(() => ({
    recentes:          rows.filter(i => i.status === 'pendente' && !isCITipo(i.tipo)).length,
    solucionados:      rows.filter(i => i.status === 'aprovado'  && !isCITipo(i.tipo)).length,
    controle:          rows.filter(i => isCITipo(i.tipo) && i.status === 'pendente').length,
    'ci-solucionados': rows.filter(i => i.status === 'aprovado'  && isCITipo(i.tipo)).length,
  }), [rows])

  const hasPills = tipoFilter !== 'Todos' || urgFilter !== 'todas' || respFilter.trim() || filtros.busca

  // BUG-07: align urgency criterion with metricas.urgentes (both use === 'alta')
  const pendentesList = rows.filter(i => i.status === 'pendente' && urgencyFromIncidente(i) === 'alta').slice(0, 3)

  const pctLabel = isCIMode ? '% em análise' : '% plataforma'

  return (
    <div className="px-6 py-6">
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5 max-w-[1500px] mx-auto">

        {/* LEFT — Novo Incidente form (controlled) */}
        <div className="xl:block">
          <NovoIncidentePanel
            categoria={categoria}
            onCategoriaChange={handleCategoriaChange}
          />
        </div>

        {/* RIGHT — dashboard */}
        <div className="space-y-5 min-w-0">

          {/* Metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {/* Total card with Hoje/Mês toggle */}
            <div className="col-span-2 md:col-span-3 xl:col-span-1 card-surface p-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-md bg-accentBlue-soft text-accentBlue flex items-center justify-center">
                    <TrendingUp className="h-3.5 w-3.5" />
                  </span>
                  <span className="label-micro">Total {periodo === 'hoje' ? 'hoje' : 'mês'}</span>
                </div>
                <div className="flex rounded-md bg-surface-subtle p-0.5 text-[11px] font-medium">
                  {(['hoje', 'mes'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setPeriodo(p)}
                      className={cn(
                        'btn-press px-2 py-0.5 rounded',
                        periodo === p ? 'bg-surface-canvas text-ink shadow-card' : 'text-ink-muted',
                      )}
                    >
                      {p === 'hoje' ? 'Hoje' : 'Mês'}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-[28px] font-semibold tracking-tightest leading-none text-ink tabular-nums">
                {metricas.total}
              </span>
            </div>

            <StatCard icon={BarChart3}    label={pctLabel}    value={`${metricas.pct}%`}  tone="info" />
            <StatCard icon={Clock}        label="Pendentes"   value={metricas.pendentes}  tone="warn" />
            <StatCard icon={CheckCircle2} label="Resolvidos"  value={metricas.resolvidos} tone="ok" />
            <StatCard icon={AlertOctagon} label="Urgentes"    value={metricas.urgentes}   tone="danger" />
          </div>

          {/* Frequency chart */}
          <section className="card-surface p-5">
            <header className="flex items-center justify-between mb-4">
              <h3 className="label-micro">Problemas mais frequentes</h3>
            </header>
            <FrequencyBars data={frequencia} />
          </section>

          {/* Temporal evolution — BUG-04: real chart */}
          <section className="card-surface p-5">
            <header className="flex items-center justify-between mb-3">
              <h3 className="label-micro">Evolução temporal</h3>
              <div className="flex rounded-md bg-surface-subtle p-0.5 text-[11px] font-medium">
                {(['Semana', 'Mês'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setPeriodoTemporal(opt)}
                    className={cn(
                      'btn-press px-2.5 py-0.5 rounded',
                      periodoTemporal === opt ? 'bg-surface-canvas text-ink shadow-card' : 'text-ink-muted',
                    )}
                  >{opt}</button>
                ))}
              </div>
            </header>
            {chartDataTemporal.every(d => d.value === 0) ? (
              <div className="h-32 flex items-center justify-center text-[13px] text-ink-muted">
                Nenhum dado no período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={128}>
                <BarChart data={chartDataTemporal} barSize={periodoTemporal === 'Semana' ? 24 : 8} margin={{ top: 6, right: 8, left: -28, bottom: 0 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--fg-muted)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={periodoTemporal === 'Semana' ? 0 : 4}
                  />
                  <YAxis
                    tick={{ fill: 'var(--fg-muted)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={28}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--bg-subtle)' }}
                    contentStyle={{
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: 'var(--fg-primary)', fontWeight: 500 }}
                    itemStyle={{ color: 'var(--accent-blue)' }}
                    formatter={(v) => [(v as number) ?? 0, 'Incidentes']}
                  />
                  <Bar dataKey="value" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          {/* Tabs + actions */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <nav className="flex items-center border-b border-line-soft">
                {([
                  ['recentes',        'Registros Recentes', tabCounts.recentes],
                  ['solucionados',    'Solucionados',       tabCounts.solucionados],
                  ['controle',        'Controle Interno',   tabCounts.controle],
                  ['ci-solucionados', 'Solucionados CI',    tabCounts['ci-solucionados']],
                ] as const).map(([k, label, count]) => (
                  <button
                    key={k}
                    onClick={() => handleTabChange(k)}
                    className={cn(
                      'btn-press relative px-3 py-2 text-[13px] font-medium -mb-px border-b-2',
                      tab === k
                        ? 'text-ink border-ink'
                        : 'text-ink-muted border-transparent hover:text-ink-secondary',
                    )}
                  >
                    {label}<span className="text-ink-muted ml-0.5">({count})</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
              <Input
                placeholder="Buscar por professor, descrição ou solução…"
                value={filtros.busca ?? ''}
                onChange={e => setFiltros({ ...filtros, busca: e.target.value || undefined })}
                className="pl-9 h-9 bg-surface-canvas border-line"
              />
            </div>

            {/* Filter pills — types change with mode */}
            <div className="space-y-2 text-[12px]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="label-micro text-[10px]">Tipo:</span>
                {tipoOpts.map(t => (
                  <button
                    key={t}
                    onClick={() => setTipoFilter(t)}
                    className={cn(
                      'btn-press px-2.5 py-1 rounded-md font-medium',
                      tipoFilter === t
                        ? 'bg-ink text-surface-canvas'
                        : 'bg-surface-subtle text-ink-secondary hover:bg-surface-muted',
                    )}
                  >{t}</button>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="label-micro text-[10px]">Urgência:</span>
                {([
                  ['todas', 'Todas'],
                  ['baixa', 'Baixa'],
                  ['media', 'Média'],
                  ['alta',  'Alta'],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setUrgFilter(k)}
                    className={cn(
                      'btn-press px-2.5 py-1 rounded-md font-medium',
                      urgFilter === k
                        ? 'bg-ink text-surface-canvas'
                        : 'bg-surface-subtle text-ink-secondary hover:bg-surface-muted',
                    )}
                  >{label}</button>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="label-micro text-[10px]">Responsável:</span>
                <Input
                  placeholder="Filtrar…"
                  value={respFilter}
                  onChange={e => setRespFilter(e.target.value)}
                  className="h-7 w-48 text-[12px] bg-surface-canvas border-line"
                />
                {hasPills && (
                  <button
                    onClick={() => { setTipoFilter('Todos'); setUrgFilter('todas'); setRespFilter(''); setFiltros({}) }}
                    className="btn-press inline-flex items-center gap-1 text-ink-muted hover:text-ink text-[12px]"
                  >
                    <X className="h-3 w-3" /> Limpar
                  </button>
                )}
                {/* BUG-05: badge vira filtro ativo ao clicar */}
                <button
                  onClick={() => setFiltros(f => ({
                    ...f,
                    precisaAcompanhamento: f.precisaAcompanhamento ? undefined : true,
                  }))}
                  className={cn(
                    'ml-auto btn-press inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                    filtros.precisaAcompanhamento
                      ? 'bg-urg-medFg text-white'
                      : 'bg-urg-medBg text-urg-medFg hover:bg-urg-medFg/20',
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  Acompanhamento pendente
                </button>
              </div>
            </div>

            {/* Result count */}
            <div className="flex items-center gap-2 text-[12px] text-ink-secondary">
              <SlidersHorizontal className="h-3.5 w-3.5 text-ink-muted" />
              <span className="font-semibold text-ink tabular-nums">{filtradas.length}</span>
              <span className="text-ink-muted">de {rows.length} registros filtrados</span>
            </div>

            {/* Table — BUG-08: removed duplicate checkbox column */}
            <div className="card-surface overflow-hidden">
              {isLoading ? (
                <div className="p-12 flex items-center justify-center text-[13px] text-ink-muted">
                  Carregando registros…
                </div>
              ) : filtradas.length === 0 ? (
                <div className="p-12 text-center space-y-2">
                  <div className="mx-auto h-10 w-10 rounded-full bg-surface-subtle text-ink-muted flex items-center justify-center">
                    <AlertOctagon className="h-5 w-5" />
                  </div>
                  <p className="text-[14px] text-ink font-medium">Nenhum registro encontrado</p>
                  <p className="text-[13px] text-ink-muted">Ajuste os filtros ou registre um novo incidente.</p>
                </div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line-soft">
                      <th className="w-8 px-3 py-2.5">
                        <input type="checkbox" className="accent-accentBlue" />
                      </th>
                      <th className="text-left px-3 py-2.5 label-micro text-[10px]">Urgência</th>
                      <th className="text-left px-3 py-2.5 label-micro text-[10px]">Professor</th>
                      <th className="text-left px-3 py-2.5 label-micro text-[10px]">Responsável</th>
                      <th className="text-left px-3 py-2.5 label-micro text-[10px]">Tipo</th>
                      <th className="text-left px-3 py-2.5 label-micro text-[10px]">Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map(inc => {
                      const urg = urgencyFromIncidente(inc)
                      return (
                        <tr
                          key={inc.id}
                          onClick={() => navigate(`/incidentes/${inc.id}`)}
                          className={cn(
                            'group cursor-pointer border-t border-line-soft transition-colors',
                            urg === 'alta'
                              ? 'bg-urg-highBg/25 hover:bg-urg-highBg/45'
                              : 'hover:bg-surface-subtle/55',
                          )}
                        >
                          <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" className="accent-accentBlue" />
                          </td>
                          <td className="px-3 py-2.5">
                            <UrgencyBadge level={urg} />
                          </td>
                          <td className="px-3 py-2.5 font-medium text-ink truncate max-w-[180px]">
                            {inc.professores?.nome ?? '—'}
                          </td>
                          <td className="px-3 py-2.5 text-ink-secondary truncate max-w-[140px]">
                            {inc.responsavel ?? inc.criador?.nome ?? '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-ink-secondary">
                              <span className={cn(
                                'h-1.5 w-1.5 rounded-full flex-shrink-0',
                                isCIMode ? 'bg-urg-medFg/70' : 'bg-accentBlue/70',
                              )} />
                              {inc.tipo}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-ink-secondary truncate max-w-md">
                            {inc.descricao?.split('\n')[0]}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Floating notification */}
      {metricas.urgentes > 0 && !toastDismissed && (
        <div className="fixed bottom-5 right-5 z-40 w-80 card-surface p-4 shadow-elevated animate-slide-in-right">
          <div className="flex items-start gap-3">
            <span className="h-8 w-8 rounded-full bg-urg-medBg text-urg-medFg flex items-center justify-center flex-shrink-0">
              <Bell className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-[13px] text-ink leading-snug">
                Você tem{' '}
                <strong className="font-semibold">{metricas.urgentes} incidente{metricas.urgentes !== 1 ? 's' : ''}</strong>{' '}
                urgente{metricas.urgentes !== 1 ? 's' : ''} pendente{metricas.urgentes !== 1 ? 's' : ''}
              </p>
              <ul className="text-[12px] text-ink-muted space-y-0.5 max-h-24 overflow-hidden">
                {pendentesList.map(p => (
                  <li key={p.id} className="truncate">
                    · {p.professores?.nome ?? '—'}: {p.descricao?.split('\n')[0]}
                  </li>
                ))}
                {metricas.urgentes > pendentesList.length && (
                  <li className="text-ink-subtle">…e mais {metricas.urgentes - pendentesList.length}</li>
                )}
              </ul>
              <button
                onClick={() => { handleTabChange('recentes'); setUrgFilter('alta') }}
                className="btn-press text-[12px] font-medium text-accentBlue hover:text-accentBlue-hov"
              >
                Ver pendentes
              </button>
            </div>
            <button
              onClick={() => setToastDismissed(true)}
              className="btn-press text-ink-subtle hover:text-ink-secondary"
              aria-label="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
