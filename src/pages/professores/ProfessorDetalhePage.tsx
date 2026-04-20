import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useProfessor, useAtualizarMonitoramento } from '@/hooks/useProfessores'
import { PrioridadeBadge } from '@/components/professores/PrioridadeBadge'
import { StatusBadge } from '@/components/professores/StatusBadge'
import { NovaObservacaoDialog } from '@/components/professores/NovaObservacaoDialog'

const labelTipo: Record<string, string> = {
  reuniao:           'Reunião',
  ocorrencia:        'Ocorrência',
  feedback_positivo: 'Feedback Positivo',
  feedback_negativo: 'Feedback Negativo',
}

const corTipo: Record<string, string> = {
  reuniao:           'text-blue-400 border-blue-600',
  ocorrencia:        'text-yellow-400 border-yellow-600',
  feedback_positivo: 'text-green-400 border-green-600',
  feedback_negativo: 'text-king-red border-king-red/50',
}

export function ProfessorDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: professor, isLoading } = useProfessor(id!)
  const atualizarMonitoramento = useAtualizarMonitoramento()
  const [obsAberta, setObsAberta] = useState(false)

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center text-white/50">Carregando...</div>
  )
  if (!professor) return (
    <div className="flex h-64 items-center justify-center text-white/50">Professor não encontrado.</div>
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/professores')}
          className="text-white/50 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{professor.nome}</h1>
            <PrioridadeBadge professor={professor} />
          </div>
          <div className="flex gap-4 mt-1 text-sm text-white/40">
            {professor.tempo_na_king && <span>{professor.tempo_na_king} na King</span>}
            {professor.renda && <span>{professor.renda}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-king-border text-white/70 hover:text-white"
            onClick={() => atualizarMonitoramento.mutate({
              id: professor.id,
              monitoramento: !professor.monitoramento,
            })}
          >
            {professor.monitoramento ? 'Remover monitoramento' : 'Colocar em monitoramento'}
          </Button>
          <Button size="sm" className="bg-king-red hover:bg-king-red/90" onClick={() => setObsAberta(true)}>
            <Plus className="h-4 w-4 mr-1" /> Observação
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-king-card border-king-border p-4 space-y-3">
          <h2 className="font-semibold text-white">Reuniões</h2>
          {(!professor.reunioes || professor.reunioes.length === 0) && (
            <p className="text-sm text-white/40">Nenhuma reunião registrada.</p>
          )}
          <div className="space-y-2">
            {professor.reunioes?.slice(0, 8).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-white/70">
                  {new Date(r.data).toLocaleDateString('pt-BR')}
                </span>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-king-card border-king-border p-4 space-y-3">
          <h2 className="font-semibold text-white">Observações</h2>
          {(!professor.observacoes || professor.observacoes.length === 0) && (
            <p className="text-sm text-white/40">Nenhuma observação registrada.</p>
          )}
          <div className="space-y-3">
            {professor.observacoes?.slice(0, 6).map((o: any) => (
              <div key={o.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-xs ${corTipo[o.tipo]}`}>
                    {labelTipo[o.tipo]}
                  </Badge>
                  <span className="text-xs text-white/30">
                    {new Date(o.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <p className="text-sm text-white/70">{o.texto}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <NovaObservacaoDialog
        open={obsAberta}
        onOpenChange={setObsAberta}
        professorId={professor.id}
      />
    </div>
  )
}
