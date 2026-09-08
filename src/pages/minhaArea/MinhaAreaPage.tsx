import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { NotebookPen, Lock, User, Users2, Search, Trash2, FolderKanban, CircleHelp, Plus, Pin, PinOff, StickyNote } from 'lucide-react'
import {
  useMinhasAnotacoes,
  useCriarAnotacaoAvulsa,
  useEditarAnotacao,
  useFixarAnotacao,
  type MinhaAnotacaoItem,
} from '@/hooks/useAnotacoesInternas'
import { useMeusProjetos } from '@/hooks/useProjetos'
import { MeusProjetosPanel } from '@/components/projetos/MeusProjetosPanel'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Aba = 'anotacoes' | 'projetos'

// Espaço pessoal: as anotações privadas (de reunião ou avulsas) e os projetos que a
// pessoa sugeriu — inclusive os pedidos de informação que a liderança mandou e
// que estão esperando resposta dela (o sino aponta pra cá).
export function MinhaAreaPage() {
  const { data: anotacoes = [], isLoading } = useMinhasAnotacoes()
  const { pedidosAbertos } = useMeusProjetos()
  const [params] = useSearchParams()
  const [aba, setAba] = useState<Aba>(params.get('aba') === 'projetos' ? 'projetos' : 'anotacoes')
  const [busca, setBusca] = useState('')

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return anotacoes
    return anotacoes.filter(a => {
      const ctx = `${a.texto} ${a.reuniao?.titulo ?? ''} ${(a.reuniao?.professores ?? []).join(' ')}`.toLowerCase()
      return ctx.includes(q)
    })
  }, [anotacoes, busca])

  // Fixadas em cima, o resto embaixo — a divisão só aparece quando existe nota fixada.
  const fixadas = useMemo(() => lista.filter(a => a.fixada), [lista])
  const soltas = useMemo(() => lista.filter(a => !a.fixada), [lista])

  return (
    <div className="px-6 py-6 space-y-5 max-w-[900px] mx-auto">
      <header className="space-y-0.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Minha Área</h1>
        <p className="flex items-center gap-1.5 text-[13px] text-ink-muted">
          <Lock className="h-3.5 w-3.5" />
          {aba === 'anotacoes'
            ? 'Suas anotações — de reunião ou escritas aqui, visíveis só para você.'
            : 'Os projetos que você sugeriu e o que a liderança está perguntando.'}
        </p>
      </header>

      <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-canvas p-1 w-fit">
        {([
          { key: 'anotacoes', label: 'Anotações', icone: <NotebookPen className="h-3.5 w-3.5" />, n: 0 },
          { key: 'projetos',  label: 'Projetos',  icone: <FolderKanban className="h-3.5 w-3.5" />, n: pedidosAbertos.length },
        ] as { key: Aba; label: string; icone: React.ReactNode; n: number }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setAba(t.key)}
            className={cn(
              'btn-press inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
              aba === t.key ? 'bg-surface-subtle text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {t.icone}{t.label}
            {t.n > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-aviso-warnBg px-1.5 py-0.5 text-[10px] font-semibold text-aviso-warnFg">
                <CircleHelp className="h-2.5 w-2.5" />{t.n}
              </span>
            )}
          </button>
        ))}
      </div>

      {aba === 'projetos' ? <MeusProjetosPanel /> : <>

      <NovaAnotacao />

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
        <Input
          placeholder="Buscar nas anotações…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="pl-9 h-9 bg-surface-canvas border-line"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-surface p-4 h-24 animate-pulse bg-surface-subtle/50" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <div className="card-surface flex flex-col items-center justify-center gap-2 py-16 text-center">
          <NotebookPen className="h-7 w-7 text-ink-subtle" />
          <p className="text-[13px] text-ink-secondary font-medium">
            {busca ? 'Nenhuma anotação encontrada.' : 'Você ainda não escreveu anotações.'}
          </p>
          <p className="text-[12px] text-ink-muted max-w-xs">
            Escreva uma aqui em cima, ou abra uma reunião em Reuniões e use o botão de anotações.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {fixadas.length > 0 && (
            <section className="space-y-3">
              <TituloSecao icone={<Pin className="h-3.5 w-3.5" />} texto="Fixadas" n={fixadas.length} />
              {fixadas.map(a => <AnotacaoCard key={a.id} item={a} />)}
            </section>
          )}
          {soltas.length > 0 && (
            <section className="space-y-3">
              {fixadas.length > 0 && (
                <TituloSecao icone={<NotebookPen className="h-3.5 w-3.5" />} texto="Outras" n={soltas.length} />
              )}
              {soltas.map(a => <AnotacaoCard key={a.id} item={a} />)}
            </section>
          )}
        </div>
      )}

      </>}
    </div>
  )
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function TituloSecao({ icone, texto, n }: { icone: React.ReactNode; texto: string; n: number }) {
  return (
    <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
      {icone}{texto}
      <span className="text-ink-subtle tabular-nums font-normal normal-case tracking-normal">({n})</span>
    </h2>
  )
}

