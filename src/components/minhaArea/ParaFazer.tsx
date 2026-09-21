import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Check, CheckCircle2, ChevronDown, CircleHelp, FolderKanban, PauseCircle, Plus, Send, Ticket, Trash2, Undo2,
  NotebookPen, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Abas } from '@/components/ui/abas'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import {
  useParaFazer, GRUPOS, type Escopo, type GrupoPrazo, type ItemParaFazer, type TipoItem,
} from '@/hooks/useParaFazer'
import {
  useConcluirTarefa, useReabrirTarefa, useExcluirTarefa, useMoverTarefa, type Tarefa, type TarefaStatus,
} from '@/hooks/useTarefas'
import {
  useAssumirIncidente, useLargarIncidente, useResolverIncidente, useReabrirIncidente,
} from '@/hooks/useIncidentes'
import { useEncerrarPausa } from '@/hooks/usePausas'
import { useResponderInfo } from '@/hooks/useProjetos'
import { TarefaDetalheDialog } from '@/components/tarefas/TarefaDetalheDialog'
import { NovaTarefaDialog } from '@/components/tarefas/NovaTarefaDialog'
import { ResolverDesafioDialog } from '@/components/tarefas/ResolverDesafioDialog'
import { MensagensDoDia } from './MensagensDoDia'
import { Anotacoes, ID_NOVA_ANOTACAO } from './Anotacoes'

// ─────────────────────────────────────────────────────────────────────────────
// Para fazer — o miolo da Minha Área. Uma lista só, agrupada pelo prazo, em que
// cada item se resolve ali mesmo (concluir, encerrar a pausa, resolver o
// desafio, responder a pergunta). Substitui o quadro Aberto/Em andamento/
// Concluído de Tarefas: das 36 tarefas até 2026-09, só 1 foi escrita à mão — o
// resto o sistema criou, e cada tipo já tem a sua ação própria.
// ─────────────────────────────────────────────────────────────────────────────

const ICONE: Record<TipoItem, LucideIcon> = {
  tarefa: Check, pausa: PauseCircle, incidente: Ticket, pergunta: CircleHelp, aprovacao: FolderKanban,
}
const TIPO_LABEL: Record<TipoItem, string> = {
  tarefa: 'Tarefa', pausa: 'Fim de pausa', incidente: 'Desafio assumido', pergunta: 'Pergunta da liderança', aprovacao: 'Projeto',
}
const CHIP_PRAZO: Record<GrupoPrazo, string> = {
  atrasado: 'bg-urg-highBg text-urg-highFg',
  hoje: 'bg-aviso-warnBg text-aviso-warnFg',
  proximos: 'bg-surface-subtle text-ink-secondary',
  sem_prazo: 'bg-surface-subtle text-ink-muted',
}

interface Props {
  veTarefas: boolean
  veProjetos: boolean
  veMensagens: boolean
  veAnotacoes: boolean
}

