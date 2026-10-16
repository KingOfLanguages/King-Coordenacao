// ─────────────────────────────────────────────────────────────────────────────
// King's Circle (20260802): o grupo/comunidade oficial de professores da King.
// Membro ganha o selo VIP aqui na equipe (ficha e lista) e as boas-vindas nos
// portais do professor (`BoasVindasKingsCircle`). Quem liga e desliga é a
// equipe, pelo botão da ficha.
//
// As cores são as do emblema (azul-marinho e vermelho da King) e não mudam no
// tema escuro: o selo é uma marca, não um estado da interface.
// ─────────────────────────────────────────────────────────────────────────────

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const EMBLEMA_KINGS_CIRCLE = '/kings-circle.webp'

/** `alt=""` quando há texto ao lado dizendo "King's Circle" (selo, botão). */
export function EmblemaKingsCircle({ className, alt = "King's Circle" }: { className?: string; alt?: string }) {
  return (
    <img
      src={EMBLEMA_KINGS_CIRCLE}
      alt={alt}
      draggable={false}
      className={cn('select-none object-contain', className)}
    />
  )
}

/** Selo VIP: ao lado do nome, na ficha e nos portais. */
export function SeloKingsCircle({ desde, className }: { desde?: string | null; className?: string }) {
  return (
    <span
      title={desde
        ? `Membro do King's Circle desde ${new Date(desde).toLocaleDateString('pt-BR')}`
        : "Membro do King's Circle, a comunidade oficial de professores da King"}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-[#06113B] py-0.5 pl-0.5 pr-2.5',
        'text-[11px] font-semibold text-white ring-1 ring-[#D3012A]/70 shadow-sm',
        className,
      )}
    >
      <EmblemaKingsCircle alt="" className="h-5 w-5" />
      King's Circle
      <span className="rounded-sm bg-[#D3012A] px-1 text-[9px] font-bold leading-[14px] tracking-label">VIP</span>
    </span>
  )
}

/** Liga/desliga o selo na ficha do professor. */
export function BotaoKingsCircle({ ativo, pendente, onAlternar }: {
  ativo: boolean
  pendente: boolean
  onAlternar: () => void
}) {
  return (
    <Button
      variant="outline" size="sm"
      role="switch"
      aria-checked={ativo}
      disabled={pendente}
      onClick={onAlternar}
      title={ativo ? "Tirar o selo do King's Circle" : "Marcar como membro do King's Circle"}
      className={cn(
        'btn-press gap-2 pl-1.5',
        ativo
          ? 'border-[#D3012A]/40 text-ink hover:bg-[#D3012A]/5'
          : 'border-line text-ink-secondary hover:text-ink',
      )}
    >
      <EmblemaKingsCircle alt="" className={cn('size-5 transition-[filter,opacity]', !ativo && 'opacity-60 grayscale')} />
      King's Circle
      <span
        aria-hidden
        className={cn(
          'relative inline-block h-4 w-7 rounded-full transition-colors',
          ativo ? 'bg-[#D3012A]' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform',
            ativo && 'translate-x-3',
          )}
        />
      </span>
    </Button>
  )
}
