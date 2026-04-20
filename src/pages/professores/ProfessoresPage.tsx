import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useProfessoresAtivos } from '@/hooks/useProfessores'
import { PrioridadeBadge } from '@/components/professores/PrioridadeBadge'
import type { Professor } from '@/types'

export function ProfessoresPage() {
  const { data: professores, isLoading } = useProfessoresAtivos()
  const [busca, setBusca] = useState('')
  const navigate = useNavigate()

  const filtrados = professores?.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase())
  ) ?? []

  const emMonitoramento = filtrados.filter(p => p.monitoramento)
  const demais          = filtrados.filter(p => !p.monitoramento)

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center text-white/50">
      Carregando professores...
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Professores</h1>
        <span className="text-sm text-white/50">{filtrados.length} professores</span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <Input
          placeholder="Buscar professor..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="pl-9 bg-king-card border-king-border text-white placeholder:text-white/30"
        />
      </div>

      {emMonitoramento.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-king-red">
            <AlertCircle className="h-4 w-4" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Em Monitoramento</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {emMonitoramento.map(p => (
              <CardProfessor key={p.id} professor={p} onClick={() => navigate(`/professores/${p.id}`)} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">Todos</h2>
        {demais.length === 0 && (
          <p className="text-sm text-white/30 py-4">Nenhum professor encontrado.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {demais.map(p => (
            <CardProfessor key={p.id} professor={p} onClick={() => navigate(`/professores/${p.id}`)} />
          ))}
        </div>
      </section>
    </div>
  )
}

function CardProfessor({ professor, onClick }: { professor: Professor; onClick: () => void }) {
  return (
    <Card
      onClick={onClick}
      className="cursor-pointer bg-king-card border-king-border p-4 hover:border-king-red/50 transition-colors space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-white leading-tight">{professor.nome}</p>
        <PrioridadeBadge professor={professor} />
      </div>
      <div className="flex gap-4 text-xs text-white/40">
        {professor.tempo_na_king && <span>{professor.tempo_na_king}</span>}
        {professor.data_ultima_reuniao && (
          <span>Última reunião: {new Date(professor.data_ultima_reuniao).toLocaleDateString('pt-BR')}</span>
        )}
      </div>
    </Card>
  )
}
