// ─────────────────────────────────────────────────────────────────────────────
// Peças visuais compartilhadas pelos portais PÚBLICOS do professor (/pausa,
// /welcome-path). São telas sem login, fora do AppLayout, e por isso não podem
// contar com nada do chrome do app — o visual precisa se sustentar sozinho.
//
// Nasceram inline em pages/pausas/Home.tsx; foram extraídas quando o Welcome
// Path passou a precisar exatamente do mesmo cabeçalho, cartão e botão.
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from 'lucide-react'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iniciais } from '@/lib/formato'
import { COORD_TELEFONE, COORD_WHATSAPP_NUM } from './contato'

export function CabecalhoPortal({
  titulo, descricao, icone: Icone,
}: {
  titulo: string
  descricao: string
  icone: LucideIcon
}) {
  return (
    <div className="space-y-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accentBlue-soft text-accentBlue shadow-inner-top">
        <Icone className="h-6 w-6" />
      </div>
      <div className="space-y-1.5">
        <span className="label-micro flex items-center gap-1.5 text-accentBlue">
          <span className="h-1.5 w-1.5 rounded-full bg-accentBlue" />
          Portal do professor
        </span>
        <h1 className="text-[1.85rem] font-bold tracking-[-0.03em] text-ink leading-tight">
          {titulo}
        </h1>
        <p className="text-[14px] text-ink-muted leading-relaxed">{descricao}</p>
      </div>
    </div>
  )
}

export function CartaoPortal({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[1.625rem] p-[1.5px] bg-surface-subtle border border-line-soft
                    shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]">
      <div className="rounded-[1.5rem] bg-surface-canvas px-6 py-7 space-y-5">
        {children}
      </div>
    </div>
  )
}

export function AvisoErro({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5
                    text-[12.5px] text-brand-strong font-medium">
      <p>{children}</p>
    </div>
  )
}

export function BotaoPrimario({
  pending, pendingLabel, children, type = 'submit', onClick,
}: {
  pending?: boolean
  pendingLabel?: string
  children: React.ReactNode
  type?: 'submit' | 'button'
  onClick?: () => void
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={pending}
      className={cn(
        'btn-press w-full h-11 rounded-full bg-ink text-ink-inverse',
        'flex items-center justify-center',
        'hover:bg-ink/90 disabled:opacity-60 disabled:cursor-not-allowed',
        'font-medium text-[13.5px]',
      )}
    >
      {pending ? (pendingLabel ?? 'Enviando…') : children}
    </button>
  )
}

/** Fundo com os dois halos de cor que identificam as telas públicas. */
export function FundoPortal() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        background: [
          'radial-gradient(ellipse 60% 50% at 15% 0%,   rgba(209,51,58,0.09),  transparent 55%)',
          'radial-gradient(ellipse 50% 40% at 90% 95%,  rgba(42,92,255,0.07),  transparent 60%)',
        ].join(','),
      }}
    />
  )
}

export function BotaoWhatsApp({ children }: { children?: React.ReactNode }) {
  return (
    <a
      href={`https://wa.me/${COORD_WHATSAPP_NUM}`}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-press flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand text-white text-[13.5px] font-medium hover:bg-brand-strong"
    >
      <MessageCircle className="h-4 w-4" />
      {children ?? `Falar com a coordenação (${COORD_TELEFONE})`}
    </a>
  )
}

/** Avatar redondo com as iniciais — abre as telas de "encontramos você". */
export function AvatarPortal({ nome }: { nome: string }) {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accentBlue-soft text-[19px] font-semibold text-accentBlue shadow-inner-top">
      {iniciais(nome)}
    </span>
  )
}
