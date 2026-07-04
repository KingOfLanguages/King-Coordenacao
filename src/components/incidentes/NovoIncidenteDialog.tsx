import { useMemo, useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProfessoresAtivos } from '@/hooks/useProfessores'
import { useCriarIncidente, CATEGORIAS_INCIDENTE } from '@/hooks/useIncidentes'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Pré-preenchido quando a ação parte da tela do próprio professor — esconde o toggle "sem professor". */
  professorFixo?: { id: string; nome: string }
}

export function NovoIncidenteDialog({ open, onOpenChange, professorFixo }: Props) {
  const { data: professores = [] } = useProfessoresAtivos()
  const criar = useCriarIncidente()

  const [comProfessor, setComProfessor] = useState(true)
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState<{ id: string; nome: string } | null>(professorFixo ?? null)
  const [tituloLivre, setTituloLivre] = useState('')
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_INCIDENTE[0])
  const [urgencia, setUrgencia] = useState('Média')
  const [descricao, setDescricao] = useState('')
  const [precisaAcompanhamento, setPrecisaAcompanhamento] = useState(false)

  useEffect(() => {
    if (!open) return
    setComProfessor(true)
    setSelecionado(professorFixo ?? null)
    setBusca('')
    setTituloLivre('')
    setCategoria(CATEGORIAS_INCIDENTE[0])
    setUrgencia('Média')
    setDescricao('')
    setPrecisaAcompanhamento(false)
  }, [open, professorFixo])

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (termo.length < 2) return []
    return professores.filter(p => p.nome.toLowerCase().includes(termo)).slice(0, 8)
  }, [busca, professores])

  const podeConfirmar = !!descricao.trim() && (!comProfessor || !!selecionado)

  async function handleConfirmar() {
    if (!podeConfirmar) return
    try {
      await criar.mutateAsync({
        problem_type: categoria,
        urgency: urgencia,
        description: descricao.trim(),
        needs_follow_up: precisaAcompanhamento,
        professor_id: comProfessor ? selecionado?.id : null,
        titulo_livre: comProfessor ? undefined : tituloLivre,
      })
      toast.success('Incidente registrado.')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar incidente.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-canvas border-line text-ink max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink font-semibold">Novo incidente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!professorFixo && (
            <div className="flex items-center gap-1 rounded-full bg-surface-subtle p-1 w-fit">
              <button
                onClick={() => setComProfessor(true)}
                className={cn(
                  'btn-press px-3 py-1 rounded-full text-[12px] font-medium transition-colors',
                  comProfessor ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
                )}
              >
                Com professor
              </button>
              <button
                onClick={() => setComProfessor(false)}
                className={cn(
                  'btn-press px-3 py-1 rounded-full text-[12px] font-medium transition-colors',
                  !comProfessor ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
                )}
              >
                Sem professor (desafio)
              </button>
            </div>
          )}

          {comProfessor ? (
            <div className="space-y-1.5">
              <Label className="label-micro">Professor</Label>
              {professorFixo ? (
                <div className="flex items-center gap-2 rounded-md border border-line bg-surface-subtle px-3 py-2 text-[13px] text-ink">
                  {professorFixo.nome}
                </div>
              ) : selecionado ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-subtle px-3 py-2 text-[13px] text-ink">
                  {selecionado.nome}
                  <button onClick={() => setSelecionado(null)} className="text-ink-muted hover:text-ink">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
                  <Input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar professor pelo nome…"
                    className="pl-9 h-9 bg-surface-canvas border-line"
                  />
                  {resultados.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-line bg-surface-canvas shadow-lg">
                      {resultados.map(p => (
                        <li key={p.id}>
                          <button
                            onClick={() => { setSelecionado({ id: p.id, nome: p.nome }); setBusca('') }}
                            className="w-full text-left px-3 py-2 text-[13px] text-ink hover:bg-surface-subtle transition-colors"
                          >
                            {p.nome}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="label-micro">Título / referência (opcional)</Label>
              <Input
                value={tituloLivre}
                onChange={e => setTituloLivre(e.target.value)}
                placeholder={`Ex: ${categoria}`}
                className="h-9 bg-surface-canvas border-line"
              />
              <p className="text-[11px] text-ink-subtle">Sem professor vinculado — aparece só na tela geral de incidentes.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="label-micro">Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="bg-surface-canvas border-line text-ink">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-canvas border-line text-ink max-h-64">
                  {CATEGORIAS_INCIDENTE.map(c => (
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
                'w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink',
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
              onClick={handleConfirmar}
              disabled={!podeConfirmar || criar.isPending}
              className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
            >
              {criar.isPending ? 'Salvando…' : 'Registrar incidente'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
