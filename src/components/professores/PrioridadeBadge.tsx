import { Badge } from '@/components/ui/badge'
import type { Professor } from '@/types'

interface Props { professor: Professor }

export function PrioridadeBadge({ professor }: Props) {
  if (professor.saiu)
    return <Badge variant="outline" className="border-zinc-600 text-zinc-400">Saiu</Badge>
  if (professor.pausa)
    return <Badge variant="outline" className="border-yellow-600 text-yellow-400">Pausa</Badge>
  if (professor.monitoramento)
    return <Badge className="bg-king-red/20 text-king-red border border-king-red/30">Monitoramento</Badge>
  return <Badge variant="outline" className="border-green-600 text-green-400">Ativo</Badge>
}
