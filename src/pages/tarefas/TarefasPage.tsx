import { useMemo, useState } from 'react'
import { ListTodo, Plus, Check, Undo2, Trash2, User, Users, X, Inbox, Send } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useTarefas, useCriarTarefa, useConcluirTarefa, useReabrirTarefa, useExcluirTarefa,
  usePessoasAtribuiveis, type Tarefa, type TarefaTime,
} from '@/hooks/useTarefas'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const TIME_LABEL: Record<TarefaTime, string> = { coordenacao: 'Coordenação', suporte: 'Suporte' }

type FiltroStatus = 'abertas' | 'concluidas' | 'todas'
type Escopo = 'todas' | 'para_mim' | 'criadas'

function timeDoUsuario(role?: string): TarefaTime | null {
  if (role === 'coordenacao') return 'coordenacao'
  if (role === 'suporte' || role === 'suporte_aluno') return 'suporte'
  return null
}

function tempoRelativo(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'há 1 dia'
  return `há ${dias} dias`
}

export function TarefasPage() {
  const { profile } = useAuth()
  const meuId = profile?.id ?? null
  const meuTime = timeDoUsuario(profile?.role)
  const ehAdmin = profile?.is_admin === true || profile?.role === 'admin'

  const { data: tarefas = [], isLoading } = useTarefas()
  const concluir = useConcluirTarefa()
  const reabrir = useReabrirTarefa()
  const excluir = useExcluirTarefa()

  const [status, setStatus] = useState<FiltroStatus>('abertas')
  const [escopo, setEscopo] = useState<Escopo>('todas')
  const [novoAberto, setNovoAberto] = useState(false)

  function paraMim(t: Tarefa): boolean {
    return t.atribuido_a === meuId || (!!t.atribuido_time && t.atribuido_time === meuTime)
  }

  const filtradas = useMemo(() => tarefas.filter(t => {
    if (status === 'abertas' && t.status !== 'aberto') return false
    if (status === 'concluidas' && t.status !== 'concluido') return false
    if (escopo === 'para_mim' && !paraMim(t)) return false
    if (escopo === 'criadas' && t.criado_por !== meuId) return false
    return true
  }), [tarefas, status, escopo, meuId, meuTime]) // eslint-disable-line react-hooks/exhaustive-deps

  const contagem = {
    abertas: tarefas.filter(t => t.status === 'aberto').length,
    paraMim: tarefas.filter(t => t.status === 'aberto' && paraMim(t)).length,
  }

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Tarefas</h1>
          <p className="text-[13px] text-ink-muted">
            Tarefas entre suporte e coordenação.
            {contagem.paraMim > 0 && (
              <> · <span className="text-accentBlue font-medium">{contagem.paraMim} aberta{contagem.paraMim !== 1 ? 's' : ''} para você</span></>
            )}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setNovoAberto(true)}
          className="btn-press h-9 gap-1.5 bg-accentBlue hover:bg-accentBlue-hov text-white"
        >
          <Plus className="h-3.5 w-3.5" />Nova tarefa
        </Button>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-surface-subtle rounded-full p-1">
          {([['abertas', 'Abertas'], ['concluidas', 'Concluídas'], ['todas', 'Todas']] as [FiltroStatus, string][]).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setStatus(v)}
              className={cn(
                'btn-press px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
                status === v ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-surface-subtle rounded-full p-1">
          {([['todas', 'Todas', null], ['para_mim', 'Para mim', <Inbox key="i" className="h-3.5 w-3.5" />], ['criadas', 'Criadas por mim', <Send key="s" className="h-3.5 w-3.5" />]] as [Escopo, string, React.ReactNode][]).map(([v, l, icon]) => (
            <button
              key={v}
              onClick={() => setEscopo(v)}
              className={cn(
                'btn-press flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
                escopo === v ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
              )}
            >
              {icon}{l}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
      ) : filtradas.length === 0 ? (
        <div className="card-surface p-12 text-center space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full bg-surface-subtle text-ink-muted flex items-center justify-center">
            <ListTodo className="h-4 w-4" />
          </div>
          <p className="text-[14px] font-medium text-ink">Nenhuma tarefa por aqui</p>
          <p className="text-[13px] text-ink-muted">Crie uma tarefa e enderece a uma pessoa ou a um time.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map(t => (
            <CardTarefa
              key={t.id}
              tarefa={t}
              podeExcluir={t.criado_por === meuId || ehAdmin}
              atualizando={concluir.isPending || reabrir.isPending}
              onConcluir={() => concluir.mutate(t.id, {
                onSuccess: () => toast.success('Tarefa concluída.'),
                onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao concluir.'),
              })}
              onReabrir={() => reabrir.mutate(t.id, {
                onSuccess: () => toast.success('Tarefa reaberta.'),
                onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao reabrir.'),
              })}
              onExcluir={() => excluir.mutate(t.id, {
                onSuccess: () => toast.success('Tarefa excluída.'),
                onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao excluir.'),
              })}
            />
          ))}
        </div>
      )}

      {novoAberto && <NovaTarefaDialog onClose={() => setNovoAberto(false)} />}
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function CardTarefa({
  tarefa, podeExcluir, atualizando, onConcluir, onReabrir, onExcluir,
}: {
  tarefa: Tarefa
  podeExcluir: boolean
  atualizando: boolean
  onConcluir: () => void
  onReabrir: () => void
  onExcluir: () => void
}) {
  const concluida = tarefa.status === 'concluido'
  const destino = tarefa.atribuido_a
    ? { icon: <User className="h-3 w-3" />, label: tarefa.responsavel?.nome ?? 'Pessoa' }
    : tarefa.atribuido_time
      ? { icon: <Users className="h-3 w-3" />, label: `Geral · ${TIME_LABEL[tarefa.atribuido_time]}` }
      : { icon: <Users className="h-3 w-3" />, label: 'Geral' }

  return (
    <div className={cn('card-surface p-4 space-y-3', concluida && 'opacity-70')}>
      <div className="flex items-start justify-between gap-2">
        <p className={cn('font-medium text-[14px] leading-tight', concluida ? 'text-ink-muted line-through' : 'text-ink')}>
          {tarefa.titulo}
        </p>
        <span className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium flex-shrink-0',
          concluida ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-urg-medBg text-urg-medFg',
        )}>
          {concluida ? 'Concluída' : 'Aberta'}
        </span>
      </div>

      {tarefa.descricao && (
        <p className="text-[12.5px] text-ink-secondary leading-relaxed whitespace-pre-wrap">{tarefa.descricao}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-ink-secondary font-medium">
          {destino.icon}{destino.label}
        </span>
        {tarefa.criador?.nome && <span>de {tarefa.criador.nome}</span>}
        <span>· {tempoRelativo(tarefa.created_at)}</span>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {concluida ? (
          <Button
            variant="outline" size="sm" disabled={atualizando}
            onClick={onReabrir}
            className="btn-press h-8 flex-1 gap-1.5 border-line text-ink-secondary hover:text-ink text-[12px]"
          >
            <Undo2 className="h-3.5 w-3.5" />Reabrir
          </Button>
        ) : (
          <Button
            size="sm" disabled={atualizando}
            onClick={onConcluir}
            className="btn-press h-8 flex-1 gap-1.5 bg-urg-lowFg text-white hover:opacity-90 text-[12px]"
          >
            <Check className="h-3.5 w-3.5" />Concluir
          </Button>
        )}
        {podeExcluir && (
          <Button
            variant="ghost" size="sm"
            onClick={onExcluir}
            aria-label="Excluir tarefa"
            className="btn-press h-8 w-8 p-0 text-ink-subtle hover:text-urg-highFg hover:bg-urg-highBg"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Dialog — Nova tarefa ─────────────────────────────────────────────────────

type TipoDestino = 'pessoa' | 'time'

function NovaTarefaDialog({ onClose }: { onClose: () => void }) {
  const criar = useCriarTarefa()
  const { data: pessoas = [] } = usePessoasAtribuiveis()
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipoDestino, setTipoDestino] = useState<TipoDestino>('pessoa')
  const [pessoa, setPessoa] = useState('')
  const [time, setTime] = useState<TarefaTime | ''>('')

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
      })
      toast.success('Tarefa criada.')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar tarefa.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-canvas border border-line rounded-xl shadow-elevated w-full max-w-md mx-4 p-6 space-y-5 animate-fade-up">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">Nova tarefa</h2>
          <button onClick={onClose} className="btn-press text-ink-subtle hover:text-ink-secondary">
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
            <Label className="label-micro">Endereçar para</Label>
            <div className="flex items-center gap-1 bg-surface-subtle rounded-lg p-1 w-fit">
              {([['pessoa', 'Pessoa'], ['time', 'Time (geral)']] as [TipoDestino, string][]).map(([v, l]) => (
                <button
                  key={v}
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
                  <SelectItem key={p.id} value={p.id} className="text-[12px]">{p.nome}</SelectItem>
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
