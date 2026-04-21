import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  value: string | number
  icon: LucideIcon
  tone?: 'neutral' | 'warn' | 'danger' | 'ok' | 'info'
  className?: string
}

const toneStyles: Record<NonNullable<Props['tone']>, { icon: string; value: string }> = {
  neutral: { icon: 'bg-surface-subtle text-ink-secondary', value: 'text-ink' },
  info:    { icon: 'bg-accentBlue-soft text-accentBlue',    value: 'text-ink' },
  warn:    { icon: 'bg-urg-medBg text-urg-medFg',           value: 'text-ink' },
  danger:  { icon: 'bg-urg-highBg text-urg-highFg',         value: 'text-urg-highFg' },
  ok:      { icon: 'bg-urg-lowBg text-urg-lowFg',           value: 'text-ink' },
}

export function StatCard({ label, value, icon: Icon, tone = 'neutral', className }: Props) {
  const styles = toneStyles[tone]
  return (
    <div className={cn(
      'card-surface p-4 flex flex-col gap-2.5 min-w-0',
      'hover:border-line-strong transition-colors',
      className,
    )}>
      <div className="flex items-center gap-2">
        <span className={cn('h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0', styles.icon)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="label-micro truncate">{label}</span>
      </div>
      <span className={cn('text-[28px] font-semibold tracking-tightest leading-none tabular-nums', styles.value)}>
        {value}
      </span>
    </div>
  )
}
