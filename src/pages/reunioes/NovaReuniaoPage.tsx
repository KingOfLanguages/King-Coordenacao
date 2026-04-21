import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
    <div className="px-6 py-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/professores')}
          className="btn-press text-ink-secondary hover:text-ink hover:bg-surface-subtle">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Nova reunião</h1>
      </div>

      <form onSubmit={handleSubmit} className="card-surface p-6 space-y-5">
        <div className="space-y-1.5">
          <Label className="label-micro">Professor</Label>
          <Select value={professorId} onValueChange={setProfessorId}>
            <SelectTrigger className="bg-surface-canvas border-line text-ink">
              <SelectValue placeholder="Selecione o professor" />
            </SelectTrigger>
            <SelectContent className="bg-surface-canvas border-line text-ink">
              {professores?.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="label-micro">Data e horário</Label>
          <Input
            type="datetime-local"
            value={data}
            onChange={e => setData(e.target.value)}
            required
            className="bg-surface-canvas border-line text-ink"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="label-micro">Notas (opcional)</Label>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors"
            placeholder="Pauta, observações iniciais…"
          />
        </div>

        <Button
          type="submit"
          disabled={!professorId || !data || criarReuniao.isPending}
          className="btn-press w-full h-10 bg-accentBlue hover:bg-accentBlue-hov text-white font-medium"
        >
          {criarReuniao.isPending ? 'Registrando…' : 'Registrar reunião'}
        </Button>
      </form>
    </div>
  )
}
