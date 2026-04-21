import { cn } from '@/lib/utils'
import type { UrgenciaNivel } from '@/types'

/* ── Status badge ──────────────────────────────────────────────── */
type Status = 'pendente' | 'aprovado' | 'rejeitado'

interface StatusProps { status: Status; className?: string }

const statusCfg: Record<Status, { label: string; cls: string }> = {
  pendente:  { label: 'Pendente',  cls: 'bg-urg-medBg  text-urg-medFg' },
  aprovado:  { label: 'Resolvido', cls: 'bg-urg-lowBg  text-urg-lowFg' },
  rejeitado: { label: 'Rejeitado', cls: 'bg-surface-muted text-ink-muted' },
}

export function IncidenteStatusBadge({ status, className }: StatusProps) {
  const { label, cls } = statusCfg[status]
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium tracking-wide',
      cls, className,
    )}>
      {label}
    </span>
  )
}

/* ── Urgency badge ─────────────────────────────────────────────── */
export type UrgencyLevel = UrgenciaNivel   // re-export for convenience

/**
 * Derives a visual urgency from a raw record that may not yet have the
 * `urgencia` column (pre-migration rows). After migration, `urgencia` is
 * always present and takes precedence.
 */
export function urgencyFromIncidente(i: {
  status?: string
  tipo?: string
  urgencia?: string
}): UrgencyLevel {
  if (i.urgencia && ['baixa','media','alta'].includes(i.urgencia)) {
    return i.urgencia as UrgencyLevel
  }
  // Fallback derivation for old rows without the column
  if (i.status === 'aprovado') return 'baixa'
  const t = (i.tipo ?? '').toLowerCase()
  if (/reclama|qualidade|falta/.test(t)) return 'alta'
  if (/comportamento|atraso/.test(t))    return 'media'
  return 'baixa'
}

const urgencyStyles: Record<UrgencyLevel, string> = {
  baixa: 'bg-urg-lowBg  text-urg-lowFg',
  media: 'bg-urg-medBg  text-urg-medFg',
  alta:  'bg-urg-highBg text-urg-highFg',
}

export function UrgencyBadge({ level, className }: { level: UrgencyLevel; className?: string }) {
  const label: Record<UrgencyLevel, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' }
  return (
    <span className={cn(
      'inline-flex items-center justify-center w-[54px] px-2 py-0.5 rounded-md text-[11px] font-medium',
      urgencyStyles[level], className,
    )}>
      {label[level]}
    </span>
  )
}
