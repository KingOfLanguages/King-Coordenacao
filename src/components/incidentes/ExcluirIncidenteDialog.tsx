import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useExcluirIncidente } from '@/hooks/useIncidentes'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  incidente: { id: string; teacher_name: string; professor_id?: string | null } | null
}

export function ExcluirIncidenteDialog({ open, onOpenChange, incidente }: Props) {
  const excluir = useExcluirIncidente()

  async function handleConfirmar() {
    if (!incidente) return
    try {
      await excluir.mutateAsync({ id: incidente.id, professor_id: incidente.professor_id })
      toast.success('Incidente excluído.')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir incidente.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-canvas border-line text-ink max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-ink font-semibold">Excluir este incidente?</DialogTitle>
        </DialogHeader>
        {incidente && (
          <>
            <p className="text-[13px] text-ink-secondary leading-relaxed">
              Remove permanentemente o incidente de <strong className="text-ink">{incidente.teacher_name}</strong>. Essa ação não pode ser desfeita.
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
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
