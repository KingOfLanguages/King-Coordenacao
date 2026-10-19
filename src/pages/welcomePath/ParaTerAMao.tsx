import { useState } from 'react'
import { BookOpen, Download, Loader2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { BotaoWhatsApp, NumeroCoordenacao } from '@/components/portal/PortalUI'

// ─────────────────────────────────────────────────────────────────────────────
// "Para ter à mão", no topo da trilha (19/10/2026): o número da coordenação
// escrito e o MAPA em PDF para baixar. São as duas coisas que o professor novo
// precisa guardar desde o primeiro dia, e o guia que o RH envia aponta para cá.
//
// O MAPA mora num bucket privado: o clique pede à portal-welcome-path um link
// assinado, que só sai para quem tem sessão. Na Visão do professor (/onboarding)
// não há sessão, então o botão aparece desligado.
// ─────────────────────────────────────────────────────────────────────────────

export function ParaTerAMao({ onBaixarMapa }: { onBaixarMapa?: () => Promise<void> }) {
  const [baixando, setBaixando] = useState(false)

  async function baixar() {
    if (!onBaixarMapa || baixando) return
    setBaixando(true)
    try {
      await onBaixarMapa()
    } catch {
      toast.error('Não foi possível baixar o MAPA agora. Tente de novo em instantes.')
    } finally {
      setBaixando(false)
    }
  }

  return (
    <section aria-label="Para ter à mão" className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-3.5 rounded-2xl border border-line-soft bg-surface-canvas px-5 py-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-ink-muted" />
          <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">Coordenação de professores</h2>
        </div>
        <NumeroCoordenacao />
        <p className="text-[12px] leading-relaxed text-ink-muted">
          Dúvidas, imprevistos e avisos sobre alunos vão por aqui. Salve o número no seu celular.
        </p>
        <div className="mt-auto">
          <BotaoWhatsApp>Abrir conversa no WhatsApp</BotaoWhatsApp>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 rounded-2xl border border-line-soft bg-surface-canvas px-5 py-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-ink-muted" />
          <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">MAPA em PDF</h2>
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-secondary">
          O manual de procedimentos da King: todas as regras de aula, reposição, pausa e pagamento.
          Baixe e guarde com você.
        </p>
        <p className="text-[12px] leading-relaxed text-ink-muted">
          É o mesmo conteúdo de Materiais, na plataforma da King.
        </p>
        <button
          type="button"
          onClick={baixar}
          disabled={!onBaixarMapa || baixando}
          title={onBaixarMapa ? undefined : 'Na trilha do professor, este botão baixa o MAPA.'}
          className="btn-press mt-auto flex h-11 w-full items-center justify-center gap-2 rounded-full border border-line-soft text-[13.5px] font-medium text-ink hover:bg-surface-subtle disabled:cursor-default disabled:opacity-60"
        >
          {baixando
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparando…</>
            : <><Download className="h-4 w-4" /> Baixar o MAPA</>}
        </button>
      </div>
    </section>
  )
}
