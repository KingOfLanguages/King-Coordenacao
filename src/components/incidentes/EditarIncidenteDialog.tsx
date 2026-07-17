import { useEffect, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useAtualizarIncidente, abaDoIncidente, categoriasVisiveis, natureza as naturezaDe,
  CATEGORIAS_PROFESSOR, CATEGORIAS_GERAL, CATEGORIAS_PLATAFORMA, NATUREZA_META,
  type Incidente, type Natureza,
} from '@/hooks/useIncidentes'
import { useAuth } from '@/contexts/AuthContext'
import { podeVerCategoriasCoordOnly } from '@/lib/permissions'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  incidente: Incidente | null
}

export function EditarIncidenteDialog({ open, onOpenChange, incidente }: Props) {
  const { profile } = useAuth()
  const podeVerCoordOnly = podeVerCategoriasCoordOnly(profile)
  const atualizar = useAtualizarIncidente()
  const aba = incidente ? abaDoIncidente(incidente) : 'geral'
  const ehGeral = aba === 'geral'

  const [titulo, setTitulo] = useState('')
  const [alunoNome, setAlunoNome] = useState('')
  const [categoria, setCategoria] = useState('')
  const [urgencia, setUrgencia] = useState('Média')
  const [natureza, setNatureza] = useState<Natureza>('desafio')
  const [descricao, setDescricao] = useState('')

  useEffect(() => {
    if (!open || !incidente) return
    setTitulo(incidente.professor_id ? '' : incidente.teacher_name)
    setAlunoNome(incidente.aluno_nome ?? '')
    setCategoria(incidente.problem_type)
    setUrgencia(incidente.urgency)
    setNatureza(naturezaDe(incidente))
    setDescricao(incidente.description)
  }, [open, incidente])

  // Informe é registro puro — urgência não faz sentido (não segue fluxo de resolução).
  const mostrarUrgencia = natureza === 'desafio'

  const categoriasBase = aba === 'plataforma' ? CATEGORIAS_PLATAFORMA : ehGeral ? CATEGORIAS_GERAL : CATEGORIAS_PROFESSOR
  const categorias = categoriasVisiveis(categoriasBase, podeVerCoordOnly)
  // A categoria salva pode não estar na lista da aba (dado legado) — garante que aparece.
  const opcoesCategoria = categoria && !categorias.includes(categoria)
    ? [categoria, ...categorias]
    : [...categorias]

  const podeSalvar = !!descricao.trim()

  async function handleSalvar() {
    if (!incidente || !podeSalvar || atualizar.isPending) return
    try {
      await atualizar.mutateAsync({
        id: incidente.id,
        problem_type: categoria,
        urgency: mostrarUrgencia ? urgencia : 'Baixa',
        description: descricao,
        needs_follow_up: incidente.needs_follow_up,
        aluno_nome: alunoNome,
        titulo_livre: ehGeral ? titulo : undefined,
        professor_id: incidente.professor_id,
        natureza,
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

            <div className={cn('grid gap-2', mostrarUrgencia ? 'grid-cols-2' : 'grid-cols-1')}>
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
              {mostrarUrgencia && (
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
                      <SelectItem value="Crítico">Crítico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="label-micro">Natureza</Label>
              <div className="flex items-center gap-1 rounded-full bg-surface-subtle p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setNatureza('desafio')}
                  className={cn(
                    'btn-press px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-200',
                    natureza === 'desafio' ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
                  )}
                >
                  {NATUREZA_META.desafio.label}
                </button>
                <button
                  type="button"
                  onClick={() => setNatureza('informe')}
                  className={cn(
                    'btn-press px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-200',
                    natureza === 'informe' ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
                  )}
                >
                  {NATUREZA_META.informe.label}
                </button>
              </div>
              <p className="text-[11px] text-ink-subtle">{NATUREZA_META[natureza].descricao}</p>
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
