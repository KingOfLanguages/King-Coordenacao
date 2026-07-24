import { useState } from 'react'
import { toast } from 'sonner'
import { NotebookPen, X, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMinhaAnotacao, useSalvarAnotacao } from '@/hooks/useAnotacoesInternas'
import { cn } from '@/lib/utils'

// Botão por reunião → abre as MINHAS anotações internas (privadas). O ícone
// destaca quando já existe nota escrita. Aparece pra qualquer usuário logado —
// cada um só vê/edita as suas (garantido pela RLS).
export function AnotacaoInternaButton({ reuniaoId }: { reuniaoId: string }) {
  const [aberto, setAberto] = useState(false)
  const { data: anot } = useMinhaAnotacao(reuniaoId)
  const temNota = !!anot?.texto?.trim()

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        title={temNota ? 'Editar minhas anotações' : 'Minhas anotações internas (privadas)'}
        className={cn(
          'btn-press flex h-7 w-7 items-center justify-center rounded-full',
          temNota ? 'text-accentBlue bg-accentBlue-soft' : 'text-ink-muted hover:bg-surface-subtle hover:text-ink',
        )}
      >
        <NotebookPen className="h-3.5 w-3.5" />
      </button>
      {aberto && (
        <AnotacaoDialog reuniaoId={reuniaoId} inicial={anot?.texto ?? ''} onClose={() => setAberto(false)} />
      )}
    </>
  )
}

function AnotacaoDialog({ reuniaoId, inicial, onClose }: {
  reuniaoId: string; inicial: string; onClose: () => void
}) {
  const salvar = useSalvarAnotacao()
  const [texto, setTexto] = useState(inicial)

  async function handleSalvar() {
    try {
      await salvar.mutateAsync({ reuniaoId, texto })
      toast.success(texto.trim() ? 'Anotação salva.' : 'Anotação removida.')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar anotação.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-canvas border border-line rounded-xl shadow-elevated w-full max-w-md mx-4 p-6 space-y-4 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
            <NotebookPen className="h-4 w-4 text-accentBlue" /> Minhas anotações
          </h2>
          <button onClick={onClose} className="btn-press text-ink-subtle hover:text-ink-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
          <Lock className="h-3 w-3" /> Só você vê estas anotações.
        </p>

        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={6}
          autoFocus
          placeholder="Escreva suas anotações sobre esta reunião…"
          className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
        />

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-ink-secondary">Cancelar</Button>
          <Button
            size="sm"
            onClick={handleSalvar}
            disabled={salvar.isPending}
            className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
