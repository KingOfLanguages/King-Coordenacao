import { Badge } from '@/components/ui/badge'

interface Props { status: 'pendente' | 'concluida' | 'cancelada' }

const config = {
  pendente:  { label: 'Pendente',  className: 'border-yellow-600 text-yellow-400' },
  concluida: { label: 'Concluída', className: 'border-green-600 text-green-400' },
  cancelada: { label: 'Cancelada', className: 'border-zinc-600 text-zinc-400' },
}

export function StatusBadge({ status }: Props) {
  const { label, className } = config[status]
  return <Badge variant="outline" className={className}>{label}</Badge>
}
