import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useIncidentesPorMes } from '@/hooks/useIncidentes'
import { IncidenteStatusBadge } from '@/components/incidentes/IncidenteStatusBadge'
import { StatCard } from '@/components/incidentes/StatCard'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CORES = ['#2a5cff','#6585ff','#8ea5ff','#b3c2ff','#d4dcff']

type IncidenteRow = {
  id: string
  tipo: string
  status: 'pendente' | 'aprovado' | 'rejeitado'
  created_at: string
  professores: { nome: string } | null
}

export function MesAnalisePage() {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)

  const { data, isLoading } = useIncidentesPorMes(ano, mes)
  const incidentes = (data ?? []) as unknown as IncidenteRow[]

  function navegar(delta: number) {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes > 12) { novoMes = 1;  novoAno++ }
    if (novoMes < 1)  { novoMes = 12; novoAno-- }
    setMes(novoMes); setAno(novoAno)
  }

  const total     = incidentes.length
  const aprovados = incidentes.filter(i => i.status === 'aprovado').length
  const pendentes = incidentes.filter(i => i.status === 'pendente').length

  const chartData = useMemo(() => {
    const buckets = incidentes.reduce((acc, inc) => {
      const key = inc.tipo?.split(' · ')[0] ?? inc.tipo
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
    return Object.entries(buckets)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }))
  }, [incidentes])

  const isFuturo = ano > hoje.getFullYear() ||
    (ano === hoje.getFullYear() && mes >= hoje.getMonth() + 1)

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1200px] mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Mês de análise</h1>
          <p className="text-[13px] text-ink-muted">Visão consolidada dos incidentes no período.</p>
        </div>

        <div className="flex items-center gap-1 card-surface p-1">
          <Button variant="ghost" size="icon"
            onClick={() => navegar(-1)}
            className="btn-press h-8 w-8 text-ink-secondary hover:text-ink hover:bg-surface-subtle">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="inline-flex items-center gap-2 px-3 text-[13px] text-ink font-medium tabular-nums min-w-[9rem] justify-center">
            <CalendarDays className="h-3.5 w-3.5 text-ink-muted" />
            {MESES[mes - 1]} {ano}
          </span>
          <Button variant="ghost" size="icon"
            onClick={() => navegar(1)}
            disabled={isFuturo}
            className="btn-press h-8 w-8 text-ink-secondary hover:text-ink hover:bg-surface-subtle disabled:opacity-40">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="card-surface p-12 text-center text-[13px] text-ink-muted">Carregando…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard icon={CalendarDays} label="Total no mês" value={total}     tone="info" />
            <StatCard icon={CheckCircle2} label="Resolvidos"   value={aprovados} tone="ok" />
            <StatCard icon={Clock}        label="Pendentes"    value={pendentes} tone="warn" />
          </div>

          <section className="card-surface p-5">
            <h2 className="label-micro mb-3">Incidentes por tipo</h2>
            {chartData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-[13px] text-ink-muted">
                Nenhum dado no período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} barSize={28} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--bg-subtle)' }}
                    contentStyle={{
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 8,
                      boxShadow: '0 4px 14px -4px rgba(23,25,31,.08)',
                      fontSize: 12,
                    }}
                    labelStyle={{ color: 'var(--fg-primary)', fontWeight: 500 }}
                    itemStyle={{ color: 'var(--accent-blue)' }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="card-surface p-5 space-y-3">
            <h2 className="label-micro">Registros do mês</h2>
            {incidentes.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Nenhum incidente neste mês.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {incidentes.map(inc => (
                  <li key={inc.id} className="flex items-center justify-between py-2 text-[13px]">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-ink-muted tabular-nums w-20 flex-shrink-0">
                        {new Date(inc.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="text-ink font-medium">{inc.tipo}</span>
                      {inc.professores && <span className="text-ink-muted truncate">· {inc.professores.nome}</span>}
                    </div>
                    <IncidenteStatusBadge status={inc.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
