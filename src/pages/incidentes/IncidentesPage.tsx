import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIncidentes, FiltrosIncidente } from '@/hooks/useIncidentes'
import { IncidenteFilters } from '@/components/incidentes/IncidenteFilters'
import { IncidenteStatusBadge } from '@/components/incidentes/IncidenteStatusBadge'
import { NovoIncidenteDialog } from '@/components/incidentes/NovoIncidenteDialog'

const PAGE_SIZE = 20

export function IncidentesPage() {
  const navigate = useNavigate()
  const [filtros, setFiltros]     = useState<FiltrosIncidente>({})
  const [pagina, setPagina]       = useState(1)
  const [novoAberto, setNovoAberto] = useState(false)

  const { data: incidentes, isLoading } = useIncidentes(filtros)

  const total    = incidentes?.length ?? 0
  const inicio   = (pagina - 1) * PAGE_SIZE
  const paginas  = Math.ceil(total / PAGE_SIZE)
  const visiveis = incidentes?.slice(inicio, inicio + PAGE_SIZE) ?? []

  function handleFiltroChange(novoFiltro: FiltrosIncidente) {
    setFiltros(novoFiltro)
    setPagina(1)
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Incidentes</h1>
          <p className="text-sm text-white/40 mt-0.5">{total} registro{total !== 1 ? 's' : ''}</p>
        </div>
        <Button className="bg-king-red hover:bg-king-red/90 gap-2" onClick={() => setNovoAberto(true)}>
          <Plus className="h-4 w-4" /> Novo Incidente
        </Button>
      </div>

      <IncidenteFilters filtros={filtros} onChange={handleFiltroChange} />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-white/40">Carregando...</div>
      ) : visiveis.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-white/30">
          Nenhum incidente encontrado.
        </div>
      ) : (
        <div className="rounded-lg border border-king-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-king-card border-b border-king-border">
              <tr>
                <th className="text-left px-4 py-3 text-white/50 font-medium">Data</th>
                <th className="text-left px-4 py-3 text-white/50 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 text-white/50 font-medium">Professor</th>
                <th className="text-left px-4 py-3 text-white/50 font-medium hidden md:table-cell">Descrição</th>
                <th className="text-left px-4 py-3 text-white/50 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((inc, i) => (
                <tr
                  key={inc.id}
                  onClick={() => navigate(`/incidentes/${inc.id}`)}
                  className={`cursor-pointer hover:bg-white/5 transition-colors ${
                    i !== visiveis.length - 1 ? 'border-b border-king-border' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-white/60 whitespace-nowrap">
                    {new Date(inc.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-white/80">{inc.tipo}</td>
                  <td className="px-4 py-3 text-white/60">
                    {(inc as any).professores?.nome ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-white/50 hidden md:table-cell max-w-xs truncate">
                    {inc.descricao}
                  </td>
                  <td className="px-4 py-3">
                    <IncidenteStatusBadge status={inc.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-between text-sm text-white/40">
          <span>Página {pagina} de {paginas}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pagina === 1}
              onClick={() => setPagina(p => p - 1)}
              className="border-king-border text-white/60 hover:text-white">
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={pagina === paginas}
              onClick={() => setPagina(p => p + 1)}
              className="border-king-border text-white/60 hover:text-white">
              Próxima
            </Button>
          </div>
        </div>
      )}

      <NovoIncidenteDialog open={novoAberto} onOpenChange={setNovoAberto} />
    </div>
  )
}
