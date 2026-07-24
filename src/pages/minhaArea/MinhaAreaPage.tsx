import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { NotebookPen, Lock, User, Users2, Search, Trash2 } from 'lucide-react'
import { useMinhasAnotacoes, useSalvarAnotacao, type MinhaAnotacaoItem } from '@/hooks/useAnotacoesInternas'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Perfil interno do coordenador: agrega TODAS as anotações internas que ele
// escreveu (privadas — a RLS só devolve as dele), com o contexto da reunião.
export function MinhaAreaPage() {
  const { data: anotacoes = [], isLoading } = useMinhasAnotacoes()
  const [busca, setBusca] = useState('')

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return anotacoes
    return anotacoes.filter(a => {
      const ctx = `${a.texto} ${a.reuniao?.titulo ?? ''} ${(a.reuniao?.professores ?? []).join(' ')}`.toLowerCase()
      return ctx.includes(q)
    })
  }, [anotacoes, busca])

  return (
    <div className="px-6 py-6 space-y-5 max-w-[900px] mx-auto">
      <header className="space-y-0.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Minha Área</h1>
        <p className="flex items-center gap-1.5 text-[13px] text-ink-muted">
          <Lock className="h-3.5 w-3.5" />
          Suas anotações internas de reunião — visíveis só para você.
        </p>
      </header>

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
            Abra uma reunião em Reuniões e use o botão de anotações para registrar notas privadas.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map(a => <AnotacaoCard key={a.id} item={a} />)}
        </div>
      )}
    </div>
  )
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function AnotacaoCard({ item }: { item: MinhaAnotacaoItem }) {
  const salvar = useSalvarAnotacao()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(item.texto)

  const r = item.reuniao
  const contexto = r
    ? (r.professores.length ? r.professores.join(', ') : r.titulo || 'Reunião interna')
    : 'Reunião removida'

  async function handleSalvar() {
    if (!r) return
    try {
      await salvar.mutateAsync({ reuniaoId: r.id, texto })
      toast.success(texto.trim() ? 'Anotação atualizada.' : 'Anotação removida.')
      setEditando(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar.')
    }
  }

  return (
    <div className="card-surface p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium',
            r?.tipo_reuniao === 'interna' ? 'bg-surface-subtle text-ink-secondary' : 'bg-accentBlue-soft text-accentBlue',
          )}>
            {r?.tipo_reuniao === 'interna' ? <Users2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {r?.tipo_reuniao === 'interna' ? 'Interna' : 'Professor'}
          </span>
          <span className="text-[13px] font-medium text-ink truncate">{contexto}</span>
        </div>
        {r && <span className="text-[11px] text-ink-muted tabular-nums flex-shrink-0">{fmtData(r.data)}</span>}
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
              disabled={salvar.isPending}
              className="btn-press rounded-md bg-accentBlue px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accentBlue-hov disabled:opacity-50"
            >
              {salvar.isPending ? 'Salvando…' : 'Salvar'}
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
