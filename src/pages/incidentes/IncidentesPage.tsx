import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, BarChart3, Clock, CheckCircle2, AlertOctagon,
  Search, FileSpreadsheet, Download, SlidersHorizontal, X, Bell,
} from 'lucide-react'
import { useIncidentes } from '@/hooks/useIncidentes'
import type { FiltrosIncidente } from '@/hooks/useIncidentes'
import type { UrgenciaNivel } from '@/types'
import { NovoIncidentePanel } from '@/components/incidentes/NovoIncidentePanel'
import { StatCard } from '@/components/incidentes/StatCard'
import { FrequencyBars } from '@/components/incidentes/FrequencyBars'
import { UrgencyBadge, urgencyFromIncidente } from '@/components/incidentes/IncidenteStatusBadge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TabKey = 'recentes' | 'solucionados' | 'controle' | 'ci-solucionados'
type UrgFilter = 'todas' | UrgenciaNivel

const TIPO_OPTS = ['Todos', 'Suporte', 'Didático', 'Plataforma', 'Aluno', 'Administrativo', 'Financeiro', 'Dúvida', 'Ocorrência']

type IncidenteRow = {
  id: string
  tipo: string
  descricao: string
  status: string
  created_at: string
  professores: { nome: string } | null
  criador: { nome: string } | null
}

