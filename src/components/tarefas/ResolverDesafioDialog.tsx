import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Concluir a tarefa de um desafio = resolver o incidente, que pede a solução. */
export function ResolverDesafioDialog({
  pending, onCancel, onConfirm,
}: {
  pending: boolean
  onCancel: () => void
  onConfirm: (solucao: string) => void
}) {
  const [solucao, setSolucao] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-surface-canvas border border-line rounded-xl shadow-elevated w-full max-w-md mx-4 p-6 space-y-4 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">Resolver desafio</h2>
          <button onClick={onCancel} aria-label="Fechar" className="btn-press text-ink-subtle hover:text-ink-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[12.5px] text-ink-muted">
          Concluir a tarefa também marca o desafio como resolvido. Descreva como foi resolvido.
        </p>
        <textarea
          placeholder="Solução / resultado…"
          value={solucao}
          onChange={e => setSolucao(e.target.value)}
          rows={4}
          autoFocus
          className="w-full rounded-md bg-surface-canvas border border-line px-3 py-2 text-[13px] text-ink resize-none focus:outline-none focus:ring-2 focus:ring-accentBlue/30"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-ink-secondary">Cancelar</Button>
          <Button
            size="sm"
            disabled={pending || !solucao.trim()}
            onClick={() => onConfirm(solucao)}
            className="btn-press bg-urg-lowFg text-white hover:opacity-90"
          >
            {pending ? 'Resolvendo…' : 'Resolver e concluir'}
          </Button>
        </div>
      </div>
    </div>
  )
}
