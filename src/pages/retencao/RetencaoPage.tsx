import { useState } from 'react'
import { useRetencao } from '@/hooks/useRetencao'
import { motivoSaidaLabel } from '@/lib/cicloVida'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Retenção/turnover de aluno por grupo (Fase 2 da API de Acompanhamento).
// churn = saiu da escola; turnover = trocou de professor, segue matriculado.

const hoje = new Date()
const fmt = (d: Date) => d.toISOString().slice(0, 10)
const PADRAO_DESDE = fmt(new Date(hoje.getFullYear(), hoje.getMonth() - 6, 1))
const PADRAO_ATE   = fmt(hoje)

export function RetencaoPage() {
  const [desde, setDesde] = useState(PADRAO_DESDE)
  const [ate, setAte]     = useState(PADRAO_ATE)
  const { data, isLoading } = useRetencao(desde, ate)

  const porGrupo  = data?.porGrupo ?? []
  const porMotivo = data?.porMotivo ?? []

  const totalSaidas   = porGrupo.reduce((s, r) => s + r.total_saidas, 0)
  const totalChurn    = porGrupo.reduce((s, r) => s + r.churn, 0)
  const totalTurnover = porGrupo.reduce((s, r) => s + r.turnover, 0)
  const semFlag       = totalSaidas - totalChurn - totalTurnover
  const pct = (n: number) => (totalSaidas ? Math.round((n / totalSaidas) * 100) : 0)

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-5">
      {/* Hero */}
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[19px] font-semibold text-ink tracking-[-0.01em]">Retenção &amp; Turnover</h1>
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            Saídas de aluno no período, separando churn da escola de troca de professor.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
            De
            <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="h-9 w-[9.5rem]" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
            Até
            <Input type="date" value={ate} onChange={e => setAte(e.target.value)} className="h-9 w-[9.5rem]" />
          </label>
        </div>
      </header>

      {/* Métricas em faixas (gap-px, sem card-in-card) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden bg-line-soft ring-1 ring-line-soft">
        <Tile valor={totalSaidas}   rotulo="Saídas no período" />
        <Tile valor={totalChurn}    rotulo="Saíram da escola"      sub={`${pct(totalChurn)}% · churn`} destaque />
        <Tile valor={totalTurnover} rotulo="Trocaram de professor" sub={`${pct(totalTurnover)}% · turnover`} />
        <Tile valor={semFlag}       rotulo="Sem classificação"     sub="saída sem flag" />
      </div>

      <p className="text-[11px] text-ink-subtle leading-relaxed">
        Taxa de retenção (%) precisa de uma base de comparação por período — <strong className="font-medium">a definir com o Lucas</strong>.
        Aqui os números são contagens absolutas de saídas. “Não informado” em motivo é categoria válida
        (a maioria das saídas automáticas), não dado faltante. O grupo é o atual do professor.
      </p>

      {/* Por grupo */}
      <section className="card-surface p-5 space-y-3">
        <h2 className="label-micro">Por coordenação / grupo</h2>
        {isLoading ? (
          <p className="text-[12px] text-ink-muted">Carregando…</p>
        ) : porGrupo.length === 0 ? (
          <p className="text-[12px] text-ink-muted">Nenhuma saída no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted">
                  <th className="text-left font-semibold py-2">Grupo</th>
                  <th className="text-right font-semibold py-2">Saídas</th>
                  <th className="text-right font-semibold py-2">Escola (churn)</th>
                  <th className="text-right font-semibold py-2">Professor (turnover)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft/60">
                {porGrupo.map(g => (
                  <tr key={g.grupo_id ?? 'sem'}>
                    <td className="py-2 text-ink">{g.grupo_nome}</td>
                    <td className="py-2 text-right tabular-nums text-ink-secondary">{g.total_saidas}</td>
                    <td className="py-2 text-right tabular-nums text-brand font-medium">{g.churn}</td>
                    <td className="py-2 text-right tabular-nums text-ink-secondary">{g.turnover}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Por motivo */}
      <section className="card-surface p-5 space-y-3">
        <h2 className="label-micro">Por motivo de saída</h2>
        {porMotivo.length === 0 ? (
          <p className="text-[12px] text-ink-muted">Sem dados no período.</p>
        ) : (
          <ul className="space-y-2.5">
            {porMotivo.map(m => {
              const largura = totalSaidas ? Math.max(2, Math.round((m.total / totalSaidas) * 100)) : 0
              return (
                <li key={m.motivo} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-ink-secondary">{motivoSaidaLabel(m.motivo)}</span>
                    <span className="tabular-nums text-ink-muted">
                      {m.total} <span className="text-ink-subtle">({m.churn} escola · {m.turnover} prof.)</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                    <div className="h-full rounded-full bg-accentBlue/60" style={{ width: `${largura}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function Tile({ valor, rotulo, sub, destaque }: { valor: number; rotulo: string; sub?: string; destaque?: boolean }) {
  return (
    <div className="bg-surface-canvas p-4">
      <p className={cn(
        'text-[26px] font-semibold tabular-nums tracking-[-0.02em]',
        destaque ? 'text-brand' : 'text-ink',
      )}>
        {valor}
      </p>
      <p className="text-[11.5px] text-ink-secondary mt-0.5">{rotulo}</p>
      {sub && <p className="text-[10.5px] text-ink-subtle mt-0.5">{sub}</p>}
    </div>
  )
}
