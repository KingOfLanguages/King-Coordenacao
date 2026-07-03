import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEditarParticipacaoReuniao } from '@/hooks/useReunioes'

export type StatusParticipacao = 'pendente' | 'realizada' | 'cancelada'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  participacao: {
    id: string
    reuniaoId: string | null
    data: string
    status: StatusParticipacao
    observacao: string | null
  } | null
}

export function EditarReuniaoProfessorDialog({ open, onOpenChange, participacao }: Props) {
  const editar = useEditarParticipacaoReuniao()
  const [data, setData] = useState('')
  const [hora, setHora] = useState('08:00')
  const [status, setStatus] = useState<StatusParticipacao>('pendente')
  const [observacao, setObservacao] = useState('')

  useEffect(() => {
    if (!open || !participacao) return
    const d = new Date(participacao.data)
    setData(d.toISOString().slice(0, 10))
    setHora(d.toTimeString().slice(0, 5))
    setStatus(participacao.status)
    setObservacao(participacao.observacao ?? '')
  }, [open, participacao])

  async function handleSalvar() {
    if (!participacao) return
    try {
      await editar.mutateAsync({
        participanteId: participacao.id,
        reuniaoId: participacao.reuniaoId,
        data: participacao.reuniaoId ? new Date(`${data}T${hora}:00`).toISOString() : undefined,
        status,
        observacao,
      })
      toast.success('Reunião atualizada.')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao editar reunião.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-canvas border-line text-ink max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink font-semibold">Editar reunião</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="label-micro">Data</Label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} className="h-9 bg-surface-canvas border-line text-ink" />
            </div>
            <div className="space-y-1.5">
              <Label className="label-micro">Horário</Label>
              <Input type="time" value={hora} onChange={e => setHora(e.target.value)} className="h-9 bg-surface-canvas border-line text-ink" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Status</Label>
            <Select value={status} onValueChange={v => setStatus(v as StatusParticipacao)}>
              <SelectTrigger className="bg-surface-canvas border-line text-ink">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-surface-canvas border-line text-ink">
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="realizada">Realizada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Observação</Label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors"
              placeholder="Observações da reunião…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-ink-secondary">
              Cancelar
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={editar.isPending}
              className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
            >
              {editar.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
