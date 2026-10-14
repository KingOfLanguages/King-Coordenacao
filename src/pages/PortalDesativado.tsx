import { ArrowLeftRight, PauseCircle } from 'lucide-react'
import { BotaoWhatsApp, CartaoPortal, FundoPortal } from '@/components/portal/PortalUI'

// ─────────────────────────────────────────────────────────────────────────────
// Portais aposentados em 2026-10-14: /pausa e /transferencia. A pausa e a
// transferência de aluno passaram a ser feitas pela plataforma da King, então
// os formulários daqui saíram. O link continua respondendo (professor pode ter
// salvo) com um aviso e o WhatsApp da coordenação, em vez de cair no login.
// Os pedidos antigos seguem no banco (pausas, transferencias_aluno).
// ─────────────────────────────────────────────────────────────────────────────

const TEXTO = {
  pausa: {
    icone: PauseCircle,
    titulo: 'Pedido de pausa',
    corpo: 'Este formulário não é mais usado. Para pedir uma pausa, fale com a coordenação.',
    mensagem: 'Olá! Quero pedir uma pausa nas minhas aulas.',
  },
  transferencia: {
    icone: ArrowLeftRight,
    titulo: 'Transferência de aluno',
    corpo: 'Este formulário não é mais usado. Para pedir a transferência de um aluno, fale com a coordenação.',
    mensagem: 'Olá! Preciso pedir a transferência de um aluno.',
  },
} as const

export function PortalDesativado({ portal }: { portal: keyof typeof TEXTO }) {
  const t = TEXTO[portal]
  const Icone = t.icone
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface-app flex items-center justify-center p-6">
      <FundoPortal />
      <div className="relative z-10 w-full max-w-sm animate-fade-up">
        <CartaoPortal>
          <div className="flex flex-col items-center gap-3.5 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-subtle text-ink-muted shadow-inner-top">
              <Icone className="h-6 w-6" />
            </span>
            <div className="space-y-1.5">
              <span className="label-micro text-ink-muted">Portal do professor</span>
              <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">{t.titulo}</h1>
              <p className="text-[13.5px] text-ink-muted leading-relaxed">{t.corpo}</p>
            </div>
          </div>
          <BotaoWhatsApp mensagem={t.mensagem} />
        </CartaoPortal>
      </div>
    </div>
  )
}
