import { Badge } from '@/components/ui/badge'

interface Props { status: 'pendente' | 'aprovado' | 'rejeitado' }

const config = {
  pendente:  { label: 'Pendente',  className: 'border-yellow-600 text-yellow-400' },
  aprovado:  { label: 'Aprovado',  className: 'border-green-600 text-green-400' },
  rejeitado: { label: 'Rejeitado', className: 'border-zinc-600 text-zinc-400' },
}

export function IncidenteStatusBadge({ status }: Props) {
  const { label, className } = config[status]
  return <Badge variant="outline" className={className}>{label}</Badge>
}
