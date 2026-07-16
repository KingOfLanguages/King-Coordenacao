import { useEffect, useState } from 'react'
import { Search, Copy, Check, LifeBuoy, Clock, User2, ChevronLeft, ChevronRight, CalendarDays, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildMensagemReuniaoDoDia, linkWhatsApp } from '@/lib/messageTemplates'
import {
  useBuscarReunioesPorProfessor, useReunioesDoDia,
  coordenadorNomeDe, reuniaoDe, type ReuniaoBusca,
} from '@/hooks/useBuscarReunioes'

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

/** Data no formato do <input type="date"> em horário LOCAL. */
function paraInputDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function somarDias(diaISO: string, n: number): string {
  const [y, m, d] = diaISO.split('-').map(Number)
  return paraInputDate(new Date(y, m - 1, d + n))
}

function labelDia(diaISO: string): string {
  const hojeISO = paraInputDate(new Date())
  if (diaISO === hojeISO) return 'Hoje'
  if (diaISO === somarDias(hojeISO, -1)) return 'Ontem'
  if (diaISO === somarDias(hojeISO, 1)) return 'Amanhã'
  const [y, m, d] = diaISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function horaDe(r: ReuniaoBusca): string | null {
  const reuniao = reuniaoDe(r)
  return reuniao?.data
    ? new Date(reuniao.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null
}

export function SuporteReunioesPage() {
  const [input, setInput]   = useState('')
  const [termo, setTermo]   = useState('')
  const [dia, setDia]       = useState(() => paraInputDate(new Date()))

  useEffect(() => {
    const t = setTimeout(() => setTermo(input), 350)
    return () => clearTimeout(t)
  }, [input])

  const buscando = termo.trim().length >= 2
  const busca = useBuscarReunioesPorProfessor(termo)
  const doDia = useReunioesDoDia(dia)

  const { data: resultados = [], isLoading, isFetching } = buscando ? busca : doDia

  const ehHoje = labelDia(dia) === 'Hoje'
  // Bloco lateral de mensagens: só na visão do dia (não na busca por nome) e
  // quando há reuniões marcadas — as mensagens acompanham as reuniões do dia.
  const mostrarBloco = !buscando && !isLoading && resultados.length > 0

  const lista = (
    <ul className={cn('space-y-2.5', isFetching && 'opacity-60')}>
      {resultados.map(r => <ReuniaoRow key={r.id} r={r} mostrarData={buscando} />)}
    </ul>
  )

  return (
    <div className="px-6 py-6 max-w-[1200px] mx-auto space-y-6">
      <header className="space-y-0.5">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-ink-secondary" />
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Buscar Reuniões</h1>
        </div>
        <p className="text-[13px] text-ink-muted">
          Veja as reuniões do dia ou encontre rapidamente a de um professor específico.
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

      {!buscando && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-ink-muted" />
            <span className="text-[13px] font-medium text-ink">{labelDia(dia)}</span>
            <span className="text-[12px] text-ink-muted">
              {(() => {
                const [y, m, d] = dia.split('-').map(Number)
                return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
              })()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" className="btn-press h-8 w-8 border-line" onClick={() => setDia(d => somarDias(d, -1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm" variant="outline"
              className="btn-press h-8 text-[12px] border-line"
              onClick={() => setDia(paraInputDate(new Date()))}
            >
              Hoje
            </Button>
            <Button size="icon-sm" variant="outline" className="btn-press h-8 w-8 border-line" onClick={() => setDia(d => somarDias(d, 1))}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">Carregando…</div>
      ) : resultados.length === 0 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          {buscando ? `Nenhuma reunião encontrada para "${termo}".` : 'Nenhuma reunião marcada para este dia.'}
        </div>
      ) : mostrarBloco ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
          {lista}
          <MensagensDoDia reunioes={resultados} ehHoje={ehHoje} />
        </div>
      ) : (
        lista
      )}
    </div>
  )
}

