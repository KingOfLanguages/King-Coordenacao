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
      <DialogContent className="bg-king-card border-king-border text-white">
        <DialogHeader>
          <DialogTitle>Nova Observação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="bg-king-dark border-king-border text-white">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent className="bg-king-card border-king-border text-white">
                <SelectItem value="reuniao">Reunião</SelectItem>
                <SelectItem value="ocorrencia">Ocorrência</SelectItem>
                <SelectItem value="feedback_positivo">Feedback Positivo</SelectItem>
                <SelectItem value="feedback_negativo">Feedback Negativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Texto</Label>
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-king-border bg-king-dark px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-king-red"
              placeholder="Descreva a observação..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-white/50">
              Cancelar
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={!tipo || !texto.trim() || salvar.isPending}
              className="bg-king-red hover:bg-king-red/90"
            >
              {salvar.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
