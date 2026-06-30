import { useMemo, useState } from 'react'
import {
  Video, Check, X, Link2, Mail, Sparkles,
  Loader2, Plus, ChevronLeft, ChevronRight, CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useCoordenadores } from '@/hooks/useAcompanhamento'
import {
  useReunioesPeriodo, useDadosVinculo, useVincularProfessor, useConfirmarParticipacao,
  useCriarReuniaoManual, sugerirVinculos, type ReuniaoCard, type ParticipanteCard, type CandidatoVinculo,
} from '@/hooks/useReunioesDia'
import { useAgendaReunioesPeriodo, type AgendaOcorrenciaCard } from '@/hooks/useAgendas'
import { useSendLembretesGeral } from '@/hooks/useSendLembrete'
import { cn, tempoDeCasaLabel } from '@/lib/utils'
import { toast } from 'sonner'

type DadosVinculo = ReturnType<typeof useDadosVinculo>['data']
type Modo = 'dia' | 'semana' | 'mes'

// ─── Datas ────────────────────────────────────────────────────────────────────

function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function fimDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function inicioDaSemana(d: Date): Date {
  const novo = inicioDoDia(d)
  novo.setDate(novo.getDate() - novo.getDay())
  return novo
}

function somarDias(d: Date, n: number): Date {
  const novo = new Date(d)
  novo.setDate(novo.getDate() + n)
  return novo
}

function computarIntervalo(modo: Modo, ref: Date): { inicio: Date; fim: Date } {
  if (modo === 'dia') return { inicio: inicioDoDia(ref), fim: fimDoDia(ref) }
  if (modo === 'semana') {
    const inicio = inicioDaSemana(ref)
    return { inicio, fim: fimDoDia(somarDias(inicio, 6)) }
  }
  const primeiroDiaMes = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const inicio = inicioDaSemana(primeiroDiaMes)
  return { inicio, fim: fimDoDia(somarDias(inicio, 41)) } // grade de 6 semanas
}

function isMesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function chaveDia(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const HORA_INICIO_GRADE = 7
const HORA_FIM_GRADE    = 22
const PX_POR_HORA       = 52

// ─── Página ─────────────────────────────────────────────────────────────────

export function ReunioesDiaPage() {
  const { profile } = useAuth()
  const canSeeAll = profile?.role === 'admin'
    || profile?.role === 'suporte'
    || profile?.role === 'suporte_aluno'

  const { data: coordenadores = [] } = useCoordenadores()
  const [sel, setSel] = useState<string>('')
  const [novaOpen, setNovaOpen] = useState(false)
  const [modo, setModo] = useState<Modo>('dia')
  const [dataRef, setDataRef] = useState(() => new Date())
  const coordId = canSeeAll ? (sel || coordenadores[0]?.id || '') : (profile?.id ?? '')

  const intervalo = useMemo(() => computarIntervalo(modo, dataRef), [modo, dataRef])

  const { data: reunioes, isLoading } = useReunioesPeriodo(coordId || null, intervalo.inicio, intervalo.fim)
  const { data: dados } = useDadosVinculo()
  const { data: agendaOcorrencias, isLoading: isLoadingAgenda } = useAgendaReunioesPeriodo(coordId || null, intervalo.inicio, intervalo.fim)

  const lista       = reunioes ?? []
  const listaAgenda = agendaOcorrencias ?? []
  const carregando  = isLoading || isLoadingAgenda
  const hoje         = new Date()
  const veHoje       = modo === 'dia'    ? isMesmoDia(dataRef, hoje)
                      : modo === 'semana' ? (hoje >= intervalo.inicio && hoje <= intervalo.fim)
                      : (hoje.getFullYear() === dataRef.getFullYear() && hoje.getMonth() === dataRef.getMonth())

  function navegar(delta: number) {
    setDataRef(d => {
      if (modo === 'dia')    return somarDias(d, delta)
      if (modo === 'semana') return somarDias(d, delta * 7)
      return new Date(d.getFullYear(), d.getMonth() + delta, 1)
    })
  }

  function irParaODia(d: Date) {
    setDataRef(d)
    setModo('dia')
  }

  const rotulo = useMemo(() => {
    if (modo === 'dia') {
      return dataRef.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    }
    if (modo === 'semana') {
      const { inicio, fim } = intervalo
      const mesmoMes = inicio.getMonth() === fim.getMonth()
      const ini = inicio.toLocaleDateString('pt-BR', { day: 'numeric', month: mesmoMes ? undefined : 'short' })
      const f   = fim.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
      return `${ini} – ${f}`
    }
    return dataRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }, [modo, dataRef, intervalo])

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Reuniões</h1>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost" size="icon"
              onClick={() => navegar(-1)}
              className="btn-press h-7 w-7 text-ink-secondary hover:text-ink hover:bg-surface-subtle"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon"
              onClick={() => navegar(1)}
              className="btn-press h-7 w-7 text-ink-secondary hover:text-ink hover:bg-surface-subtle"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>

            <p className="text-[13px] text-ink-muted capitalize">{rotulo}</p>

            {!veHoje && (
              <Button
                variant="ghost" size="sm"
                onClick={() => setDataRef(new Date())}
                className="btn-press h-6 gap-1 px-2 text-[11px] text-accentBlue hover:bg-accentBlue-soft"
              >
                <CalendarDays className="h-3 w-3" />Hoje
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ModoToggle modo={modo} onChange={setModo} />

          {canSeeAll && coordenadores.length > 0 && (
            <Select value={coordId} onValueChange={setSel}>
              <SelectTrigger className="h-9 w-[180px] text-[12px] bg-surface-canvas border-line text-ink">
                <SelectValue placeholder="Selecione um coordenador" />
              </SelectTrigger>
              <SelectContent className="bg-surface-canvas border-line text-ink">
                {coordenadores.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-[12px]">{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setNovaOpen(true)}
            className="btn-press h-9 gap-1.5 border-line text-ink-secondary text-[12px]"
          >
            <Plus className="h-3.5 w-3.5" />Nova reunião
          </Button>
        </div>
      </header>

      <Toolbar />

      {modo === 'dia' && (
        <DiaView
          dia={dataRef}
          carregando={carregando}
          lista={lista}
          listaAgenda={listaAgenda}
          dados={dados}
        />
      )}

      {modo === 'semana' && (
        <SemanaView
          inicioSemana={intervalo.inicio}
          carregando={carregando}
          lista={lista}
          listaAgenda={listaAgenda}
          onSelecionarDia={irParaODia}
        />
      )}

      {modo === 'mes' && (
        <MesView
          mesRef={dataRef}
          inicioGrade={intervalo.inicio}
          carregando={carregando}
          lista={lista}
          listaAgenda={listaAgenda}
          onSelecionarDia={irParaODia}
        />
      )}

      {novaOpen && (
        <NovaReuniaoDialog profs={dados?.profs ?? []} onClose={() => setNovaOpen(false)} />
      )}
    </div>
  )
}

// ─── Alternador Dia / Semana / Mês ──────────────────────────────────────────

function ModoToggle({ modo, onChange }: { modo: Modo; onChange: (m: Modo) => void }) {
  const opcoes: { value: Modo; label: string }[] = [
    { value: 'dia',    label: 'Dia' },
    { value: 'semana', label: 'Semana' },
    { value: 'mes',    label: 'Mês' },
  ]
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-surface-subtle/60 p-0.5">
      {opcoes.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'btn-press rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
            modo === o.value
              ? 'bg-surface-canvas text-ink shadow-sm'
              : 'text-ink-muted hover:text-ink-secondary',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Toolbar — lembretes ────────────────────────────────────────────────────
// A gestão da importação automática do Google Calendar mora em Configurações
// (admin), não aqui — coordenadores não precisam ver/mexer nisso.

function Toolbar() {
  const sendGeral = useSendLembretesGeral()

  async function handleLembretes() {
    try {
      const result = await sendGeral.mutateAsync()
      if (result.sent > 0) {
        toast.success(`${result.sent} lembrete(s) enviado(s).${result.skipped > 0 ? ` ${result.skipped} sem email.` : ''}`)
      } else {
        toast.warning('Nenhum lembrete enviado — verifique se há reuniões pendentes com e-mail.')
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar lembretes.')
    }
  }

  return (
    <div className="flex items-center justify-end">
      <Button
        size="sm"
        variant="outline"
        disabled={sendGeral.isPending}
        onClick={handleLembretes}
        className="btn-press h-7 text-[11px] gap-1.5 border-line text-ink-secondary"
      >
        {sendGeral.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
        Lembretes
      </Button>
    </div>
  )
}

// ─── Visão Dia ──────────────────────────────────────────────────────────────

function DiaView({ dia, carregando, lista, listaAgenda, dados }: {
  dia: Date
  carregando: boolean
  lista: ReuniaoCard[]
  listaAgenda: AgendaOcorrenciaCard[]
  dados: DadosVinculo
}) {
  const total = lista.length + listaAgenda.length
  const hoje  = isMesmoDia(dia, new Date())

  if (carregando) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="card-surface h-28 animate-pulse" />)}
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="card-surface p-10 text-center">
        <p className="text-[14px] font-medium text-ink">
          {hoje ? 'Nenhuma reunião hoje' : 'Nenhuma reunião nesse dia'}
        </p>
        <p className="text-[13px] text-ink-muted mt-1">A agenda deste coordenador está livre.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-[640px]">
      {listaAgenda.length > 0 && (
        <section className="space-y-2.5">
          <p className="label-micro">Reuniões de feedback (agendamento)</p>
          <div className="space-y-3">
            {listaAgenda.map(r => <AgendaOcorrenciaCardView key={r.id} ocorrencia={r} />)}
          </div>
        </section>
      )}

      {lista.length > 0 && (
        <section className="space-y-2.5">
          {listaAgenda.length > 0 && <p className="label-micro">Reuniões 1:1</p>}
          <div className="space-y-3">
            {lista.map(r => <ReuniaoCardView key={r.id} reuniao={r} dados={dados} />)}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Visão Semana — grade por hora, estilo Google Calendar ────────────────────

type EventoGrade = {
  id: string
  hora: Date
  titulo: string
  tipo: 'reuniao' | 'agenda'
}

function montarEventosPorDia(lista: ReuniaoCard[], listaAgenda: AgendaOcorrenciaCard[]): Map<string, EventoGrade[]> {
  const mapa = new Map<string, EventoGrade[]>()

  function add(chave: string, ev: EventoGrade) {
    const arr = mapa.get(chave) ?? []
    arr.push(ev)
    mapa.set(chave, arr)
  }

  for (const r of lista) {
    add(chaveDia(r.data), {
      id: r.id,
      hora: new Date(r.data),
      titulo: r.professor_email ?? r.titulo ?? '1:1',
      tipo: 'reuniao',
    })
  }
  for (const a of listaAgenda) {
    add(chaveDia(a.data_hora), {
      id: a.id,
      hora: new Date(a.data_hora),
      titulo: a.titulo,
      tipo: 'agenda',
    })
  }
  for (const arr of mapa.values()) arr.sort((a, b) => a.hora.getTime() - b.hora.getTime())
  return mapa
}

function SemanaView({ inicioSemana, carregando, lista, listaAgenda, onSelecionarDia }: {
  inicioSemana: Date
  carregando: boolean
  lista: ReuniaoCard[]
  listaAgenda: AgendaOcorrenciaCard[]
  onSelecionarDia: (d: Date) => void
}) {
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => somarDias(inicioSemana, i)), [inicioSemana])
  const eventosPorDia = useMemo(() => montarEventosPorDia(lista, listaAgenda), [lista, listaAgenda])
  const horas = useMemo(
    () => Array.from({ length: HORA_FIM_GRADE - HORA_INICIO_GRADE }, (_, i) => HORA_INICIO_GRADE + i),
    [],
  )
  const alturaGrade = (HORA_FIM_GRADE - HORA_INICIO_GRADE) * PX_POR_HORA

  if (carregando) {
    return <div className="card-surface h-[600px] animate-pulse" />
  }

  return (
    <div className="card-surface overflow-hidden">
      {/* Cabeçalho dos dias */}
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-line-soft">
        <div />
        {dias.map(d => {
          const hoje = isMesmoDia(d, new Date())
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelecionarDia(d)}
              className="btn-press flex flex-col items-center gap-1 py-2.5 border-l border-line-soft hover:bg-surface-subtle/60"
            >
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-ink-muted">
                {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
              </span>
              <span className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums',
                hoje ? 'bg-brand text-white' : 'text-ink',
              )}>
                {d.getDate()}
              </span>
            </button>
          )
        })}
      </div>

      {/* Grade de horas */}
      <div className="grid grid-cols-[56px_repeat(7,1fr)] relative" style={{ height: alturaGrade }}>
        {/* Coluna de horários */}
        <div className="relative border-r border-line-soft">
          {horas.map(h => (
            <div
              key={h}
              className="absolute right-2 -translate-y-1/2 text-[10.5px] text-ink-subtle tabular-nums"
              style={{ top: (h - HORA_INICIO_GRADE) * PX_POR_HORA }}
            >
              {String(h).padStart(2, '0')}h
            </div>
          ))}
        </div>

        {dias.map(d => {
          const eventos = eventosPorDia.get(chaveDia(d.toISOString())) ?? []
          return (
            <div key={d.toISOString()} className="relative border-l border-line-soft">
              {horas.map(h => (
                <div
                  key={h}
                  className="absolute w-full border-t border-line-soft/60"
                  style={{ top: (h - HORA_INICIO_GRADE) * PX_POR_HORA }}
                />
              ))}
              {eventos.map(ev => {
                const horaFracionaria = ev.hora.getHours() + ev.hora.getMinutes() / 60
                const top = Math.max(0, (horaFracionaria - HORA_INICIO_GRADE) * PX_POR_HORA)
                return (
                  <button
                    key={ev.id}
                    onClick={() => onSelecionarDia(d)}
                    title={ev.titulo}
                    className={cn(
                      'btn-press absolute left-1 right-1 rounded-md px-1.5 py-1 text-left text-[10.5px] leading-tight overflow-hidden',
                      ev.tipo === 'agenda'
                        ? 'bg-accentBlue-soft text-accentBlue hover:bg-accentBlue-soft/80'
                        : 'bg-surface-subtle text-ink-secondary hover:bg-line-soft',
                    )}
                    style={{ top, height: 30 }}
                  >
                    <span className="font-semibold tabular-nums">
                      {ev.hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>{' '}
                    {ev.titulo}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Visão Mês — grade de células, estilo Google Calendar ──────────────────────

function MesView({ mesRef, inicioGrade, carregando, lista, listaAgenda, onSelecionarDia }: {
  mesRef: Date
  inicioGrade: Date
  carregando: boolean
  lista: ReuniaoCard[]
  listaAgenda: AgendaOcorrenciaCard[]
  onSelecionarDia: (d: Date) => void
}) {
  const dias = useMemo(() => Array.from({ length: 42 }, (_, i) => somarDias(inicioGrade, i)), [inicioGrade])
  const eventosPorDia = useMemo(() => montarEventosPorDia(lista, listaAgenda), [lista, listaAgenda])

  if (carregando) {
    return <div className="card-surface h-[600px] animate-pulse" />
  }

  return (
    <div className="card-surface overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line-soft bg-surface-subtle/60">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
          <div key={d} className="px-2 py-2 text-center text-[10.5px] font-medium uppercase tracking-wide text-ink-muted">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {dias.map(d => {
          const eventos    = eventosPorDia.get(chaveDia(d.toISOString())) ?? []
          const hoje       = isMesmoDia(d, new Date())
          const foraDoMes  = d.getMonth() !== mesRef.getMonth()
          const visiveis   = eventos.slice(0, 3)
          const restantes  = eventos.length - visiveis.length

          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelecionarDia(d)}
              className={cn(
                'btn-press flex flex-col items-stretch gap-1 border-b border-l border-line-soft p-1.5 text-left min-h-[92px] hover:bg-surface-subtle/40',
                foraDoMes && 'bg-surface-subtle/30',
              )}
            >
              <span className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums flex-shrink-0',
                hoje ? 'bg-brand text-white' : foraDoMes ? 'text-ink-subtle' : 'text-ink',
              )}>
                {d.getDate()}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                {visiveis.map(ev => (
                  <span
                    key={ev.id}
                    className={cn(
                      'truncate rounded px-1 py-0.5 text-[10px] leading-tight',
                      ev.tipo === 'agenda'
                        ? 'bg-accentBlue-soft text-accentBlue'
                        : 'bg-surface-subtle text-ink-secondary',
                    )}
                  >
                    {ev.hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} {ev.titulo}
                  </span>
                ))}
                {restantes > 0 && (
                  <span className="text-[10px] text-ink-muted px-1">+{restantes} mais</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Nova reunião (manual) ─────────────────────────────────────────────────────

function NovaReuniaoDialog({ profs, onClose }: { profs: { id: string; nome: string }[]; onClose: () => void }) {
  const criar = useCriarReuniaoManual()
  const [professorId, setProfessorId] = useState('')
  const [data, setData]               = useState('')
  const [hora, setHora]               = useState('08:00')
  const [titulo, setTitulo]           = useState('')

  async function handleSalvar() {
    if (!data) { toast.error('Selecione uma data.'); return }
    try {
      await criar.mutateAsync({
        professorId: professorId || null,
        data:        new Date(`${data}T${hora}:00`).toISOString(),
        titulo:      titulo || undefined,
      })
      toast.success('Reunião criada.')
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar reunião.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-canvas border border-line rounded-xl shadow-elevated w-full max-w-md mx-4 p-6 space-y-5 animate-fade-up">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">Nova reunião</h2>
          <button onClick={onClose} className="btn-press text-ink-subtle hover:text-ink-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="label-micro">Professor</Label>
            <Select value={professorId} onValueChange={setProfessorId}>
              <SelectTrigger className="h-9 bg-surface-canvas border-line text-ink text-[13px]">
                <SelectValue placeholder="— Sem vínculo —" />
              </SelectTrigger>
              <SelectContent className="bg-surface-canvas border-line text-ink max-h-64">
                {profs.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-[13px]">{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="label-micro">Data <span className="text-brand">*</span></Label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} className="h-9 bg-surface-canvas border-line" />
            </div>
            <div className="space-y-1.5">
              <Label className="label-micro">Horário</Label>
              <Input type="time" value={hora} onChange={e => setHora(e.target.value)} className="h-9 bg-surface-canvas border-line" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Título (opcional)</Label>
            <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: 1:1 com teacher" className="h-9 bg-surface-canvas border-line" />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-ink-secondary">Cancelar</Button>
          <Button
            size="sm"
            onClick={handleSalvar}
            disabled={criar.isPending}
            className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
          >
            {criar.isPending ? 'Salvando…' : 'Criar reunião'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Card — reunião de feedback (agendamento coletivo) ─────────────────────────

function AgendaOcorrenciaCardView({ ocorrencia }: { ocorrencia: AgendaOcorrenciaCard }) {
  const hora = new Date(ocorrencia.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="card-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ink tabular-nums">{hora}</span>
            <span className="text-[12px] text-ink-muted truncate">{ocorrencia.titulo}</span>
          </div>
          <span className="flex items-center gap-1 text-[11px] text-ink-muted mt-0.5">
            <Mail className="h-3 w-3" />
            {ocorrencia.participantes.length}/{ocorrencia.capacidade} confirmado{ocorrencia.participantes.length === 1 ? '' : 's'}
          </span>
        </div>

        {ocorrencia.meet_link && (
          <a
            href={ocorrencia.meet_link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-press inline-flex items-center gap-1.5 rounded-full bg-accentBlue px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accentBlue-hov flex-shrink-0"
          >
            <Video className="h-3.5 w-3.5" />Entrar
          </a>
        )}
      </div>

      <div className="border-t border-line-soft pt-3 flex flex-wrap gap-1.5">
        {ocorrencia.participantes.map(p => (
          <span key={p.id} className="rounded-full bg-surface-subtle px-2.5 py-1 text-[12px] text-ink-secondary">
            {p.nome}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ReuniaoCardView({ reuniao, dados }: { reuniao: ReuniaoCard; dados: DadosVinculo }) {
  const hora = new Date(reuniao.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="card-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ink tabular-nums">{hora}</span>
            {reuniao.professor_email && (
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                <Mail className="h-3 w-3" />{reuniao.professor_email}
              </span>
            )}
          </div>
          {reuniao.titulo && <p className="text-[12px] text-ink-muted truncate mt-0.5">{reuniao.titulo}</p>}
        </div>

        {reuniao.meet_link && (
          <a
            href={reuniao.meet_link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-press inline-flex items-center gap-1.5 rounded-full bg-accentBlue px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accentBlue-hov flex-shrink-0"
          >
            <Video className="h-3.5 w-3.5" />Entrar
          </a>
        )}
      </div>

      <div className="border-t border-line-soft pt-3 space-y-3">
        {reuniao.participantes.length === 0 ? (
          <VincularBlock reuniao={reuniao} participanteId={null} dados={dados} />
        ) : (
          reuniao.participantes.map(part =>
            part.professor
              ? <ParticipanteRow key={part.id} part={part} />
              : <VincularBlock key={part.id} reuniao={reuniao} participanteId={part.id} dados={dados} />
          )
        )}
      </div>
    </div>
  )
}

// ─── Participante vinculado ─────────────────────────────────────────────────────

function ParticipanteRow({ part }: { part: ParticipanteCard }) {
  const confirmar = useConfirmarParticipacao()
  const [obs, setObs] = useState(part.observacao ?? '')
  const prof = part.professor!
  const tempo = tempoDeCasaLabel(prof.data_inicio)

  function confirmarReuniao(aconteceu: boolean) {
    confirmar.mutate(
      { participanteId: part.id, professorId: prof.id, aconteceu, observacao: obs },
      {
        onSuccess: () => toast.success(aconteceu ? 'Reunião confirmada.' : 'Marcada como não realizada.'),
        onError:   () => toast.error('Erro ao confirmar.'),
      },
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium text-ink truncate">{prof.nome}</span>
          {prof.monitoramento && (
            <span className="h-1.5 w-1.5 rounded-full bg-urg-highFg flex-shrink-0" title="Monitoramento ativo" />
          )}
          {tempo && <span className="text-[11px] text-ink-muted">· {tempo}</span>}
        </div>

        {part.status === 'realizada' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-urg-lowBg px-2 py-0.5 text-[11px] font-medium text-urg-lowFg flex-shrink-0">
            <Check className="h-3 w-3" />{part.numero ? `${part.numero}º monit.` : 'Realizada'}
          </span>
        )}
        {part.status === 'cancelada' && (
          <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-ink-muted flex-shrink-0">
            Não realizada
          </span>
        )}
      </div>

      {part.status === 'pendente' ? (
        <div className="space-y-2">
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="Observações da reunião…"
            className="w-full min-h-[64px] resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-accentBlue"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={confirmar.isPending}
              onClick={() => confirmarReuniao(true)}
              className="btn-press h-8 text-[12px] gap-1.5 bg-urg-lowFg text-white hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" />Realizada
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={confirmar.isPending}
              onClick={() => confirmarReuniao(false)}
              className="btn-press h-8 text-[12px] gap-1.5 border-line text-ink-secondary"
            >
              <X className="h-3.5 w-3.5" />Não aconteceu
            </Button>
          </div>
        </div>
      ) : (
        part.observacao && <p className="text-[12px] text-ink-secondary leading-relaxed">{part.observacao}</p>
      )}
    </div>
  )
}

// ─── Vincular (sugestões + manual) ──────────────────────────────────────────────

function VincularBlock({ reuniao, participanteId, dados }: {
  reuniao: ReuniaoCard
  participanteId: string | null
  dados: DadosVinculo
}) {
  const vincular = useVincularProfessor()
  const sugestoes = dados ? sugerirVinculos(reuniao, dados.profs, dados.emails) : []

  function link(professorId: string, motivo: 'email' | 'nome' | 'manual') {
    vincular.mutate(
      {
        reuniaoId: reuniao.id,
        participanteId,
        professorId,
        // Aprende o e-mail do Calendar quando o vínculo não veio do próprio e-mail.
        emailParaAprender: motivo === 'email' ? null : reuniao.professor_email,
      },
      {
        onSuccess: () => toast.success('Professor vinculado.'),
        onError:   () => toast.error('Erro ao vincular.'),
      },
    )
  }

  return (
    <div className="rounded-lg border border-dashed border-line bg-surface-subtle/40 p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-secondary">
        <Link2 className="h-3.5 w-3.5" />Professor não vinculado
      </div>

      {sugestoes.length > 0 && (
        <div className="space-y-1.5">
          {sugestoes.map(c => <Sugestao key={c.professor.id} c={c} pending={vincular.isPending} onLink={() => link(c.professor.id, c.motivo)} />)}
        </div>
      )}

      {/* Manual */}
      {(dados?.profs ?? []).length === 0 ? (
        <p className="text-[12px] text-ink-muted italic">
          Nenhum professor cadastrado ainda — cadastre em{' '}
          <a href="/professores" className="underline underline-offset-2 hover:text-ink">Professores</a>.
        </p>
      ) : (
        <Select onValueChange={v => link(v, 'manual')} disabled={vincular.isPending}>
          <SelectTrigger className="h-8 text-[12px] bg-surface-canvas border-line text-ink">
            <SelectValue placeholder="Vincular manualmente…" />
          </SelectTrigger>
          <SelectContent className="bg-surface-canvas border-line text-ink max-h-64">
            {dados!.profs.map(p => (
              <SelectItem key={p.id} value={p.id} className="text-[12px]">{p.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

function Sugestao({ c, pending, onLink }: { c: CandidatoVinculo; pending: boolean; onLink: () => void }) {
  const isEmail = c.motivo === 'email'
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-surface-canvas border border-line-soft px-2.5 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        {isEmail
          ? <Mail className="h-3.5 w-3.5 text-urg-lowFg flex-shrink-0" />
          : <Sparkles className="h-3.5 w-3.5 text-accentBlue flex-shrink-0" />}
        <span className="text-[13px] text-ink truncate">{c.professor.nome}</span>
        <span className={cn(
          'text-[10.5px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0',
          isEmail ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-accentBlue-soft text-accentBlue',
        )}>
          {isEmail ? 'e-mail' : `${c.confianca}%`}
        </span>
      </div>
      <Button
        size="sm"
        disabled={pending}
        onClick={onLink}
        className={cn(
          'btn-press h-7 text-[11px] flex-shrink-0',
          isEmail ? 'bg-urg-lowFg text-white hover:opacity-90' : 'bg-accentBlue text-white hover:bg-accentBlue-hov',
        )}
      >
        {isEmail ? 'Vincular' : 'Aprovar'}
      </Button>
    </div>
  )
}
