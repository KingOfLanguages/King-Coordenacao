import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useExcluirParticipacaoReuniao } from '@/hooks/useReunioes'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  participanteId: string | null
}

export function ExcluirReuniaoProfessorDialog({ open, onOpenChange, participanteId }: Props) {
  const excluir = useExcluirParticipacaoReuniao()

  async function handleConfirmar() {
    if (!participanteId) return
    try {
      await excluir.mutateAsync(participanteId)
      toast.success('Reunião removida do histórico.')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-canvas border-line text-ink max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-ink font-semibold">Excluir esta reunião?</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-ink-secondary leading-relaxed">
          Remove esse registro do histórico do professor. Se a reunião tiver outros professores vinculados, eles não são afetados.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-ink-secondary">
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={excluir.isPending}
            className="btn-press bg-urg-highFg hover:opacity-90 text-white"
          >
            {excluir.isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
