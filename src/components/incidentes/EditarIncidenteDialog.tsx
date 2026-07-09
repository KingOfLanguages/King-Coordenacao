import { useEffect, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAtualizarIncidente, CATEGORIAS_PROFESSOR, CATEGORIAS_GERAL, type Incidente } from '@/hooks/useIncidentes'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  incidente: Incidente | null
}

export function EditarIncidenteDialog({ open, onOpenChange, incidente }: Props) {
  const atualizar = useAtualizarIncidente()
  const ehGeral = !incidente?.professor_id

  const [titulo, setTitulo] = useState('')
  const [alunoNome, setAlunoNome] = useState('')
  const [categoria, setCategoria] = useState('')
  const [urgencia, setUrgencia] = useState('Média')
  const [descricao, setDescricao] = useState('')
  const [precisaAcompanhamento, setPrecisaAcompanhamento] = useState(false)

  useEffect(() => {
    if (!open || !incidente) return
    setTitulo(incidente.professor_id ? '' : incidente.teacher_name)
    setAlunoNome(incidente.aluno_nome ?? '')
    setCategoria(incidente.problem_type)
    setUrgencia(incidente.urgency)
    setDescricao(incidente.description)
    setPrecisaAcompanhamento(incidente.needs_follow_up)
  }, [open, incidente])

  const categorias = ehGeral ? CATEGORIAS_GERAL : CATEGORIAS_PROFESSOR
  // A categoria salva pode não estar na lista da aba (dado legado) — garante que aparece.
  const opcoesCategoria = categoria && !categorias.includes(categoria as never)
    ? [categoria, ...categorias]
    : [...categorias]

  const podeSalvar = !!descricao.trim()

  async function handleSalvar() {
    if (!incidente || !podeSalvar || atualizar.isPending) return
    try {
      await atualizar.mutateAsync({
        id: incidente.id,
        problem_type: categoria,
        urgency: urgencia,
        description: descricao,
        needs_follow_up: precisaAcompanhamento,
        aluno_nome: alunoNome,
        titulo_livre: ehGeral ? titulo : undefined,
        professor_id: incidente.professor_id,
      })
      toast.success('Chamado atualizado.')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao editar chamado.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-canvas border-line text-ink max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink font-semibold">Editar chamado</DialogTitle>
        </DialogHeader>
        {incidente && (
          <div className="space-y-4">
            {ehGeral ? (
              <div className="space-y-1.5">
                <Label className="label-micro">Título / referência</Label>
                <Input
                  value={titulo}
                  onChange={e => setTitulo(e.target.value)}
                  placeholder={`Ex: ${categoria}`}
                  className="h-9 bg-surface-canvas border-line"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="label-micro">Professor</Label>
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-subtle px-3 py-2 text-[13px] text-ink">
                  {incidente.teacher_name}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="label-micro flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5 text-ink-muted" />
                Aluno (opcional)
              </Label>
              <Input
                value={alunoNome}
                onChange={e => setAlunoNome(e.target.value)}
                placeholder="Nome do aluno relacionado…"
                className="h-9 bg-surface-canvas border-line"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="label-micro">Categoria</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger className="bg-surface-canvas border-line text-ink">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-canvas border-line text-ink max-h-64">
                    {opcoesCategoria.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="label-micro">Urgência</Label>
                <Select value={urgencia} onValueChange={setUrgencia}>
                  <SelectTrigger className="bg-surface-canvas border-line text-ink">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-canvas border-line text-ink">
                    <SelectItem value="Baixa">Baixa</SelectItem>
                    <SelectItem value="Média">Média</SelectItem>
                    <SelectItem value="Alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="label-micro">Descrição</Label>
              <textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                rows={4}
                className={cn(
                  'w-full resize-none rounded-lg border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink',
                  'placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors',
                )}
                placeholder="O que aconteceu…"
              />
            </div>

            <label className="flex items-center gap-2 text-[12.5px] text-ink-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={precisaAcompanhamento}
                onChange={e => setPrecisaAcompanhamento(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-line accent-accentBlue"
              />
              Precisa de acompanhamento
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-ink-secondary">
                Cancelar
              </Button>
              <Button
                onClick={handleSalvar}
                disabled={!podeSalvar || atualizar.isPending}
                className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
              >
                {atualizar.isPending ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
