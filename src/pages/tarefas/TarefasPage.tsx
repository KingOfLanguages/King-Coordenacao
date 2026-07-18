import { useMemo, useState } from 'react'
import {
  ListTodo, Plus, Trash2, User, Users, X, Ticket, LayoutGrid, List as ListIcon, Check,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useTarefas, useCriarTarefa, useMoverTarefa, useExcluirTarefa,
  usePessoasAtribuiveis, type Tarefa, type TarefaTime, type TarefaStatus,
} from '@/hooks/useTarefas'
import {
  useAssumirIncidente, useLargarIncidente, useResolverIncidente, useReabrirIncidente,
} from '@/hooks/useIncidentes'
import { TarefaDetalheDialog } from '@/components/tarefas/TarefaDetalheDialog'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const TIME_LABEL: Record<TarefaTime, string> = { coordenacao: 'Coordenação', suporte: 'Suporte' }

type Vista = 'quadro' | 'lista'
type Escopo = 'minhas' | 'para_mim' | 'criadas' | 'todas'

const COLUNAS: { status: TarefaStatus; label: string; dot: string; head: string }[] = [
  { status: 'aberto',       label: 'Aberto',       dot: 'bg-urg-medFg',  head: 'text-urg-medFg' },
  { status: 'em_andamento', label: 'Em andamento', dot: 'bg-accentBlue', head: 'text-accentBlue' },
  { status: 'concluido',    label: 'Concluído',    dot: 'bg-urg-lowFg',  head: 'text-urg-lowFg' },
]

