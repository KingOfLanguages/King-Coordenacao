import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useObservacao, useResolverObservacao } from '@/hooks/useObservacoes'
import { ObservacaoSnapshotDetalhe } from '@/components/professores/ObservacaoSnapshotDetalhe'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { labelTipo, borderTipo, chipTipo } from '@/lib/observacaoLabels'

export function ObservacaoDetalhePage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: observacao, isLoading } = useObservacao(id)
  const resolverObservacao = useResolverObservacao()
  const { profile } = useAuth()
  const podeEditar = canEdit(profile)

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center text-ink-muted text-[13px]">
      Carregando…
    </div>
  )
  if (!observacao) return (
    <div className="flex h-64 items-center justify-center text-ink-muted text-[13px]">
      Observação não encontrada.
    </div>
  )

  return (
    <div className="px-6 py-6 space-y-6 max-w-[800px] mx-auto">
      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost" size="icon"
          onClick={() => navigate(-1)}
          className="btn-press text-ink-secondary hover:text-ink hover:bg-surface-subtle mt-0.5"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={cn(
              'inline-flex px-2.5 py-1 rounded-md text-[12px] font-medium',
              chipTipo[observacao.tipo] ?? 'bg-surface-subtle text-ink-muted',
            )}>
              {labelTipo[observacao.tipo] ?? observacao.tipo}
            </span>
            {observacao.professor && (
              <Link
                to={`/professores/${observacao.professor.id}`}
                className="text-[13px] text-accentBlue font-medium hover:underline"
              >
                {observacao.professor.nome}
              </Link>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
            {observacao.autor && <span>Registrado por {observacao.autor.nome}</span>}
            <span>{new Date(observacao.created_at).toLocaleString('pt-BR')}</span>
          </div>
        </div>
      </div>

      {/* ── Texto ── */}
      <section className={cn(
        'card-surface p-5 space-y-2 border-l-2',
        borderTipo[observacao.tipo] ?? 'border-line',
      )}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="label-micro">Observação</h2>
          {observacao.tipo === 'ocorrencia' && (
            <div className="flex items-center gap-2">
              <span className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                observacao.resolvido ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-urg-highBg text-urg-highFg',
              )}>
                {observacao.resolvido ? 'Resolvida' : 'Em aberto'}
              </span>
              {podeEditar && (
                <button
                  onClick={() => resolverObservacao.mutate({ id: observacao.id, resolvido: !observacao.resolvido })}
                  disabled={resolverObservacao.isPending}
                  className="btn-press text-[11px] text-accentBlue font-medium"
                >
                  {observacao.resolvido ? 'Reabrir' : 'Marcar como resolvida'}
                </button>
              )}
            </div>
          )}
        </div>
        <p className="text-[13px] text-ink-secondary leading-relaxed whitespace-pre-wrap">
          {observacao.texto}
        </p>
      </section>

      {/* ── Contexto no momento ── */}
      <section className="card-surface p-5 space-y-3">
        <h2 className="label-micro">Contexto no momento</h2>
        {observacao.snapshot ? (
          <ObservacaoSnapshotDetalhe snapshot={observacao.snapshot} />
        ) : (
          <p className="text-[13px] text-ink-muted">
            Sem dados de contexto — esta observação foi criada antes da captura automática.
          </p>
        )}
      </section>
    </div>
  )
}
