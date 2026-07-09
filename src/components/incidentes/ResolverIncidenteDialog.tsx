import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useResolverIncidente } from '@/hooks/useIncidentes'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  incidente: { id: string; teacher_name: string; solution?: string; professor_id?: string | null } | null
}

export function ResolverIncidenteDialog({ open, onOpenChange, incidente }: Props) {
  const resolver = useResolverIncidente()
  const [solucao, setSolucao] = useState('')

  useEffect(() => {
    if (open) setSolucao(incidente?.solution ?? '')
  }, [open, incidente])

  async function handleConfirmar() {
    if (!incidente || !solucao.trim()) return
    try {
      await resolver.mutateAsync({ id: incidente.id, solution: solucao.trim(), professor_id: incidente.professor_id ?? undefined })
      toast.success(`Chamado de ${incidente.teacher_name} concluído.`)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao concluir chamado.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-canvas border-line text-ink max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink font-semibold">Concluir chamado</DialogTitle>
        </DialogHeader>
        {incidente && (
          <div className="space-y-4">
            <p className="text-[13px] text-ink-secondary">
              Referência: <strong className="text-ink">{incidente.teacher_name}</strong>
            </p>
            <div className="space-y-1.5">
              <Label className="label-micro">Solução / resultado</Label>
              <textarea
                value={solucao}
                onChange={e => setSolucao(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors"
                placeholder="Descreva como foi resolvido…"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-ink-secondary">
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmar}
                disabled={!solucao.trim() || resolver.isPending}
                className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
              >
                {resolver.isPending ? 'Salvando…' : 'Concluir chamado'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
