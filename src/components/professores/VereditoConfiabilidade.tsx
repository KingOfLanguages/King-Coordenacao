import { Link } from 'react-router-dom'
import { ShieldCheck, ArrowRight } from 'lucide-react'
import { useConfiabilidadeProfessor } from '@/hooks/useConfiabilidade'
import { useCanView } from '@/hooks/usePagePermissions'
import { VEREDITO_META, JANELA_DIAS } from '@/lib/confiabilidade'
import { cn } from '@/lib/utils'

/**
 * Veredito de confiabilidade na Visão geral do professor. A tela
 * /confiabilidade continua sendo a do Comercial (uma pergunta, uma resposta);
 * para a coordenação, que já está na ficha do professor, bastava o veredito
 * aqui com um atalho para os sinais que o produziram.
 */
export function VereditoConfiabilidade({ professorId }: { professorId: string }) {
  const { canView } = useCanView()
  const { data, isLoading } = useConfiabilidadeProfessor(professorId)

  if (isLoading) return <div className="h-[74px] animate-pulse rounded-xl bg-surface-subtle" />
  if (!data) return null

  const { veredito, alertas } = data.diagnostico
  const meta = VEREDITO_META[veredito]

  return (
    <section className="card-surface relative overflow-hidden p-4 pl-5">
      <span className={cn('absolute inset-y-0 left-0 w-1', meta.barraClass)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="label-micro flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />Confiabilidade · últimos {JANELA_DIAS} dias
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-semibold', meta.tagClass)}>{meta.titulo}</span>
            <span className="text-[12.5px] text-ink-secondary">{meta.resumo}</span>
          </div>
          {alertas.length > 0 && (
            <p className="text-[11.5px] text-ink-muted">
              {alertas.length} sinal{alertas.length > 1 ? 'is' : ''} no período: {alertas.slice(0, 3).map(a => a.titulo).join(' · ')}
              {alertas.length > 3 && ' · …'}
            </p>
          )}
        </div>
        {canView('confiabilidade') && (
          <Link
            to={`/confiabilidade?professor=${professorId}`}
            className="btn-press inline-flex flex-shrink-0 items-center gap-1 text-[12px] font-medium text-accentBlue hover:underline"
          >
            Ver os sinais <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </section>
  )
}
