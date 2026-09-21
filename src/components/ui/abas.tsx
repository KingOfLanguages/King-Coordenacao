import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Abas em pílula — o padrão de troca de vista da plataforma (fundo
// surface-subtle, aba ativa em surface-canvas com sombra). Até 2026-09 cada tela
// desenhava a sua à mão, em três estilos (pílula, caixa com borda, sublinhado);
// todas as barras de troca de vista usam este componente agora.
//
// Não serve para escolher um VALOR dentro de formulário (natureza do incidente,
// modo do e-mail): lá o papel é de campo, não de navegação.
// ─────────────────────────────────────────────────────────────────────────────

export interface AbaDef<T extends string> {
  id: T
  label: string
  /** Ícone antes do rótulo (opcional). */
  icone?: LucideIcon
  /** Contador ao lado do rótulo (omitido quando undefined). */
  n?: number
  /** Contador em destaque (algo pedindo ação: novos, atrasados, a responder). */
  alerta?: boolean
}

interface Props<T extends string> {
  abas: AbaDef<T>[]
  valor: T
  onChange: (id: T) => void
  className?: string
  /** Rótulo acessível do grupo. */
  ariaLabel?: string
  /** 'sm' para abas dentro de outra aba ou em barras de filtro. */
  tamanho?: 'md' | 'sm'
}

export function Abas<T extends string>({ abas, valor, onChange, className, ariaLabel, tamanho = 'md' }: Props<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full bg-surface-subtle p-1', className)}>
      {abas.map(a => {
        const ativa = a.id === valor
        const Icone = a.icone
        return (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={ativa}
            onClick={() => onChange(a.id)}
            className={cn(
              'btn-press inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-all duration-200',
              tamanho === 'sm' ? 'px-3 py-1 text-[12px]' : 'px-4 py-1.5 text-[12.5px]',
              ativa ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
            )}
          >
            {Icone && <Icone className="h-3.5 w-3.5" />}
            {a.label}
            {a.n !== undefined && (
              a.alerta && a.n > 0
                ? <span className="rounded-full bg-accentBlue px-1.5 text-[10px] font-semibold text-white tabular-nums">{a.n}</span>
                : <span className="text-ink-muted tabular-nums">{a.n}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