export function IncidentesPage() {
  const navigate = useNavigate()
  const [filtros, setFiltros] = useState<FiltrosIncidente>({})
  const [tab, setTab] = useState<TabKey>('recentes')
  const [periodo, setPeriodo] = useState<'hoje' | 'mes'>('hoje')
  const [tipoFilter, setTipoFilter] = useState<string>('Todos')
  const [urgFilter, setUrgFilter] = useState<UrgFilter>('todas')
  const [respFilter, setRespFilter] = useState('')
  const [toastDismissed, setToastDismissed] = useState(false)

  // Merge local urgência pill into server-side filtros
  const filtrosComUrg: FiltrosIncidente = {
    ...filtros,
    urgencia: urgFilter !== 'todas' ? urgFilter : undefined,
    responsavel: respFilter.trim() || undefined,
  }
  const { data: incidentes, isLoading } = useIncidentes(filtrosComUrg)
  const rows = (incidentes ?? []) as unknown as IncidenteRow[]

  // Metrics
  const metricas = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const mesInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const basePeriodo = rows.filter(i => {
      const d = new Date(i.created_at)
      return periodo === 'hoje' ? d >= hoje : d >= mesInicio
    })
    const total = basePeriodo.length
    const pendentes = rows.filter(i => i.status === 'pendente').length
    const resolvidos = rows.filter(i => i.status === 'aprovado').length
    const urgentes = rows.filter(i => urgencyFromIncidente(i) === 'alta' && i.status !== 'aprovado').length
    const plataforma = rows.filter(i => i.tipo?.toLowerCase().includes('plataforma')).length
    const pct = rows.length > 0 ? Math.round((plataforma / rows.length) * 100) : 0

    return { total, pctPlataforma: pct, pendentes, resolvidos, urgentes }
  }, [rows, periodo])

  // Frequency bars
  const frequencia = useMemo(() => {
    const buckets: Record<string, number> = {}
    TIPO_OPTS.slice(1).forEach(t => { buckets[t] = 0 })
    rows.forEach(i => {
      const base = i.tipo?.split(' · ')[0] ?? ''
      const match = TIPO_OPTS.slice(1).find(t => base.toLowerCase() === t.toLowerCase())
      if (match) buckets[match]++
    })
    return Object.entries(buckets).map(([label, value]) => ({ label, value }))
  }, [rows])

  // Table — apply local tab + pill filters
  const filtradas = useMemo(() => {
    let list = rows
    if (tab === 'recentes')        list = list.filter(i => i.status === 'pendente')
    if (tab === 'solucionados')    list = list.filter(i => i.status === 'aprovado')
    if (tab === 'controle')        list = list.filter(i => i.tipo?.toLowerCase().includes('administrativo') || i.tipo?.toLowerCase().includes('financeiro'))
    if (tab === 'ci-solucionados') list = list.filter(i => i.status === 'aprovado' && (i.tipo?.toLowerCase().includes('administrativo') || i.tipo?.toLowerCase().includes('financeiro')))

    if (tipoFilter !== 'Todos') list = list.filter(i => i.tipo?.toLowerCase().startsWith(tipoFilter.toLowerCase()))
    // urgFilter and respFilter are now applied server-side via filtrosComUrg

    return list
  }, [rows, tab, tipoFilter, urgFilter, respFilter])

  const tabCounts = useMemo(() => ({
    recentes:        rows.filter(i => i.status === 'pendente').length,
    solucionados:    rows.filter(i => i.status === 'aprovado').length,
    controle:        rows.filter(i => i.tipo?.toLowerCase().includes('administrativo') || i.tipo?.toLowerCase().includes('financeiro')).length,
    'ci-solucionados': rows.filter(i => i.status === 'aprovado' && (i.tipo?.toLowerCase().includes('administrativo') || i.tipo?.toLowerCase().includes('financeiro'))).length,
  }), [rows])

  const hasPills = tipoFilter !== 'Todos' || urgFilter !== 'todas' || respFilter.trim() || filtros.busca
  const pendentesList = rows.filter(i => i.status === 'pendente' && urgencyFromIncidente(i) !== 'baixa').slice(0, 3)

  return (
    <div className="px-6 py-6">
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5 max-w-[1500px] mx-auto">
        {/* LEFT — Novo Incidente form */}
        <div className="xl:block">
          <NovoIncidentePanel />
        </div>

        {/* RIGHT — dashboard content */}
        <div className="space-y-5 min-w-0">
          {/* Metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
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

            <StatCard icon={BarChart3}     label="% plataforma" value={`${metricas.pctPlataforma}%`} tone="info" />
            <StatCard icon={Clock}         label="Pendentes"    value={metricas.pendentes} tone="warn" />
            <StatCard icon={CheckCircle2}  label="Resolvidos"   value={metricas.resolvidos} tone="ok" />
            <StatCard icon={AlertOctagon}  label="Urgentes"     value={metricas.urgentes} tone="danger" />
          </div>

          {/* Frequency chart */}
          <section className="card-surface p-5">
            <header className="flex items-center justify-between mb-4">
              <h3 className="label-micro">Problemas mais frequentes</h3>
            </header>
            <FrequencyBars data={frequencia} />
          </section>

          {/* Temporal evolution */}
          <section className="card-surface p-5">
            <header className="flex items-center justify-between mb-3">
              <h3 className="label-micro">Evolução temporal</h3>
              <div className="flex rounded-md bg-surface-subtle p-0.5 text-[11px] font-medium">
                {['Semana', 'Mês'].map(opt => (
                  <button
                    key={opt}
                    className={cn(
                      'btn-press px-2.5 py-0.5 rounded',
                      opt === 'Semana' ? 'bg-surface-canvas text-ink shadow-card' : 'text-ink-muted',
                    )}
                  >{opt}</button>
                ))}
              </div>
            </header>
            <div className="h-32 flex items-center justify-center text-[13px] text-ink-muted">
              {rows.length === 0 ? 'Nenhum dado disponível.' : `${rows.length} registros no período`}
            </div>
          </section>

          {/* Tabs + actions */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <nav className="flex items-center gap-0 border-b border-line-soft">
                {([
                  ['recentes',         'Registros Recentes', tabCounts.recentes],
                  ['solucionados',     'Solucionados',       tabCounts.solucionados],
                  ['controle',         'Controle Interno',   tabCounts.controle],
                  ['ci-solucionados',  'Solucionados CI',    tabCounts['ci-solucionados']],
                ] as const).map(([k, label, count]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={cn(
                      'btn-press relative px-3 py-2 text-[13px] font-medium -mb-px border-b-2',
                      tab === k
                        ? 'text-ink border-ink'
                        : 'text-ink-muted border-transparent hover:text-ink-secondary',
                    )}
                  >
                    {label}<span className="text-ink-muted">({count})</span>
                  </button>
                ))}
              </nav>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="btn-press h-8 gap-1.5 border-line text-ink-secondary hover:bg-surface-subtle">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Google Sheets
                </Button>
                <Button size="sm" className="btn-press h-8 gap-1.5 bg-accentBlue hover:bg-accentBlue-hov text-white">
                  <Download className="h-3.5 w-3.5" />
                  Exportar Excel
                </Button>
              </div>
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

            {/* Filter pills */}
            <div className="space-y-2 text-[12px]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="label-micro text-[10px]">Tipo:</span>
                {TIPO_OPTS.map(t => (
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
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-urg-medBg px-2 py-0.5 text-[11px] text-urg-medFg font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-urg-medFg" />
                  Acompanhamento pendente
                </span>
              </div>
            </div>

            {/* Result count */}
            <div className="flex items-center gap-2 text-[12px] text-ink-secondary">
              <SlidersHorizontal className="h-3.5 w-3.5 text-ink-muted" />
              <span className="font-semibold text-ink tabular-nums">{filtradas.length}</span>
              <span className="text-ink-muted">de {rows.length} registros filtrados</span>
            </div>

            {/* Table */}
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
                      <th className="w-8 px-3 py-2.5"><input type="checkbox" className="accent-accentBlue" /></th>
                      <th className="w-8 px-3 py-2.5"><input type="checkbox" className="accent-accentBlue" /></th>
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
                      const tipoBase = inc.tipo?.split(' · ')[0] ?? inc.tipo
                      return (
                        <tr
                          key={inc.id}
                          onClick={() => navigate(`/incidentes/${inc.id}`)}
                          className={cn(
                            'group cursor-pointer border-t border-line-soft transition-colors',
                            urg === 'alta' ? 'bg-urg-highBg/25 hover:bg-urg-highBg/45' : 'hover:bg-surface-subtle/55',
                          )}
                        >
                          <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" className="accent-accentBlue" />
                          </td>
                          <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" className="accent-accentBlue" />
                          </td>
                          <td className="px-3 py-2.5">
                            <UrgencyBadge level={urg} />
                          </td>
                          <td className="px-3 py-2.5 text-ink font-medium truncate max-w-[180px]">
                            {inc.professores?.nome ?? '—'}
                          </td>
                          <td className="px-3 py-2.5 text-ink-secondary truncate max-w-[140px]">
                            {inc.criador?.nome ?? '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-ink-secondary">
                              <span className="h-1.5 w-1.5 rounded-full bg-accentBlue/70" />
                              {tipoBase}
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

      {/* Floating notification toast */}
      {metricas.urgentes > 0 && !toastDismissed && (
        <div className="fixed bottom-5 right-5 z-40 w-80 card-surface p-4 shadow-elevated animate-slide-in-right">
          <div className="flex items-start gap-3">
            <span className="h-8 w-8 rounded-full bg-urg-medBg text-urg-medFg flex items-center justify-center flex-shrink-0">
              <Bell className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-[13px] text-ink leading-snug">
                Você tem <strong className="font-semibold">{metricas.urgentes} incidente{metricas.urgentes !== 1 ? 's' : ''}</strong> pendente{metricas.urgentes !== 1 ? 's' : ''} de acompanhamento
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
                onClick={() => { setTab('recentes'); setUrgFilter('alta') }}
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
