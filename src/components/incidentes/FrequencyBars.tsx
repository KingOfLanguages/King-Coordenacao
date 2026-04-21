import { useMemo } from 'react'

interface Item { label: string; value: number }
interface Props { data: Item[] }

/**
 * Horizontal bar chart — minimal, no axes, for "Problemas mais frequentes".
 * Uses CSS Grid so each row aligns: label | bar | count.
 */
export function FrequencyBars({ data }: Props) {
  const max = useMemo(() => Math.max(1, ...data.map(d => d.value)), [data])

  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-[13px] text-ink-muted">
        Nenhum dado disponível.
      </div>
    )
  }

  return (
    <div className="grid gap-1.5 text-[13px]" style={{ gridTemplateColumns: '140px 1fr 32px' }}>
      {data.map(({ label, value }) => {
        const pct = (value / max) * 100
        return (
          <div key={label} className="contents">
            <span className="text-ink-secondary truncate py-1 text-right pr-2">{label}</span>
            <div className="relative self-center h-2 rounded-full bg-surface-subtle overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-accentBlue/85 transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="self-center text-ink-muted tabular-nums text-right">{value}</span>
          </div>
        )
      })}
    </div>
  )
}
