import { Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { linkWelcomePathPublico } from '@/lib/portal'

// ─────────────────────────────────────────────────────────────────────────────
// O link público da trilha, mostrado por extenso.
//
// Um botão "Copiar link" sozinho esconde uma pegadinha: o link aponta para o
// domínio de PRODUÇÃO de propósito (ver src/lib/portal.ts — não pode herdar a
// URL de preview da Vercel nem localhost). Rodando local, quem clica cai no
// login da produção e acha que quebrou. Mostrar a URL deixa isso óbvio.
// ─────────────────────────────────────────────────────────────────────────────

export function LinkTrilha() {
  const url = linkWelcomePathPublico()
  const [copiado, setCopiado] = useState(false)

  function copiar() {
    navigator.clipboard.writeText(url)
      .then(() => {
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2000)
        toast.success('Link da trilha copiado')
      })
      .catch(() => toast.error('Não foi possível copiar.'))
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-surface-canvas py-1 pl-3 pr-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir a trilha como o professor vê"
        className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-secondary hover:text-ink"
      >
        <span className="truncate">{url.replace(/^https?:\/\//, '')}</span>
        <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
      </a>
      <button
        type="button"
        onClick={copiar}
        title="Copiar link"
        className={cn(
          'btn-press flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors',
          copiado ? 'text-urg-lowFg' : 'text-ink-muted hover:bg-surface-subtle hover:text-ink',
        )}
      >
        {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
