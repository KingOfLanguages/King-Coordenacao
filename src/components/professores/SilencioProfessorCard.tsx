import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { ClipboardList } from 'lucide-react'
import { useSilencioProfessor, statusLabel } from '@/hooks/useSilencio'

function semanaLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// Card de "Controle de pendências" para a página do professor: série semanal de
// aulas pendentes + histórico de episódios (incidentes) + mensagens já enviadas.
// Só aparece se houver algum dado.
export function SilencioProfessorCard({ professorId }: { professorId: string }) {
  const { data, isLoading } = useSilencioProfessor(professorId)

  if (isLoading || !data) return null
  const { series, incidentes, mensagens } = data
  if (series.length === 0 && incidentes.length === 0 && mensagens.length === 0) return null

  const chartData = series.map(s => ({ label: semanaLabel(s.semana), pendencias: s.qtd_pendencias }))

  return (
    <section className="card-surface p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-3.5 w-3.5 text-ink-muted" />
        <h2 className="label-micro">Controle de pendências (aulas por semana)</h2>
      </div>

      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="pendencias" stroke="var(--accent-blue)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {mensagens.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] text-ink-muted uppercase tracking-wide">Mensagens enviadas</p>
          <ul className="space-y-1">
            {mensagens.map(m => (
              <li key={m.id} className="flex items-center justify-between text-[12px] border-b border-line-soft last:border-0 pb-1">
                <span className="text-ink-secondary">{statusLabel[m.estagio]}</span>
                <span className="text-ink-muted tabular-nums">{new Date(m.enviado_em).toLocaleDateString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {incidentes.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] text-ink-muted uppercase tracking-wide">Episódios resolvidos</p>
          <ul className="space-y-1">
            {incidentes.map(inc => (
              <li key={inc.id} className="flex items-center justify-between text-[12px] border-b border-line-soft last:border-0 pb-1">
                <span className="text-ink-secondary">
                  {new Date(inc.aberto_em).toLocaleDateString('pt-BR')} → {new Date(inc.resolvido_em).toLocaleDateString('pt-BR')}
                </span>
                <span className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-urg-highBg text-urg-highFg px-2 py-0.5 text-[10.5px] font-medium tabular-nums">
                    pico {inc.dias_pico}d
                  </span>
                  <span className="text-ink-muted">{statusLabel[inc.status_final]}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
