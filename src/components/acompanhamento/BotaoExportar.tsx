import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/** "Exportar Excel" das abas de Acompanhamento: baixa o que a lista mostra, com os filtros aplicados. */
export function BotaoExportar({ total, onExportar, className }: {
  /** Linhas que vão para a planilha — 0 desabilita. */
  total: number
  onExportar: () => Promise<void>
  className?: string
}) {
  const [gerando, setGerando] = useState(false)

  async function clicar() {
    setGerando(true)
    try {
      await onExportar()
    } catch {
      toast.error('Não consegui gerar a planilha. Tente de novo.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <button
      type="button"
      onClick={clicar}
      disabled={gerando || total === 0}
      title={total === 0 ? 'Nada para exportar neste filtro.' : `Baixar ${total === 1 ? 'a linha' : `as ${total} linhas`} da lista em Excel (.xlsx), com os filtros aplicados.`}
      className={cn(
        'btn-press inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-canvas px-3 py-1.5 text-[12.5px] font-medium text-ink-secondary hover:text-ink transition-colors disabled:opacity-50',
        className,
      )}
    >
      {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      Exportar Excel
    </button>
  )
}
