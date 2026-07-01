import { useEffect, useState } from 'react'
import { Search, Copy, Check, LifeBuoy } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useBuscarReunioesPorProfessor, coordenadorNomeDe, reuniaoDe, type ReuniaoBusca } from '@/hooks/useBuscarReunioes'

const statusCls: Record<string, string> = {
  realizada: 'bg-urg-lowBg text-urg-lowFg',
  pendente:  'bg-urg-medBg text-urg-medFg',
  cancelada: 'bg-urg-highBg text-urg-highFg',
}

const statusLabel: Record<string, string> = {
  realizada: 'Realizada',
  pendente:  'Pendente',
  cancelada: 'Cancelada',
}

export function SuporteReunioesPage() {
  const [input, setInput]   = useState('')
  const [termo, setTermo]   = useState('')

  useEffect(() => {
    const t = setTimeout(() => setTermo(input), 350)
    return () => clearTimeout(t)
  }, [input])

  const { data: resultados = [], isLoading, isFetching } = useBuscarReunioesPorProfessor(termo)

  return (
    <div className="px-6 py-6 max-w-[900px] mx-auto space-y-6">
      <header className="space-y-0.5">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-ink-secondary" />
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Buscar Reuniões</h1>
        </div>
        <p className="text-[13px] text-ink-muted">
          Encontre rapidamente a reunião de um professor e compartilhe o link.
        </p>
      </header>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Buscar por nome do professor…"
          className="h-11 pl-10 text-[14px] bg-surface-canvas border-line rounded-xl"
        />
      </div>

      {termo.trim().length < 2 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          Digite ao menos 2 letras do nome do professor para buscar.
        </div>
      ) : isLoading ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">Buscando…</div>
      ) : resultados.length === 0 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          Nenhuma reunião encontrada para "{termo}".
        </div>
      ) : (
        <ul className={cn('space-y-2.5', isFetching && 'opacity-60')}>
          {resultados.map(r => <ReuniaoRow key={r.id} r={r} />)}
        </ul>
      )}
    </div>
  )
}

function ReuniaoRow({ r }: { r: ReuniaoBusca }) {
  const [copiado, setCopiado] = useState(false)
  const reuniao = reuniaoDe(r)
  const coordNome = coordenadorNomeDe(r)
  const link = reuniao?.meet_link ?? null

  async function copiarLink() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopiado(true)
    toast.success('Link copiado.')
    setTimeout(() => setCopiado(false), 1800)
  }

  const dataFmt = reuniao?.data
    ? new Date(reuniao.data).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—'

  return (
    <li className="card-surface flex items-center justify-between gap-4 p-4">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13.5px] font-medium text-ink truncate">{r.professor?.nome ?? 'Professor removido'}</p>
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', statusCls[r.status] ?? 'bg-surface-subtle text-ink-secondary')}>
            {statusLabel[r.status] ?? r.status}
          </span>
          {r.numero != null && (
            <span className="text-[11px] text-ink-muted">{r.numero}ª reunião</span>
          )}
        </div>
        <p className="text-[12px] text-ink-muted truncate">
          Coord. {coordNome} · {dataFmt}
        </p>
      </div>

      <Button
        size="sm"
        variant="outline"
        disabled={!link}
        onClick={copiarLink}
        className="btn-press h-8 text-[12px] gap-1.5 border-line flex-shrink-0"
      >
        {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copiado ? 'Copiado' : link ? 'Copiar link' : 'Sem link'}
      </Button>
    </li>
  )
}
