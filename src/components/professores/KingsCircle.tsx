// ─────────────────────────────────────────────────────────────────────────────
// King's Circle (20260802): o grupo/comunidade oficial de professores da King.
// Membro ganha o selo VIP aqui na equipe (ficha e lista) e as boas-vindas nos
// portais do professor (`BoasVindasKingsCircle`). Quem liga e desliga é a
// equipe, pelo botão da ficha.
//
// O selo segue as artes oficiais ("Badge VIP", 23/10): a versão Sólida, com
// gradiente azul→vermelho, coroa e texto brancos e "VIP" branco com letra
// vermelha, em Poppins. Fica igual nos dois temas: é uma marca, não um estado da
// interface. Onde não cabe a pílula (card da lista, botão) entra a medalha, o
// círculo com a coroa das mesmas artes.
//
// Das artes ficaram de fora aqui: a versão sem "VIP", que na plataforma da King
// marca quem chegou à patente King's Circle por XP (a equipe não tem XP), e a
// coroa no avatar, porque a equipe não mostra foto de professor. As duas foram
// no projeto que levou o selo para a plataforma (TI da King, 26/10).
// ─────────────────────────────────────────────────────────────────────────────

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const EMBLEMA_KINGS_CIRCLE = '/kings-circle.webp'

/** O emblema do leão: só nas boas-vindas dos portais. O selo usa a coroa. */
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

/** A coroa das artes oficiais; a cor vem do `currentColor`. */
function Coroa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn('flex-none', className)}>
      <path d="M2.5 7.5 7 11.5 12 4l5 7.5 4.5-4L19.5 17h-15z" />
      <rect x="4.5" y="18.3" width="15" height="2.2" rx="1.1" />
    </svg>
  )
}

/** Selo VIP: ao lado do nome, na ficha e nos portais. */
export function SeloKingsCircle({ desde, className }: { desde?: string | null; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Membro VIP do King's Circle"
      title={desde
        ? `Membro do King's Circle desde ${new Date(desde).toLocaleDateString('pt-BR')}`
        : "Membro do King's Circle, a comunidade oficial de professores da King"}
      // A fonte vai no style: o cn() lê `font-[...]` como peso e descarta a classe.
      style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}
      className={cn(
        'inline-flex h-[26px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full pl-2 pr-1 align-middle',
        'text-[12.5px] font-semibold leading-none tracking-[.005em] text-white',
        'bg-[linear-gradient(90deg,#005eb2,#cc213a)]',
        'shadow-[inset_0_1px_0_rgba(255,255,255,.22),0_2px_10px_-2px_rgba(204,33,58,.45)]',
        className,
      )}
    >
      <Coroa className="size-[15px]" />
      King's Circle
      <span className="ml-0.5 inline-grid h-[18px] place-items-center rounded-full bg-white px-1.5 text-[9.5px] font-extrabold tracking-[.1em] text-[#cc213a]">
        VIP
      </span>
    </span>
  )
}

/** Medalha: a marca compacta, onde a pílula não cabe. `decorativa` quando há
 *  texto ao lado dizendo "King's Circle". */
export function MedalhaKingsCircle({ className, decorativa }: { className?: string; decorativa?: boolean }) {
  return (
    <span
      {...(decorativa
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': "Membro VIP do King's Circle", title: "Membro VIP do King's Circle" })}
      className={cn(
        'grid size-5 flex-none place-items-center rounded-full text-white',
        'bg-[linear-gradient(135deg,#2b8fd6_0%,#005eb2_32%,#cc213a_100%)]',
        className,
      )}
    >
      <Coroa className="size-[60%]" />
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
          ? 'border-[#cc213a]/40 text-ink hover:bg-[#cc213a]/5'
          : 'border-line text-ink-secondary hover:text-ink',
      )}
    >
      <MedalhaKingsCircle decorativa className={cn('transition-[filter,opacity]', !ativo && 'opacity-60 grayscale')} />
      King's Circle
      <span
        aria-hidden
        className={cn(
          'relative inline-block h-4 w-7 rounded-full transition-colors',
          ativo ? 'bg-[linear-gradient(90deg,#005eb2,#cc213a)]' : 'bg-line-strong',
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
