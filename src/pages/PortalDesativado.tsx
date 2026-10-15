import { ArrowLeftRight, ArrowUpRight, PauseCircle } from 'lucide-react'
import { CartaoPortal, FundoPortal } from '@/components/portal/PortalUI'
import { COORD_TELEFONE, COORD_WHATSAPP_NUM } from '@/components/portal/contato'

// ─────────────────────────────────────────────────────────────────────────────
// Portais aposentados em 2026-10-14: /pausa e /transferencia. A pausa e a
// transferência de aluno passaram a ser feitas pela plataforma da King, então
// os formulários daqui saíram. O link continua respondendo (professor pode ter
// salvo) e, desde 2026-10-15, leva direto à tela certa da plataforma da King:
// pausa em Histórico do Aluno → Solicitar pausa; transferência na aba
// Transferência de Alunos → Transferir. O WhatsApp da coordenação fica como
// saída para dúvida. Os pedidos antigos seguem no banco (pausas,
// transferencias_aluno).
// ─────────────────────────────────────────────────────────────────────────────

const PLATAFORMA_KING = 'https://app.kingmanagementsystem.com.br'

const TEXTO = {
  pausa: {
    icone: PauseCircle,
    titulo: 'Pedido de pausa',
    corpo: 'Este formulário não é mais usado. A pausa agora é pedida na plataforma da King:',
    passos: [
      <>Abra a aba <b className="font-semibold text-ink">Histórico do Aluno</b>.</>,
      <>Clique em <b className="font-semibold text-ink">Solicitar pausa</b>, no cartão do topo da tela.</>,
    ],
    destino: `${PLATAFORMA_KING}/professor`,
    mensagem: 'Olá! Tenho uma dúvida sobre o pedido de pausa.',
  },
  transferencia: {
    icone: ArrowLeftRight,
    titulo: 'Transferência de aluno',
    corpo: 'Este formulário não é mais usado. A transferência agora é pedida na plataforma da King:',
    passos: [
      <>Abra a aba <b className="font-semibold text-ink">Transferência de Alunos</b>.</>,
      <>Busque o aluno e clique em <b className="font-semibold text-ink">Transferir</b>.</>,
    ],
    destino: `${PLATAFORMA_KING}/transferencia-alunos`,
    mensagem: 'Olá! Tenho uma dúvida sobre a transferência de um aluno.',
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

          <ol className="space-y-2.5">
            {t.passos.map((passo, i) => (
              <li key={i} className="flex items-start gap-3 text-[13.5px] text-ink-muted leading-relaxed">
                <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accentBlue-soft text-[11px] font-semibold text-accentBlue">
                  {i + 1}
                </span>
                <span>{passo}</span>
              </li>
            ))}
          </ol>

          <div className="space-y-3">
            <a
              href={t.destino}
              className="btn-press flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-ink-inverse text-[13.5px] font-medium hover:bg-ink/90"
            >
              Abrir a plataforma da King
              <ArrowUpRight className="h-4 w-4" />
            </a>
            <a
              href={`https://wa.me/${COORD_WHATSAPP_NUM}?text=${encodeURIComponent(t.mensagem)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-[12.5px] text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Dúvidas? Fale com a coordenação ({COORD_TELEFONE})
            </a>
          </div>
        </CartaoPortal>
      </div>
    </div>
  )
}