// Nota escrita aqui mesmo, sem reunião nenhuma por trás.
function NovaAnotacao() {
  const criar = useCriarAnotacaoAvulsa()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')

  function fechar() {
    setTexto('')
    setAberto(false)
  }

  async function handleSalvar() {
    try {
      await criar.mutateAsync(texto)
      toast.success('Anotação criada.')
      fechar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar anotação.')
    }
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="btn-press card-surface flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-ink-muted transition-colors hover:text-ink-secondary"
      >
        <Plus className="h-4 w-4 text-accentBlue" />
        Escrever uma anotação…
      </button>
    )
  }

  return (
    <div className="card-surface p-4 space-y-2.5">
      <p className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
        <Lock className="h-3 w-3" /> Só você vê esta anotação.
      </p>
      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        rows={4}
        autoFocus
        placeholder="O que você quer registrar?"
        className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
      />
      <div className="flex items-center justify-end gap-2">
        <button onClick={fechar} className="btn-press text-[12px] text-ink-secondary hover:text-ink">
          Cancelar
        </button>
        <button
          onClick={handleSalvar}
          disabled={criar.isPending || !texto.trim()}
          className="btn-press rounded-md bg-accentBlue px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accentBlue-hov disabled:opacity-50"
        >
          {criar.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
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
    : 'Anotação pessoal'

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
    <div className={cn('card-surface p-4 space-y-2.5', item.fixada && 'border-accentBlue/40')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium',
            avulsa || r?.tipo_reuniao === 'interna'
              ? 'bg-surface-subtle text-ink-secondary'
              : 'bg-accentBlue-soft text-accentBlue',
          )}>
            {avulsa
              ? <><StickyNote className="h-3 w-3" />Pessoal</>
              : r?.tipo_reuniao === 'interna'
                ? <><Users2 className="h-3 w-3" />Interna</>
                : <><User className="h-3 w-3" />Professor</>}
          </span>
          <span className="text-[13px] font-medium text-ink truncate">{contexto}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-ink-muted tabular-nums">
            {fmtData(r ? r.data : item.updated_at)}
          </span>
          <button
            onClick={handleFixar}
            disabled={fixar.isPending}
            title={item.fixada ? 'Desafixar' : 'Fixar no topo'}
            className={cn(
              'btn-press flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-50',
              item.fixada
                ? 'text-accentBlue bg-accentBlue-soft'
                : 'text-ink-muted hover:bg-surface-subtle hover:text-ink',
            )}
          >
            {item.fixada ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {editando ? (
        <div className="space-y-2">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={4}
            className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-accentBlue"
          />
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setTexto(item.texto); setEditando(false) }} className="btn-press text-[12px] text-ink-secondary hover:text-ink">
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={editar.isPending}
              className="btn-press rounded-md bg-accentBlue px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accentBlue-hov disabled:opacity-50"
            >
              {editar.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="group flex items-start justify-between gap-3">
          <p className="text-[13px] text-ink-secondary leading-relaxed whitespace-pre-wrap">{item.texto}</p>
          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditando(true)} title="Editar" className="btn-press flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-surface-subtle hover:text-ink">
              <NotebookPen className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { setTexto(''); setEditando(true) }} title="Apagar" className="btn-press flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-urg-highBg hover:text-urg-highFg">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