function ReuniaoRow({ r, mostrarData }: { r: ReuniaoBusca; mostrarData: boolean }) {
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

  const horaFmt = reuniao?.data
    ? new Date(reuniao.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—'
  const dataFmt = reuniao?.data
    ? new Date(reuniao.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'

  return (
    <li className="card-surface flex items-center justify-between gap-4 p-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col items-center justify-center flex-shrink-0 rounded-xl bg-accentBlue-soft px-3 py-1.5 min-w-[64px]">
          <span className="flex items-center gap-1 text-[15px] font-semibold text-accentBlue tabular-nums leading-tight">
            <Clock className="h-3.5 w-3.5" />{horaFmt}
          </span>
          {mostrarData && <span className="text-[10.5px] text-accentBlue/80 tabular-nums">{dataFmt}</span>}
        </div>

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
          <p className="flex items-center gap-1 text-[12.5px] font-medium text-ink-secondary truncate">
            <User2 className="h-3 w-3 flex-shrink-0" />Coordenador: {coordNome}
          </p>
        </div>
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

// ─── Bloco lateral: mensagens de WhatsApp prontas para cada reunião do dia ──────

function MensagensDoDia({ reunioes, ehHoje }: { reunioes: ReuniaoBusca[]; ehHoje: boolean }) {
  return (
    <aside className="lg:sticky lg:top-6 card-surface p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-ink-secondary" />
        <h2 className="text-[14px] font-semibold text-ink">{ehHoje ? 'Mensagens de hoje' : 'Mensagens do dia'}</h2>
        <span className="ml-auto text-[12px] text-ink-muted tabular-nums">{reunioes.length}</span>
      </div>
      <p className="text-[11.5px] text-ink-muted leading-snug">
        Mensagem pronta para o WhatsApp de cada professor, assinada pelo coordenador da reunião.
      </p>
      <div className="space-y-2.5 max-h-[calc(100vh-220px)] overflow-y-auto -mr-1 pr-1">
        {reunioes.map(r => <MensagemCard key={r.id} r={r} />)}
      </div>
    </aside>
  )
}

function MensagemCard({ r }: { r: ReuniaoBusca }) {
  const [copiado, setCopiado] = useState(false)

  const coordNome = coordenadorNomeDe(r)
  const reuniao = reuniaoDe(r)
  const hora = horaDe(r)

  const mensagem = buildMensagemReuniaoDoDia({
    professorNome: r.professor?.nome ?? 'professor(a)',
    coordenadorNome: coordNome,
    hora,
    numeroReuniao: r.numero,
    meetLink: reuniao?.meet_link ?? null,
  })
  const waLink = linkWhatsApp(r.professor?.telefone ?? null, mensagem)

  async function copiar() {
    await navigator.clipboard.writeText(mensagem)
    setCopiado(true)
    toast.success('Mensagem copiada.')
    setTimeout(() => setCopiado(false), 1800)
  }

  return (
    <div className="rounded-xl border border-line-soft bg-surface-canvas p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-ink truncate">{r.professor?.nome ?? 'Professor removido'}</p>
        {hora && <span className="text-[11px] text-ink-muted tabular-nums flex-shrink-0">{hora}</span>}
      </div>

      <pre className="whitespace-pre-wrap break-words font-sans text-[11.5px] leading-relaxed text-ink-secondary bg-surface-subtle rounded-lg p-2.5 max-h-[150px] overflow-y-auto">
        {mensagem}
      </pre>

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={copiar}
          className="btn-press h-7 text-[11px] gap-1.5 border-line text-ink-secondary flex-1"
        >
          {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
        {waLink ? (
          <Button
            asChild
            size="sm"
            className="btn-press h-7 text-[11px] gap-1.5 text-white hover:opacity-90"
            style={{ backgroundColor: '#25D366' }}
          >
            <a href={waLink} target="_blank" rel="noreferrer">
              <MessageCircle className="h-3 w-3" />WhatsApp
            </a>
          </Button>
        ) : (
          <span className="text-[10.5px] text-ink-muted px-1.5">sem telefone</span>
        )}
      </div>
    </div>
  )
}
