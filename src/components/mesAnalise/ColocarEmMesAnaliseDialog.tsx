import { useMemo, useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProfessoresAtivos } from '@/hooks/useProfessores'
import { useColocarEmMesAnalise } from '@/hooks/useMesAnalise'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Pré-preenchido quando a ação parte de uma sugestão ou da tela do professor. */
  professorFixo?: { id: string; nome: string }
  /** Sugere um texto inicial de descrição (ex: resumo da sugestão automática). */
  descricaoInicial?: string
  urgenciaInicial?: string
}

export function ColocarEmMesAnaliseDialog({
  open, onOpenChange, professorFixo, descricaoInicial, urgenciaInicial,
}: Props) {
  const { data: professores = [] } = useProfessoresAtivos()
  const colocar = useColocarEmMesAnalise()

  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState<{ id: string; nome: string } | null>(professorFixo ?? null)
  const [descricao, setDescricao] = useState(descricaoInicial ?? '')
  const [urgencia, setUrgencia] = useState(urgenciaInicial ?? 'Média')

  useEffect(() => {
    if (!open) return
    setSelecionado(professorFixo ?? null)
    setBusca('')
    setDescricao(descricaoInicial ?? '')
    setUrgencia(urgenciaInicial ?? 'Média')
  }, [open, professorFixo, descricaoInicial, urgenciaInicial])

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (termo.length < 2) return []
    return professores.filter(p => p.nome.toLowerCase().includes(termo)).slice(0, 8)
  }, [busca, professores])

  async function handleConfirmar() {
    if (!selecionado || !descricao.trim()) return
    try {
      await colocar.mutateAsync({ professor_id: selecionado.id, descricao: descricao.trim(), urgencia })
      toast.success(`${selecionado.nome} foi colocado(a) em Mês de Análise.`)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gravar no Nexus.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-canvas border-line text-ink max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink font-semibold">Colocar em Mês de Análise</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-[12px] text-ink-muted leading-relaxed">
            Isso cria uma ocorrência do tipo <strong className="text-ink">"Mês de análise"</strong> diretamente
            no King Nexus — visível também para quem usa o Nexus.
          </p>

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
              placeholder="Motivo do Mês de Análise…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-ink-secondary">
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmar}
              disabled={!selecionado || !descricao.trim() || colocar.isPending}
              className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
            >
              {colocar.isPending ? 'Gravando…' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
