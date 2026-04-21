import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSalvarObservacao } from '@/hooks/useReunioes'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  professorId: string
  reuniaoId?: string
}

export function NovaObservacaoDialog({ open, onOpenChange, professorId, reuniaoId }: Props) {
  const { profile } = useAuth()
  const salvar = useSalvarObservacao()
  const [tipo, setTipo]   = useState('')
  const [texto, setTexto] = useState('')

  async function handleSalvar() {
    if (!tipo || !texto.trim()) return
    await salvar.mutateAsync({
      professor_id:   professorId,
      reuniao_id:     reuniaoId,
      coordenador_id: profile!.id,
      tipo,
      texto,
    })
    toast.success('Observação salva.')
    setTipo(''); setTexto('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-canvas border-line text-ink max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink font-semibold">Nova observação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="label-micro">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="bg-surface-canvas border-line text-ink">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent className="bg-surface-canvas border-line text-ink">
                <SelectItem value="reuniao">Reunião</SelectItem>
                <SelectItem value="ocorrencia">Ocorrência</SelectItem>
                <SelectItem value="feedback_positivo">Feedback positivo</SelectItem>
                <SelectItem value="feedback_negativo">Feedback negativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="label-micro">Texto</Label>
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors"
              placeholder="Descreva a observação…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-ink-secondary">
              Cancelar
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={!tipo || !texto.trim() || salvar.isPending}
              className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
            >
              {salvar.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
