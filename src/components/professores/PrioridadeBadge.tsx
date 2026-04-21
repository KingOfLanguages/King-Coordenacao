import { cn } from '@/lib/utils'
import type { Professor } from '@/types'

interface Props { professor: Professor; className?: string }

function Chip({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium',
      className,
    )}>
      {label}
    </span>
  )
}

export function PrioridadeBadge({ professor, className }: Props) {
  if (professor.saiu)           return <Chip label="Saiu"          className={cn('bg-surface-muted text-ink-muted', className)} />
  if (professor.pausa)          return <Chip label="Pausa"         className={cn('bg-urg-medBg text-urg-medFg', className)} />
  if (professor.monitoramento)  return <Chip label="Monitoramento" className={cn('bg-urg-highBg text-urg-highFg', className)} />
  return <Chip label="Ativo" className={cn('bg-urg-lowBg text-urg-lowFg', className)} />
}
