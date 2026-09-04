import { Check, CornerDownRight } from 'lucide-react'
import { type EtapaProjeto } from '@/hooks/useProjetos'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// O "fluxograma" que o TI pede, desenhado a partir das etapas.
//
// Ninguém desenha nada: a pessoa lista os passos em ordem no assistente e o
// diagrama sai daqui. Fluxo vertical porque é o único que cabe no celular sem
// rolagem lateral — e porque a leitura de cima para baixo já é a ordem.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  etapas: EtapaProjeto[]
  /** Mostra caixa de marcar — só faz sentido em projeto aprovado e em curso. */
  onAlternar?: (etapa: EtapaProjeto) => void
}

export function FluxogramaEtapas({ etapas, onAlternar }: Props) {
  if (etapas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-ink-subtle">
        Este projeto ainda não tem etapas listadas.
      </p>
    )
  }

  return (
    <ol className="space-y-0">
      {etapas.map((e, i) => {
        const ultimo = i === etapas.length - 1
        return (
          <li key={e.id} className="flex gap-3">
            {/* Trilho: bolinha numerada + linha até o próximo passo */}
            <div className="flex flex-col items-center">
              <span className={cn(
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1',
                e.concluida
                  ? 'bg-aviso-okBg text-aviso-okFg ring-aviso-okBd'
                  : 'bg-accentBlue-soft text-accentBlue ring-accentBlue/15',
              )}>
                {e.concluida ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {!ultimo && <span className="w-px flex-1 bg-line" aria-hidden />}
            </div>

            <div className={cn('min-w-0 flex-1', ultimo ? 'pb-0' : 'pb-4')}>
              <div className="flex items-start justify-between gap-2">
                <p className={cn(
                  'text-[13px] leading-snug',
                  e.concluida ? 'text-ink-muted line-through decoration-ink-subtle/40' : 'text-ink',
                )}>
                  {e.titulo}
                </p>
                {onAlternar && (
                  <label className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-ink-muted">
                    <input
                      type="checkbox"
                      checked={e.concluida}
                      onChange={() => onAlternar(e)}
                      className="h-3.5 w-3.5 accent-[color:var(--aviso-ok-fg)]"
                    />
                    feita
                  </label>
                )}
              </div>

              {e.detalhe && (
                <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">{e.detalhe}</p>
              )}
              {e.quem_faz && (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-muted">
                  <CornerDownRight className="h-3 w-3" />
                  {e.quem_faz}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Barra fina de progresso das etapas — usada nos cartões da fila. */
export function ProgressoEtapas({ total, feitas }: { total: number; feitas: number }) {
  if (total === 0) return null
  const pct = Math.round((feitas / total) * 100)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10.5px] text-ink-muted">
        <span>Etapas</span>
        <span className="tabular-nums">{feitas} de {total}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-subtle">
        <div
          className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-urg-lowFg' : 'bg-accentBlue')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
