import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProfessor, useAtualizarMonitoramento } from '@/hooks/useProfessores'
import { PrioridadeBadge } from '@/components/professores/PrioridadeBadge'
import { StatusBadge } from '@/components/professores/StatusBadge'
import { NovaObservacaoDialog } from '@/components/professores/NovaObservacaoDialog'
import { cn } from '@/lib/utils'

const labelTipo: Record<string, string> = {
  reuniao:           'Reunião',
  ocorrencia:        'Ocorrência',
  feedback_positivo: 'Feedback positivo',
  feedback_negativo: 'Feedback negativo',
}

const toneTipo: Record<string, string> = {
  reuniao:           'bg-accentBlue-soft text-accentBlue',
  ocorrencia:        'bg-urg-medBg text-urg-medFg',
  feedback_positivo: 'bg-urg-lowBg text-urg-lowFg',
  feedback_negativo: 'bg-urg-highBg text-urg-highFg',
}

type ReuniaoRow = { id: string; data: string; status: 'pendente' | 'concluida' | 'cancelada' }
type ObservacaoRow = { id: string; tipo: string; texto: string; created_at: string }

export function ProfessorDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: professor, isLoading } = useProfessor(id!)
  const atualizarMonitoramento = useAtualizarMonitoramento()
  const [obsAberta, setObsAberta] = useState(false)

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center text-ink-muted">Carregando…</div>
  )
  if (!professor) return (
    <div className="flex h-64 items-center justify-center text-ink-muted">Professor não encontrado.</div>
  )

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/professores')}
          className="btn-press text-ink-secondary hover:text-ink hover:bg-surface-subtle">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{professor.nome}</h1>
            <PrioridadeBadge professor={professor} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-ink-muted">
            {professor.tempo_na_king && <span>{professor.tempo_na_king} na King</span>}
            {professor.renda && <span>· {professor.renda}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="btn-press border-line text-ink-secondary hover:text-ink gap-1.5"
            onClick={() => atualizarMonitoramento.mutate({
              id: professor.id,
              monitoramento: !professor.monitoramento,
            })}
          >
            {professor.monitoramento
              ? <><EyeOff className="h-3.5 w-3.5" />Sair de monitoramento</>
              : <><Eye className="h-3.5 w-3.5" />Monitoramento</>
            }
          </Button>
          <Button
            size="sm"
            className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white gap-1.5"
            onClick={() => setObsAberta(true)}
          >
            <Plus className="h-3.5 w-3.5" />Observação
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-surface p-5 space-y-4">
          <h2 className="label-micro">Reuniões</h2>
          {(!professor.reunioes || professor.reunioes.length === 0) ? (
            <p className="text-[13px] text-ink-muted">Nenhuma reunião registrada.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {(professor.reunioes as ReuniaoRow[]).slice(0, 8).map(r => (
                <li key={r.id} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="text-ink tabular-nums">
                    {new Date(r.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-surface p-5 space-y-4">
          <h2 className="label-micro">Observações</h2>
          {(!professor.observacoes || professor.observacoes.length === 0) ? (
            <p className="text-[13px] text-ink-muted">Nenhuma observação registrada.</p>
          ) : (
            <ul className="space-y-3">
              {(professor.observacoes as ObservacaoRow[]).slice(0, 6).map(o => (
                <li key={o.id} className="space-y-1.5 border-l-2 border-line pl-3 py-0.5">
                  <div className="flex items-center gap-2">
                    <span className={cn('inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium', toneTipo[o.tipo] ?? 'bg-surface-subtle text-ink-muted')}>
                      {labelTipo[o.tipo] ?? o.tipo}
                    </span>
                    <span className="text-[11px] text-ink-subtle tabular-nums">
                      {new Date(o.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-[13px] text-ink-secondary leading-relaxed">{o.texto}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <NovaObservacaoDialog
        open={obsAberta}
        onOpenChange={setObsAberta}
        professorId={professor.id}
      />
    </div>
  )
}