const STATUS_CHIP: Record<TarefaStatus, { label: string; cls: string }> = {
  aberto:       { label: 'Aberto',       cls: 'bg-urg-medBg text-urg-medFg' },
  em_andamento: { label: 'Em andamento', cls: 'bg-accentBlue-soft text-accentBlue' },
  concluido:    { label: 'Concluído',    cls: 'bg-urg-lowBg text-urg-lowFg' },
}

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
  const mover = useMoverTarefa()
  const excluir = useExcluirTarefa()
  const assumir = useAssumirIncidente()
  const largar = useLargarIncidente()
  const resolver = useResolverIncidente()
  const reabrirInc = useReabrirIncidente()

  const [vista, setVista] = useState<Vista>('quadro')
  const [escopo, setEscopo] = useState<Escopo>('minhas')
  const [novoAberto, setNovoAberto] = useState(false)
  const [detalhe, setDetalhe] = useState<Tarefa | null>(null)
  const [resolvendo, setResolvendo] = useState<Tarefa | null>(null)

  const movendo = mover.isPending || assumir.isPending || largar.isPending || resolver.isPending || reabrirInc.isPending

  function paraMim(t: Tarefa): boolean {
    return t.atribuido_a === meuId || (!!t.atribuido_time && t.atribuido_time === meuTime)
  }
  function noEscopo(t: Tarefa): boolean {
    if (escopo === 'minhas') return paraMim(t) || t.criado_por === meuId
    if (escopo === 'para_mim') return paraMim(t)
    if (escopo === 'criadas') return t.criado_por === meuId
    return true
  }

  const filtradas = useMemo(() => tarefas.filter(noEscopo), [tarefas, escopo, meuId, meuTime]) // eslint-disable-line react-hooks/exhaustive-deps

  const paraMimAbertas = tarefas.filter(t => t.status !== 'concluido' && paraMim(t)).length

  // ── Mover tarefa entre estados (sincroniza com o incidente quando houver) ─────
  async function moverTarefa(t: Tarefa, status: TarefaStatus) {
    if (status === t.status || movendo) return

    // Tarefa avulsa (sem incidente): muda só o status da tarefa.
    if (!t.incidente_id) {
      mover.mutate({ id: t.id, status }, {
        onSuccess: () => toast.success('Tarefa movida.'),
        onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao mover.'),
      })
      return
    }

    // Tarefa de desafio: as transições passam pelo incidente (fonte única).
    if (status === 'concluido') { setResolvendo(t); return } // pede a solução

    const id = t.incidente_id
    try {
      if (status === 'em_andamento') {
        if (t.status === 'concluido') await reabrirInc.mutateAsync({ id })
        else await assumir.mutateAsync({ id })
      } else if (status === 'aberto') {
        if (t.status === 'concluido') { await reabrirInc.mutateAsync({ id }); await largar.mutateAsync({ id }) }
        else await largar.mutateAsync({ id })
      }
      toast.success('Tarefa movida.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível mover — verifique sua permissão.')
    }
  }

  async function confirmarResolucao(solucao: string) {
    if (!resolvendo?.incidente_id) return
    try {
      await resolver.mutateAsync({ id: resolvendo.incidente_id, solution: solucao })
      toast.success('Desafio resolvido — tarefa concluída.')
      setResolvendo(null)
      setDetalhe(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao resolver.')
    }
  }

  function excluirTarefa(t: Tarefa) {
    excluir.mutate(t.id, {
      onSuccess: () => { toast.success('Tarefa excluída.'); setDetalhe(null) },
      onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao excluir.'),
    })
  }

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Tarefas</h1>
          <p className="text-[13px] text-ink-muted">
            Acompanhe o andamento das tarefas até a resolução.
            {paraMimAbertas > 0 && (
              <> · <span className="text-accentBlue font-medium">{paraMimAbertas} em aberto para você</span></>
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

      {/* Controles: vista + escopo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-surface-subtle rounded-full p-1">
          {([['quadro', 'Quadro', <LayoutGrid key="q" className="h-3.5 w-3.5" />], ['lista', 'Lista', <ListIcon key="l" className="h-3.5 w-3.5" />]] as [Vista, string, React.ReactNode][]).map(([v, l, icon]) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={cn(
                'btn-press flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
                vista === v ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
              )}
            >
              {icon}{l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-surface-subtle rounded-full p-1">
          {([['minhas', 'Minhas'], ['para_mim', 'Recebidas'], ['criadas', 'Criadas'], ['todas', 'Todas']] as [Escopo, string][]).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setEscopo(v)}
              className={cn(
                'btn-press px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
                escopo === v ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
              )}
            >
              {l}
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
          <p className="text-[13px] text-ink-muted">Crie uma tarefa, ou assuma um desafio na tela de Incidentes.</p>
        </div>
      ) : vista === 'quadro' ? (
        <Quadro
          tarefas={filtradas}
          meuId={meuId}
          ehAdmin={ehAdmin}
          movendo={movendo}
          onAbrir={setDetalhe}
          onMover={moverTarefa}
          onExcluir={excluirTarefa}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map(t => (
            <CardTarefa
              key={t.id}
              tarefa={t}
              podeExcluir={t.criado_por === meuId || ehAdmin}
              mostrarStatus
              onAbrir={() => setDetalhe(t)}
              onExcluir={() => excluirTarefa(t)}
            />
          ))}
        </div>
      )}

      {novoAberto && <NovaTarefaDialog onClose={() => setNovoAberto(false)} />}

      <TarefaDetalheDialog
        open={!!detalhe}
        onOpenChange={o => { if (!o) setDetalhe(null) }}
        tarefa={detalhe}
        podeMover
        movendo={movendo}
        onMover={status => { if (detalhe) moverTarefa(detalhe, status) }}
      />

      {resolvendo && (
        <ResolverDesafioDialog
          pending={resolver.isPending}
          onCancel={() => setResolvendo(null)}
          onConfirm={confirmarResolucao}
        />
      )}
    </div>
  )
}

// ─── Quadro Kanban ────────────────────────────────────────────────────────────

function Quadro({
  tarefas, meuId, ehAdmin, movendo, onAbrir, onMover, onExcluir,
}: {
  tarefas: Tarefa[]
  meuId: string | null
  ehAdmin: boolean
  movendo: boolean
  onAbrir: (t: Tarefa) => void
  onMover: (t: Tarefa, status: TarefaStatus) => void
  onExcluir: (t: Tarefa) => void
}) {
  const [dragOver, setDragOver] = useState<TarefaStatus | null>(null)
  const porStatus = (s: TarefaStatus) => tarefas.filter(t => t.status === s)

  function onDrop(e: React.DragEvent, status: TarefaStatus) {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData('text/plain')
    const t = tarefas.find(x => x.id === id)
    if (t) onMover(t, status)
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUNAS.map(col => {
        const itens = porStatus(col.status)
        const ativa = dragOver === col.status
        return (
          <div
            key={col.status}
            onDragOver={e => { e.preventDefault(); setDragOver(col.status) }}
            onDragLeave={() => setDragOver(prev => (prev === col.status ? null : prev))}
            onDrop={e => onDrop(e, col.status)}
            className={cn(
              'rounded-2xl border p-3 space-y-3 min-h-[160px] transition-colors',
              ativa ? 'border-accentBlue bg-accentBlue-soft/20' : 'border-line-soft bg-surface-subtle/40',
            )}
          >
            <div className="flex items-center justify-between px-1">
              <span className={cn('flex items-center gap-1.5 text-[12.5px] font-semibold', col.head)}>
                <span className={cn('h-2 w-2 rounded-full', col.dot)} />{col.label}
              </span>
              <span className="text-[11px] font-medium text-ink-muted tabular-nums">{itens.length}</span>
            </div>

            <div className="space-y-2.5">
              {itens.map(t => (
                <CardTarefa
                  key={t.id}
                  tarefa={t}
                  draggable
                  podeExcluir={t.criado_por === meuId || ehAdmin}
                  movendo={movendo}
                  onAbrir={() => onAbrir(t)}
                  onExcluir={() => onExcluir(t)}
                  onMoverRapido={status => onMover(t, status)}
                />
              ))}
              {itens.length === 0 && (
                <p className="px-1 py-6 text-center text-[11.5px] text-ink-subtle">Nada aqui.</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Card de tarefa ───────────────────────────────────────────────────────────

function CardTarefa({
  tarefa, draggable, podeExcluir, mostrarStatus, movendo, onAbrir, onExcluir, onMoverRapido,
}: {
  tarefa: Tarefa
  draggable?: boolean
  podeExcluir: boolean
  mostrarStatus?: boolean
  movendo?: boolean
  onAbrir: () => void
  onExcluir: () => void
  onMoverRapido?: (status: TarefaStatus) => void
}) {
  const concluida = tarefa.status === 'concluido'
  const destino = tarefa.atribuido_a
    ? { icon: <User className="h-3 w-3" />, label: tarefa.responsavel?.nome ?? 'Pessoa' }
    : tarefa.atribuido_time
      ? { icon: <Users className="h-3 w-3" />, label: `Geral · ${TIME_LABEL[tarefa.atribuido_time]}` }
      : { icon: <Users className="h-3 w-3" />, label: 'Geral' }

  // Próximo estado sugerido pro botão rápido (só no quadro).
  const proximo: TarefaStatus | null =
    tarefa.status === 'aberto' ? 'em_andamento'
    : tarefa.status === 'em_andamento' ? 'concluido'
    : null
  const proximoLabel = proximo === 'em_andamento' ? 'Começar' : tarefa.incidente_id ? 'Resolver' : 'Concluir'

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onClick={onAbrir}
      onKeyDown={e => { if (e.key === 'Enter') onAbrir() }}
      onDragStart={e => { e.dataTransfer.setData('text/plain', tarefa.id); e.dataTransfer.effectAllowed = 'move' }}
      className={cn(
        'card-surface p-3.5 space-y-2.5 text-left cursor-pointer transition-shadow hover:shadow-elevated',
        draggable && 'active:cursor-grabbing',
        concluida && 'opacity-75',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn('font-medium text-[13.5px] leading-snug', concluida ? 'text-ink-muted line-through' : 'text-ink')}>
          {tarefa.titulo}
        </p>
        {podeExcluir && (
          <button
            onClick={e => { e.stopPropagation(); onExcluir() }}
            aria-label="Excluir tarefa"
            className="btn-press -mr-1 -mt-0.5 h-6 w-6 flex-shrink-0 rounded-full text-ink-subtle hover:text-urg-highFg hover:bg-urg-highBg flex items-center justify-center"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {tarefa.incidente_id && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand-strong">
            <Ticket className="h-2.5 w-2.5" />Desafio
          </span>
        )}
        {mostrarStatus && (
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_CHIP[tarefa.status].cls)}>
            {STATUS_CHIP[tarefa.status].label}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-[10.5px] text-ink-secondary font-medium">
          {destino.icon}{destino.label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-ink-muted truncate">
          {tarefa.criador?.nome && <>de {tarefa.criador.nome} · </>}{tempoRelativo(tarefa.created_at)}
        </span>
        {onMoverRapido && proximo && (
          <button
            onClick={e => { e.stopPropagation(); onMoverRapido(proximo) }}
            disabled={movendo}
            className={cn(
              'btn-press inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-medium flex-shrink-0 disabled:opacity-50',
              proximo === 'concluido' ? 'bg-urg-lowFg text-white hover:opacity-90' : 'bg-accentBlue text-white hover:bg-accentBlue-hov',
            )}
          >
            <Check className="h-3 w-3" />{proximoLabel}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Dialog — Resolver desafio (pede a solução) ───────────────────────────────

function ResolverDesafioDialog({
  pending, onCancel, onConfirm,
}: {
  pending: boolean
  onCancel: () => void
  onConfirm: (solucao: string) => void
}) {
  const [solucao, setSolucao] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-canvas border border-line rounded-xl shadow-elevated w-full max-w-md mx-4 p-6 space-y-4 animate-fade-up">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">Resolver desafio</h2>
          <button onClick={onCancel} className="btn-press text-ink-subtle hover:text-ink-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[12.5px] text-ink-muted">
          Concluir a tarefa também marca o desafio como resolvido. Descreva como foi resolvido.
        </p>
        <textarea
          placeholder="Solução / resultado…"
          value={solucao}
          onChange={e => setSolucao(e.target.value)}
          rows={4}
          autoFocus
          className="w-full rounded-md bg-surface-canvas border border-line px-3 py-2 text-[13px] text-ink resize-none focus:outline-none focus:ring-2 focus:ring-accentBlue/30"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-ink-secondary">Cancelar</Button>
          <Button
            size="sm"
            disabled={pending || !solucao.trim()}
            onClick={() => onConfirm(solucao)}
            className="btn-press bg-urg-lowFg text-white hover:opacity-90"
          >
            {pending ? 'Resolvendo…' : 'Resolver e concluir'}
          </Button>
        </div>
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
