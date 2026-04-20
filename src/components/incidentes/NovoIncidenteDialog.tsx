import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCriarIncidente } from '@/hooks/useIncidentes'
import { useProfessoresAtivos } from '@/hooks/useProfessores'
import { toast } from 'sonner'

const TIPOS = ['Comportamento', 'Atraso', 'Falta', 'Qualidade de Aula', 'Reclamação', 'Outro']

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function NovoIncidenteDialog({ open, onOpenChange }: Props) {
  const criar = useCriarIncidente()
  const { data: professores } = useProfessoresAtivos()

  const [tipo, setTipo]             = useState('')
  const [descricao, setDescricao]   = useState('')
  const [professorId, setProfessorId] = useState('')

  async function handleSalvar() {
    if (!tipo || !descricao.trim()) return
    await criar.mutateAsync({
      tipo,
      descricao,
      professor_id: professorId || undefined,
    })
    toast.success('Incidente registrado.')
    setTipo(''); setDescricao(''); setProfessorId('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-king-card border-king-border text-white">
        <DialogHeader>
          <DialogTitle>Novo Incidente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="bg-king-dark border-king-border text-white">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent className="bg-king-card border-king-border text-white">
                {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Professor (opcional)</Label>
            <Select value={professorId} onValueChange={setProfessorId}>
              <SelectTrigger className="bg-king-dark border-king-border text-white">
                <SelectValue placeholder="Selecione se aplicável" />
              </SelectTrigger>
              <SelectContent className="bg-king-card border-king-border text-white">
                {professores?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Descrição</Label>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-king-border bg-king-dark px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-king-red"
              placeholder="Descreva o incidente..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-white/50">
              Cancelar
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={!tipo || !descricao.trim() || criar.isPending}
              className="bg-king-red hover:bg-king-red/90"
            >
              {criar.isPending ? 'Registrando...' : 'Registrar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
