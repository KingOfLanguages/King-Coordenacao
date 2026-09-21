import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCriarTarefa, usePessoasAtribuiveis, type TarefaTime } from '@/hooks/useTarefas'
import { isoLocal } from '@/hooks/useParaFazer'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

type TipoDestino = 'pessoa' | 'time'

function daquiA(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return isoLocal(d)
}

/** Nova tarefa. Abre endereçada a quem está criando — o uso mais comum é
 *  anotar algo para si; trocar para outra pessoa ou para um time é um clique. */
export function NovaTarefaDialog({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth()
  const criar = useCriarTarefa()
  const { data: pessoas = [] } = usePessoasAtribuiveis()
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipoDestino, setTipoDestino] = useState<TipoDestino>('pessoa')
  const [pessoa, setPessoa] = useState(profile?.id ?? '')
  const [time, setTime] = useState<TarefaTime | ''>('')
  const [prazo, setPrazo] = useState('')

  async function handleSalvar() {
    if (!titulo.trim()) { toast.error('Título é obrigatório.'); return }
    if (tipoDestino === 'pessoa' && !pessoa) { toast.error('Escolha a pessoa.'); return }
    if (tipoDestino === 'time' && !time) { toast.error('Escolha o time.'); return }
    try {
      await criar.mutateAsync({
        titulo,
        descricao,
        atribuido_a: tipoDestino === 'pessoa' ? pessoa : null,
        atribuido_time: tipoDestino === 'time' ? (time || null) : null,
        prazo: prazo || null,
      })
      toast.success('Tarefa criada.')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar tarefa.')
    }
  }

  const atalhos: [string, string][] = [['Hoje', daquiA(0)], ['Amanhã', daquiA(1)], ['Em 1 semana', daquiA(7)]]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-canvas border border-line rounded-xl shadow-elevated w-full max-w-md mx-4 p-6 space-y-5 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">Nova tarefa</h2>
          <button onClick={onClose} aria-label="Fechar" className="btn-press text-ink-subtle hover:text-ink-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="label-micro">Título <span className="text-brand">*</span></Label>
            <Input
              placeholder="O que precisa ser feito?"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && titulo.trim()) handleSalvar() }}
              className="h-9 bg-surface-canvas border-line"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Descrição</Label>
            <textarea
              placeholder="Detalhes (opcional)"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={3}
              className="w-full rounded-md bg-surface-canvas border border-line px-3 py-2 text-[13px] text-ink resize-none focus:outline-none focus:ring-2 focus:ring-accentBlue/30"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Para quando</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {atalhos.map(([rotulo, iso]) => (
                <button
                  key={rotulo}
                  type="button"
                  onClick={() => setPrazo(p => (p === iso ? '' : iso))}
                  className={cn(
                    'btn-press rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                    prazo === iso ? 'border-accentBlue bg-accentBlue-soft text-accentBlue' : 'border-line text-ink-secondary hover:text-ink',
                  )}
                >
                  {rotulo}
                </button>
              ))}
              <Input
                type="date"
                value={prazo}
                onChange={e => setPrazo(e.target.value)}
                aria-label="Data"
                className="h-8 w-[150px] bg-surface-canvas border-line text-[12.5px]"
              />
              {prazo && (
                <button type="button" onClick={() => setPrazo('')} className="btn-press text-[11.5px] text-ink-muted hover:text-ink">
                  sem prazo
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Endereçar para</Label>
            <div className="flex items-center gap-1 bg-surface-subtle rounded-lg p-1 w-fit">
              {([['pessoa', 'Pessoa'], ['time', 'Time (geral)']] as [TipoDestino, string][]).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTipoDestino(v)}
                  className={cn(
                    'btn-press px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors',
                    tipoDestino === v ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {tipoDestino === 'pessoa' ? (
            <Select value={pessoa} onValueChange={setPessoa}>
              <SelectTrigger className="h-9 bg-surface-canvas border-line text-ink text-[13px]">
                <SelectValue placeholder="Escolha a pessoa" />
              </SelectTrigger>
              <SelectContent className="bg-surface-canvas border-line text-ink max-h-64">
                {pessoas.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-[12px]">
                    {p.id === profile?.id ? `${p.nome} (você)` : p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={time} onValueChange={v => setTime(v as TarefaTime)}>
              <SelectTrigger className="h-9 bg-surface-canvas border-line text-ink text-[13px]">
                <SelectValue placeholder="Escolha o time" />
              </SelectTrigger>
              <SelectContent className="bg-surface-canvas border-line text-ink">
                <SelectItem value="coordenacao" className="text-[12px]">Coordenação</SelectItem>
                <SelectItem value="suporte" className="text-[12px]">Suporte</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-ink-secondary">Cancelar</Button>
          <Button
            size="sm"
            onClick={handleSalvar}
            disabled={criar.isPending}
            className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
          >
            {criar.isPending ? 'Criando…' : 'Criar tarefa'}
          </Button>
        </div>
      </div>
    </div>
  )
}
