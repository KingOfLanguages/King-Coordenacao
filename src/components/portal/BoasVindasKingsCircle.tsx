import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { EmblemaKingsCircle } from '@/components/professores/KingsCircle'

// ─────────────────────────────────────────────────────────────────────────────
// Boas-vindas ao membro do King's Circle (20260802). Pedido do João: o selo
// aparece toda vez que o professor do King's Circle entra num portal nosso
// (/agendar, /welcome-path). "Toda vez" = a cada visita: abre quando o portal
// descobre quem é o professor e não volta enquanto ele navega na mesma visita
// (abrir etapas da trilha, voltar para a lista). Recarregou ou entrou de novo,
// aparece de novo. Trocar de professor no mesmo aparelho também reabre.
// ─────────────────────────────────────────────────────────────────────────────

type ProfessorDoPortal = { id: string; nome: string; kingsCircle?: boolean }

export function BoasVindasKingsCircle({ professor }: { professor: ProfessorDoPortal | null | undefined }) {
  const [recebido, setRecebido] = useState<string | null>(null)
  const aberto = !!professor?.kingsCircle && recebido !== professor.id
  if (!professor) return null
  const primeiroNome = professor.nome.trim().split(/\s+/)[0]

  return (
    <Dialog open={aberto} onOpenChange={abrir => { if (!abrir) setRecebido(professor.id) }}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-3xl bg-surface-canvas p-0 text-ink ring-1 ring-[#D3012A]/25 sm:max-w-[400px]"
      >
        {/* Faixa do emblema */}
        <div className="relative flex flex-col items-center overflow-hidden bg-[#06113B] px-6 pb-6 pt-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(60% 55% at 50% 42%, rgba(211,1,42,0.38) 0%, rgba(6,17,59,0) 72%)' }}
          />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#D3012A] to-transparent" />
          <EmblemaKingsCircle alt="Emblema do King's Circle" className="relative h-36 w-36 drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)] animate-spring-in motion-reduce:animate-none" />
          <span className="relative mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-label text-white/85">
            <span className="h-1.5 w-1.5 rounded-full bg-[#D3012A]" />
            Membro VIP
          </span>
        </div>

        <div className="space-y-5 px-6 pb-6 pt-5 text-center animate-float-up motion-reduce:animate-none">
          <div className="space-y-2">
            <DialogTitle className="text-[1.55rem] font-bold leading-tight tracking-[-0.03em] text-ink">
              Boas-vindas, {primeiroNome}!
            </DialogTitle>
            <DialogDescription className="text-[14px] leading-relaxed text-ink-muted">
              Você faz parte do <strong className="font-semibold text-ink">King's Circle</strong>, a
              comunidade oficial de professores da King. É muito bom ter você aqui.
            </DialogDescription>
          </div>
          <button
            type="button"
            autoFocus
            onClick={() => setRecebido(professor.id)}
            className="btn-press h-11 w-full rounded-xl bg-[#D3012A] text-[14px] font-semibold text-white shadow-[0_6px_18px_-6px_rgba(211,1,42,0.6)] transition-colors hover:bg-[#B80125] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D3012A]/40 focus-visible:ring-offset-2"
          >
            Continuar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
