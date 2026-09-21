import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { NotebookPen, Lock, User, Users2, Search, Trash2, Pin, PinOff, StickyNote } from 'lucide-react'
import {
  useMinhasAnotacoes,
  useCriarAnotacaoAvulsa,
  useEditarAnotacao,
  useFixarAnotacao,
  type MinhaAnotacaoItem,
} from '@/hooks/useAnotacoesInternas'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Anotações — a coluna ao lado da lista Para fazer. As privadas de reunião e as
// avulsas, visíveis só para quem escreveu. A caixa de escrever fica sempre
// aberta (anotar é coisa de meio de conversa); na lista, as fixadas e as 3
// mais recentes, e o resto atrás de "Ver todas".
// ─────────────────────────────────────────────────────────────────────────────

export const ID_NOVA_ANOTACAO = 'nova-anotacao'
const RECENTES = 3

export function Anotacoes() {
  const { data: anotacoes = [], isLoading } = useMinhasAnotacoes()
  const [verTodas, setVerTodas] = useState(false)
  const [busca, setBusca] = useState('')

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return anotacoes
    return anotacoes.filter(a =>
      `${a.texto} ${a.reuniao?.titulo ?? ''} ${(a.reuniao?.professores ?? []).join(' ')}`.toLowerCase().includes(q),
    )
  }, [anotacoes, busca])

  const fixadas = filtradas.filter(a => a.fixada)
  const soltas = filtradas.filter(a => !a.fixada)
  const visiveis = verTodas ? soltas : soltas.slice(0, RECENTES)
  const escondidas = soltas.length - visiveis.length

  return (
    <aside className="space-y-3" aria-label="Anotações">
      <div className="flex items-center justify-between gap-2">
        <h2 className="label-micro flex items-center gap-1.5"><NotebookPen className="h-3.5 w-3.5" />Anotações</h2>
        <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted"><Lock className="h-3 w-3" />só você vê</span>
      </div>

      <NovaAnotacao />

      {verTodas && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
          <Input
            placeholder="Buscar nas anotações…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="h-8 border-line bg-surface-canvas pl-9 text-[12.5px]"
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-subtle" />)}
        </div>
      ) : filtradas.length === 0 ? (
        <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
          {busca
            ? 'Nenhuma anotação encontrada.'
            : 'Nada anotado ainda. Escreva aqui, ou use o botão de anotações dentro de uma reunião.'}
        </p>
      ) : (
        <div className="space-y-2">
          {fixadas.map(a => <AnotacaoCard key={a.id} item={a} />)}
          {visiveis.map(a => <AnotacaoCard key={a.id} item={a} />)}
        </div>
      )}

      {(escondidas > 0 || verTodas) && (
        <button
          type="button"
          onClick={() => { setVerTodas(v => !v); setBusca('') }}
          className="btn-press text-[12px] font-medium text-accentBlue hover:underline"
        >
          {verTodas ? 'Mostrar só as recentes' : `Ver todas (${anotacoes.length})`}
        </button>
      )}
    </aside>
  )
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Nota escrita aqui mesmo, sem reunião por trás. A caixa fica sempre à mão.
function NovaAnotacao() {
  const criar = useCriarAnotacaoAvulsa()
  const [texto, setTexto] = useState('')

  async function handleSalvar() {
    try {
      await criar.mutateAsync(texto)
      toast.success('Anotação salva.')
      setTexto('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar anotação.')
    }
  }

  return (
    <div className="card-surface space-y-2 p-2.5">
      <textarea
        id={ID_NOVA_ANOTACAO}
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim()) handleSalvar() }}
        rows={texto ? 4 : 2}
        placeholder="Escrever uma anotação…"
        className="w-full resize-y rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-ink placeholder:text-ink-subtle focus:border-line focus:outline-none"
      />
      {texto.trim() && (
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-[10.5px] text-ink-subtle">Ctrl+Enter salva</span>
          <button type="button" onClick={() => setTexto('')} className="btn-press text-[12px] text-ink-secondary hover:text-ink">
            Limpar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={criar.isPending}
            className="btn-press rounded-md bg-accentBlue px-3 py-1 text-[12px] font-medium text-white hover:bg-accentBlue-hov disabled:opacity-50"
          >
            {criar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      )}
    </div>
  )
}

function AnotacaoCard({ item }: { item: MinhaAnotacaoItem }) {
  const editar = useEditarAnotacao()
  const fixar = useFixarAnotacao()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(item.texto)

  const r = item.reuniao
  const avulsa = !r
  const contexto = r
    ? (r.professores.length ? r.professores.join(', ') : r.titulo || 'Reunião interna')
    : 'Pessoal'

  async function handleSalvar() {
    try {
      await editar.mutateAsync({ id: item.id, texto })
      toast.success(texto.trim() ? 'Anotação atualizada.' : 'Anotação removida.')
      setEditando(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar.')
    }
  }

  async function handleFixar() {
    try {
      await fixar.mutateAsync({ id: item.id, fixada: !item.fixada })
      toast.success(item.fixada ? 'Anotação desafixada.' : 'Anotação fixada no topo.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao fixar.')
    }
  }

  return (
    <div className={cn('card-surface group space-y-1.5 p-3', item.fixada && 'border-accentBlue')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-muted">
          {avulsa
            ? <StickyNote className="h-3 w-3 flex-shrink-0" />
            : r?.tipo_reuniao === 'interna' ? <Users2 className="h-3 w-3 flex-shrink-0" /> : <User className="h-3 w-3 flex-shrink-0" />}
          <span className="truncate">{contexto}</span>
          <span className="flex-shrink-0 tabular-nums">· {fmtData(r ? r.data : item.updated_at)}</span>
        </span>
        <div className="flex flex-shrink-0 items-center">
          {!editando && (
            <>
              <button
                type="button"
                onClick={() => setEditando(true)}
                title="Editar"
                aria-label="Editar anotação"
                className="btn-press flex h-6 w-6 items-center justify-center rounded-full text-ink-muted opacity-0 transition-opacity hover:bg-surface-subtle hover:text-ink focus:opacity-100 group-hover:opacity-100"
              >
                <NotebookPen className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => { setTexto(''); setEditando(true) }}
                title="Apagar"
                aria-label="Apagar anotação"
                className="btn-press flex h-6 w-6 items-center justify-center rounded-full text-ink-muted opacity-0 transition-opacity hover:bg-urg-highBg hover:text-urg-highFg focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleFixar}
            disabled={fixar.isPending}
            title={item.fixada ? 'Desafixar' : 'Fixar no topo'}
            aria-label={item.fixada ? 'Desafixar' : 'Fixar no topo'}
            className={cn(
              'btn-press flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-50',
              item.fixada ? 'bg-accentBlue-soft text-accentBlue' : 'text-ink-muted hover:bg-surface-subtle hover:text-ink',
            )}
          >
            {item.fixada ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {editando ? (
        <div className="space-y-2">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={4}
            autoFocus
            className="w-full resize-y rounded-md border border-line bg-surface-canvas px-2.5 py-1.5 text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-accentBlue"
          />
          {!texto.trim() && <p className="text-[11px] text-urg-highFg">Salvar vazio apaga a anotação.</p>}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setTexto(item.texto); setEditando(false) }} className="btn-press text-[12px] text-ink-secondary hover:text-ink">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSalvar}
              disabled={editar.isPending}
              className="btn-press rounded-md bg-accentBlue px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accentBlue-hov disabled:opacity-50"
            >
              {editar.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-secondary">{item.texto}</p>
      )}
    </div>
  )
}
