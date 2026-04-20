import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { FiltrosIncidente } from '@/hooks/useIncidentes'

interface Props {
  filtros: FiltrosIncidente
  onChange: (f: FiltrosIncidente) => void
}

const TIPOS = ['Comportamento', 'Atraso', 'Falta', 'Qualidade de Aula', 'Reclamação', 'Outro']

export function IncidenteFilters({ filtros, onChange }: Props) {
  const temFiltro = filtros.status || filtros.tipo || filtros.busca || filtros.dataInicio

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <Input
          placeholder="Buscar na descrição..."
          value={filtros.busca ?? ''}
          onChange={e => onChange({ ...filtros, busca: e.target.value || undefined })}
          className="pl-9 bg-king-card border-king-border text-white placeholder:text-white/30"
        />
      </div>

      <Select
        value={filtros.status ?? 'todos'}
        onValueChange={v => onChange({ ...filtros, status: v === 'todos' ? undefined : v })}
      >
        <SelectTrigger className="w-36 bg-king-card border-king-border text-white">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent className="bg-king-card border-king-border text-white">
          <SelectItem value="todos">Todos</SelectItem>
          <SelectItem value="pendente">Pendente</SelectItem>
          <SelectItem value="aprovado">Aprovado</SelectItem>
          <SelectItem value="rejeitado">Rejeitado</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filtros.tipo ?? 'todos'}
        onValueChange={v => onChange({ ...filtros, tipo: v === 'todos' ? undefined : v })}
      >
        <SelectTrigger className="w-44 bg-king-card border-king-border text-white">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent className="bg-king-card border-king-border text-white">
          <SelectItem value="todos">Todos os tipos</SelectItem>
          {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
        </SelectContent>
      </Select>

      <Input
        type="date"
        value={filtros.dataInicio ?? ''}
        onChange={e => onChange({ ...filtros, dataInicio: e.target.value || undefined })}
        className="w-40 bg-king-card border-king-border text-white"
      />

      {temFiltro && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({})}
          className="text-white/40 hover:text-white gap-1"
        >
          <X className="h-3 w-3" /> Limpar
        </Button>
      )}
    </div>
  )
}