export function ParaFazer({ veTarefas, veProjetos, veMensagens, veAnotacoes }: Props) {
  const { profile } = useAuth()
  const meuId = profile?.id ?? null
  const ehAdmin = profile?.is_admin === true || profile?.role === 'admin'
  const podeCriarTarefa = veTarefas && canEdit(profile)

  const [escopo, setEscopo] = useState<Escopo>('minhas')
  const dados = useParaFazer({ tarefas: veTarefas, projetos: veProjetos, mensagens: veMensagens, escopo })
  const podeVerTodas = dados.souLideranca

  const [novaTarefa, setNovaTarefa] = useState(false)
  const [detalhe, setDetalhe] = useState<Tarefa | null>(null)
  const [resolvendo, setResolvendo] = useState<Tarefa | null>(null)
  const [verConcluidas, setVerConcluidas] = useState(false)

  const mover = useMoverTarefa()
  const assumir = useAssumirIncidente()
  const largar = useLargarIncidente()
  const resolver = useResolverIncidente()
  const reabrirInc = useReabrirIncidente()
  const movendo = mover.isPending || assumir.isPending || largar.isPending || resolver.isPending || reabrirInc.isPending

  // Mesmas regras do antigo quadro: tarefa de desafio anda pelo incidente.
  async function moverTarefa(t: Tarefa, status: TarefaStatus) {
    if (status === t.status || movendo) return
    if (!t.incidente_id) {
      mover.mutate({ id: t.id, status }, {
        onSuccess: () => toast.success(status === 'concluido' ? 'Tarefa concluída.' : 'Tarefa atualizada.'),
        onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao atualizar.'),
      })
      return
    }
    if (status === 'concluido') { setResolvendo(t); return }
    const id = t.incidente_id
    try {
      if (status === 'em_andamento') {
        if (t.status === 'concluido') await reabrirInc.mutateAsync({ id })
        else await assumir.mutateAsync({ id })
      } else {
        if (t.status === 'concluido') await reabrirInc.mutateAsync({ id })
        await largar.mutateAsync({ id })
      }
      toast.success('Tarefa atualizada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar — verifique sua permissão.')
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

  function escreverAnotacao() {
    const el = document.getElementById(ID_NOVA_ANOTACAO)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.focus()
  }

  const porGrupo = GRUPOS
    .map(g => ({ ...g, itens: dados.itens.filter(i => i.grupo === g.id) }))
    .filter(g => g.itens.length > 0)
  const mostraMensagens = veMensagens && escopo === 'minhas'
  const vazio = !dados.isLoading && dados.itens.length === 0

  return (
    <div className={cn('grid items-start gap-6', veAnotacoes && 'lg:grid-cols-[minmax(0,1fr)_300px]')}>
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {veTarefas ? (
            <Abas<Escopo>
              ariaLabel="De quem"
              tamanho="sm"
              valor={escopo}
              onChange={setEscopo}
              abas={[
                { id: 'minhas', label: 'Minhas' },
                { id: 'pedi', label: 'Que eu pedi' },
                ...(podeVerTodas ? [{ id: 'todas' as const, label: 'Todas' }] : []),
              ]}
            />
          ) : <span />}
          <div className="flex items-center gap-2">
            {veAnotacoes && (
              <Button size="sm" variant="outline" onClick={escreverAnotacao} className="h-8 gap-1.5 lg:hidden">
                <NotebookPen className="h-3.5 w-3.5" />Anotação
              </Button>
            )}
            {podeCriarTarefa && (
              <Button size="sm" onClick={() => setNovaTarefa(true)} className="btn-press h-8 gap-1.5 bg-accentBlue text-white hover:bg-accentBlue-hov">
                <Plus className="h-3.5 w-3.5" />Tarefa
              </Button>
            )}
          </div>
        </div>

        {mostraMensagens && <MensagensDoDia />}

        {dados.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-subtle" />)}
          </div>
        ) : vazio ? (
          <div className="card-surface flex items-center gap-2.5 px-4 py-5 text-[13px] text-ink-muted">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-urg-lowFg" />
            {escopo === 'pedi'
              ? 'Nada do que você pediu está em aberto.'
              : escopo === 'todas' ? 'Nenhuma tarefa em aberto.' : 'Nada pendente com você.'}
          </div>
        ) : (
          porGrupo.map(g => (
            <section key={g.id} className="space-y-1.5" aria-label={g.label}>
              <h2 className={cn('label-micro flex items-center gap-1.5 px-1', g.id === 'atrasado' && 'text-urg-highFg')}>
                {g.label}<span className="font-normal tabular-nums text-ink-subtle">{g.itens.length}</span>
              </h2>
              <ul className="card-surface divide-y divide-line-soft">
                {g.itens.map(it => (
                  <LinhaItem
                    key={it.chave}
                    item={it}
                    podeExcluir={!!it.tarefa && (it.tarefa.criado_por === meuId || ehAdmin)}
                    podeEncerrarPausa={canEdit(profile)}
                    onAbrir={() => it.tarefa && setDetalhe(it.tarefa)}
                    onResolver={() => it.tarefa && setResolvendo(it.tarefa)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}

        {dados.concluidasHoje.length > 0 && (
          <section className="space-y-1.5">
            <button
              type="button"
              onClick={() => setVerConcluidas(v => !v)}
              aria-expanded={verConcluidas}
              className="btn-press label-micro flex items-center gap-1.5 px-1 hover:text-ink"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !verConcluidas && '-rotate-90')} />
              Concluídas hoje<span className="font-normal tabular-nums text-ink-subtle">{dados.concluidasHoje.length}</span>
            </button>
            {verConcluidas && (
              <ul className="card-surface divide-y divide-line-soft">
                {dados.concluidasHoje.map(t => <LinhaConcluida key={t.id} tarefa={t} onAbrir={() => setDetalhe(t)} />)}
              </ul>
            )}
          </section>
        )}
      </div>

      {veAnotacoes && <Anotacoes />}

      {novaTarefa && <NovaTarefaDialog onClose={() => setNovaTarefa(false)} />}

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

// ─── Linha ───────────────────────────────────────────────────────────────────

function LinhaItem({ item, podeExcluir, podeEncerrarPausa, onAbrir, onResolver }: {
  item: ItemParaFazer
  podeExcluir: boolean
  podeEncerrarPausa: boolean
  onAbrir: () => void
  onResolver: () => void
}) {
  const concluir = useConcluirTarefa()
  const excluir = useExcluirTarefa()
  const encerrar = useEncerrarPausa()
  const responder = useResponderInfo()
  const [respondendo, setRespondendo] = useState(false)
  const [resposta, setResposta] = useState('')
  const [confirmandoPausa, setConfirmandoPausa] = useState(false)

  const Icone = ICONE[item.tipo]
  const ehTarefa = item.tipo === 'tarefa'
  const linkProjeto = item.pedido ? `/projetos/${item.pedido.projeto_id}` : item.projeto ? `/projetos/${item.projeto.id}` : null

  function handleConcluir() {
    if (!item.tarefa) return
    concluir.mutate(item.tarefa.id, {
      onSuccess: () => toast.success('Tarefa concluída.'),
      onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao concluir.'),
    })
  }

  function handleEncerrarPausa() {
    if (!item.pausa) return
    if (!confirmandoPausa) {
      setConfirmandoPausa(true)
      setTimeout(() => setConfirmandoPausa(false), 5000)
      return
    }
    encerrar.mutate(item.pausa.professor_id, {
      onSuccess: () => toast.success('Pausa encerrada. O professor voltou a ficar ativo.'),
      onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao encerrar a pausa.'),
    })
  }

  async function handleResponder() {
    if (!item.pedido || !resposta.trim()) return
    try {
      await responder.mutateAsync({ id: item.pedido.id, resposta })
      toast.success('Resposta enviada para quem perguntou.')
      setRespondendo(false)
      setResposta('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao responder.')
    }
  }

  const titulo = linkProjeto
    ? <Link to={linkProjeto} className="line-clamp-2 text-[13px] font-medium text-ink hover:text-accentBlue hover:underline">{item.titulo}</Link>
    : <button type="button" onClick={onAbrir} className="line-clamp-2 text-left text-[13px] font-medium text-ink hover:text-accentBlue hover:underline">{item.titulo}</button>

  return (
    <li className="group px-4 py-2.5">
      {/* No celular as ações descem para baixo do texto (alinhadas com ele). */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        {ehTarefa ? (
          <button
            type="button"
            onClick={handleConcluir}
            disabled={concluir.isPending}
            title="Concluir"
            aria-label={`Concluir: ${item.titulo}`}
            className="btn-press mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-line text-transparent transition-colors hover:border-urg-lowFg hover:text-urg-lowFg disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
          </button>
        ) : (
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-surface-subtle text-ink-secondary" title={TIPO_LABEL[item.tipo]}>
            <Icone className="h-3 w-3" />
          </span>
        )}

        <div className="min-w-0 flex-1 basis-[calc(100%-2rem)] space-y-0.5 sm:basis-0">
          {titulo}
          <p className="truncate text-[11.5px] text-ink-muted">
            {TIPO_LABEL[item.tipo]}{item.contexto && <> · {item.contexto}</>}
          </p>
        </div>

        <div className="ml-8 flex flex-shrink-0 flex-wrap items-center gap-1.5 sm:ml-0 sm:justify-end">
          {item.prazoRotulo && (
            <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium tabular-nums', CHIP_PRAZO[item.grupo])}>
              {item.prazoRotulo}
            </span>
          )}

          {item.tipo === 'pausa' && podeEncerrarPausa && (
            <button
              type="button"
              onClick={handleEncerrarPausa}
              disabled={encerrar.isPending}
              title="Registra que o contato aconteceu e tira o professor da pausa."
              className={cn(
                'btn-press whitespace-nowrap rounded-md px-2.5 py-1 text-[11.5px] font-medium disabled:opacity-50',
                confirmandoPausa ? 'bg-urg-lowFg text-white hover:opacity-90' : 'border border-line text-ink-secondary hover:text-ink',
              )}
            >
              {encerrar.isPending ? 'Encerrando…' : confirmandoPausa ? 'Confirmar' : 'Encerrar pausa'}
            </button>
          )}
          {item.tipo === 'pausa' && !podeEncerrarPausa && (
            <Link to="/solicitacoes" className="btn-press whitespace-nowrap rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary hover:text-ink">
              Ver pausa
            </Link>
          )}
          {item.tipo === 'incidente' && (
            <button
              type="button"
              onClick={onResolver}
              className="btn-press whitespace-nowrap rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary hover:text-ink"
            >
              Resolver
            </button>
          )}
          {item.tipo === 'pergunta' && (
            <button
              type="button"
              onClick={() => setRespondendo(v => !v)}
              className="btn-press whitespace-nowrap rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary hover:text-ink"
            >
              Responder
            </button>
          )}
          {item.tipo === 'aprovacao' && linkProjeto && (
            <Link to={linkProjeto} className="btn-press whitespace-nowrap rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary hover:text-ink">
              Avaliar
            </Link>
          )}
          {podeExcluir && ehTarefa && (
            <button
              type="button"
              onClick={() => excluir.mutate(item.tarefa!.id, {
                onSuccess: () => toast.success('Tarefa excluída.'),
                onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao excluir.'),
              })}
              title="Excluir tarefa"
              aria-label="Excluir tarefa"
              className="btn-press flex h-6 w-6 items-center justify-center rounded-full text-ink-subtle opacity-0 transition-opacity hover:bg-urg-highBg hover:text-urg-highFg focus:opacity-100 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {respondendo && item.pedido && (
        <div className="ml-8 mt-2 space-y-2">
          <p className="whitespace-pre-wrap rounded-md bg-surface-subtle px-3 py-2 text-[12.5px] leading-relaxed text-ink-secondary">{item.pedido.pergunta}</p>
          <textarea
            value={resposta}
            onChange={e => setResposta(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Sua resposta…"
            className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRespondendo(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleResponder} disabled={responder.isPending || !resposta.trim()}>
              <Send />Responder
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

function LinhaConcluida({ tarefa, onAbrir }: { tarefa: Tarefa; onAbrir: () => void }) {
  const reabrir = useReabrirTarefa()
  // Só a tarefa avulsa volta com um clique; as de pausa e de desafio voltam
  // pela própria origem (reabrir o incidente, a pausa).
  const avulsa = !tarefa.incidente_id && !tarefa.titulo.startsWith('Encerrar pausa:')
  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-urg-lowFg text-white">
        <Check className="h-3 w-3" />
      </span>
      <button type="button" onClick={onAbrir} className="min-w-0 flex-1 truncate text-left text-[13px] text-ink-muted line-through hover:text-ink">
        {tarefa.titulo}
      </button>
      {avulsa && (
        <button
          type="button"
          onClick={() => reabrir.mutate(tarefa.id, {
            onSuccess: () => toast.success('Tarefa reaberta.'),
            onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao reabrir.'),
          })}
          disabled={reabrir.isPending}
          className="btn-press inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-secondary hover:text-ink disabled:opacity-50"
        >
          <Undo2 className="h-3 w-3" />Desfazer
        </button>
      )}
    </li>
  )
}
