import { cn } from '@/lib/utils'

type Status = 'pendente' | 'concluida' | 'cancelada'

interface Props { status: Status; className?: string }

const config: Record<Status, { label: string; cls: string }> = {
  pendente:  { label: 'Pendente',  cls: 'bg-urg-medBg text-urg-medFg' },
  concluida: { label: 'Concluída', cls: 'bg-urg-lowBg text-urg-lowFg' },
  cancelada: { label: 'Cancelada', cls: 'bg-surface-muted text-ink-muted' },
}

export function StatusBadge({ status, className }: Props) {
  const { label, cls } = config[status]
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium',
      cls,
      className,
    )}>
      {label}
    </span>
  )
}
