import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Abas em pílula — o padrão visual que a plataforma já usava à mão em ~10 telas
// (fundo surface-subtle, aba ativa em surface-canvas com sombra). Nasceu na
// consolidação de telas de 2026-09: várias páginas viraram abas de uma página
// só, e cada uma repetia o mesmo markup com pequenas diferenças.
// ─────────────────────────────────────────────────────────────────────────────

export interface AbaDef<T extends string> {
  id: T
  label: string
  /** Contador ao lado do rótulo (omitido quando undefined). */
  n?: number
  /** Contador em destaque (algo pedindo ação: novos, atrasados). */
  alerta?: boolean
}

interface Props<T extends string> {
  abas: AbaDef<T>[]
  valor: T
  onChange: (id: T) => void
  className?: string
  /** Rótulo acessível do grupo. */
  ariaLabel?: string
}

export function Abas<T extends string>({ abas, valor, onChange, className, ariaLabel }: Props<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full bg-surface-subtle p-1', className)}>
      {abas.map(a => {
        const ativa = a.id === valor
        return (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={ativa}
            onClick={() => onChange(a.id)}
            className={cn(
              'btn-press whitespace-nowrap rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-all duration-200',
              ativa ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
            )}
          >
            {a.label}
            {a.n !== undefined && (
              a.alerta && a.n > 0
                ? <span className="ml-1.5 rounded-full bg-accentBlue px-1.5 text-[10px] font-semibold text-white tabular-nums">{a.n}</span>
                : <span className="ml-1 text-ink-muted tabular-nums">{a.n}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
