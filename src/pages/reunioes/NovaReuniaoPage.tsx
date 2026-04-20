import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { useProfessoresAtivos } from '@/hooks/useProfessores'
import { useCriarReuniao } from '@/hooks/useReunioes'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

export function NovaReuniaoPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: professores } = useProfessoresAtivos()
  const criarReuniao = useCriarReuniao()

  const [professorId, setProfessorId] = useState('')
  const [data, setData]               = useState('')
  const [notas, setNotas]             = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!professorId || !data) return

    await criarReuniao.mutateAsync({
      professor_id:   professorId,
      coordenador_id: profile!.id,
      data:           new Date(data).toISOString(),
      notas:          notas || undefined,
    })

    toast.success('Reunião registrada.')
    navigate('/professores')
  }

  return (
    <div className="p-6 max-w-lg space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/professores')}
          className="text-white/50 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-white">Nova Reunião</h1>
      </div>

      <Card className="bg-king-card border-king-border p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Professor</Label>
            <Select value={professorId} onValueChange={setProfessorId}>
              <SelectTrigger className="bg-king-dark border-king-border text-white">
                <SelectValue placeholder="Selecione o professor" />
              </SelectTrigger>
              <SelectContent className="bg-king-card border-king-border text-white">
                {professores?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Data e horário</Label>
            <Input
              type="datetime-local"
              value={data}
              onChange={e => setData(e.target.value)}
              required
              className="bg-king-dark border-king-border text-white"
            />
          </div>

          <div className="space-y-1">
            <Label>Notas (opcional)</Label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-king-border bg-king-dark px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-king-red"
              placeholder="Pauta, observações iniciais..."
            />
          </div>

          <Button
            type="submit"
            disabled={!professorId || !data || criarReuniao.isPending}
            className="w-full bg-king-red hover:bg-king-red/90"
          >
            {criarReuniao.isPending ? 'Registrando...' : 'Registrar Reunião'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
