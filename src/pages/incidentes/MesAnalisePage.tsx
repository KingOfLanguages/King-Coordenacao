import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useIncidentesPorMes } from '@/hooks/useIncidentes'
import { IncidenteStatusBadge } from '@/components/incidentes/IncidenteStatusBadge'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CORES = ['#C41230','#e34d6a','#f28095','#fbaab6','#fdd0d7']

export function MesAnalisePage() {
  const hoje = new Date()
  const [ano, setAno]   = useState(hoje.getFullYear())
  const [mes, setMes]   = useState(hoje.getMonth() + 1)

  const { data: incidentes, isLoading } = useIncidentesPorMes(ano, mes)

  function navegar(delta: number) {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes > 12) { novoMes = 1;  novoAno++ }
    if (novoMes < 1)  { novoMes = 12; novoAno-- }
    setMes(novoMes); setAno(novoAno)
  }

  const total     = incidentes?.length ?? 0
  const aprovados = incidentes?.filter(i => i.status === 'aprovado').length ?? 0
  const pendentes = incidentes?.filter(i => i.status === 'pendente').length ?? 0

  const porTipo = incidentes?.reduce((acc, inc) => {
    acc[inc.tipo] = (acc[inc.tipo] ?? 0) + 1
    return acc
  }, {} as Record<string, number>) ?? {}

  const chartData = Object.entries(porTipo)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }))

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Análise Mensal</h1>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navegar(-1)}
            className="text-white/50 hover:text-white">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-white font-medium w-28 text-center">
            {MESES[mes - 1]} {ano}
          </span>
          <Button variant="ghost" size="icon" onClick={() => navegar(1)}
            className="text-white/50 hover:text-white"
            disabled={ano === hoje.getFullYear() && mes === hoje.getMonth() + 1}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-white/40">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total', value: total, cor: 'text-white' },
              { label: 'Aprovados', value: aprovados, cor: 'text-green-400' },
              { label: 'Pendentes', value: pendentes, cor: 'text-yellow-400' },
            ].map(({ label, value, cor }) => (
              <Card key={label} className="bg-king-card border-king-border p-4 text-center">
                <p className="text-white/40 text-sm">{label}</p>
                <p className={`text-3xl font-bold mt-1 ${cor}`}>{value}</p>
              </Card>
            ))}
          </div>

          {chartData.length > 0 && (
            <Card className="bg-king-card border-king-border p-4">
              <p className="text-white/60 text-sm font-medium mb-4">Incidentes por tipo</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barSize={32}>
                  <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}
                    labelStyle={{ color: 'white' }}
                    itemStyle={{ color: '#C41230' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={CORES[i % CORES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          <Card className="bg-king-card border-king-border p-4 space-y-3">
            <p className="text-white/60 text-sm font-medium">Registros do mês</p>
            {incidentes?.length === 0 ? (
              <p className="text-white/30 text-sm">Nenhum incidente neste mês.</p>
            ) : (
              <div className="space-y-2">
                {incidentes?.map(inc => (
                  <div key={inc.id} className="flex items-center justify-between text-sm py-1 border-b border-king-border last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-white/40">
                        {new Date(inc.created_at).toLocaleDateString('pt-BR')}
                      </span>
                      <span className="text-white/80">{inc.tipo}</span>
                      {(inc as any).professores && (
                        <span className="text-white/40">{(inc as any).professores.nome}</span>
                      )}
                    </div>
                    <IncidenteStatusBadge status={inc.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
