import { useMemo, useState } from 'react'
import {
  Video, Check, X, Link2, Unlink2, Mail, Sparkles, Pencil, Trash2, Users2,
  Loader2, ChevronLeft, ChevronRight, CalendarDays, User, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { useCoordenadores } from '@/hooks/useAcompanhamento'
import {
  useReunioesPeriodo, useDadosVinculo, useVincularProfessor, useConfirmarParticipacao,
  useEditarReuniao, useExcluirReuniao, useConfirmarReuniaoInterna, usePerfisPorEmail,
  useDesvincularProfessor, useConfirmarReuniaoGrupo, sugerirVinculos, isReuniaoGrupo,
  type ReuniaoCard, type ParticipanteCard, type CandidatoVinculo,
} from '@/hooks/useReunioesDia'
import { useAgendaReunioesPeriodo, type AgendaOcorrenciaCard } from '@/hooks/useAgendas'
import { useSendLembretesGeral } from '@/hooks/useSendLembrete'
import { MensagensDoDia } from '@/components/reunioes/MensagensDoDia'
import { cn, tempoDeCasaLabel } from '@/lib/utils'
import { scoreVisual } from '@/lib/score'
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

/** Data no formato do <input type="date"> em horário LOCAL (evita o shift de dia que
 *  toISOString causa em reuniões à noite no fuso do Brasil). */
function paraInputDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
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

// ─── Status visual das reuniões (feito / a fazer / atrasada) ──────────────────

type EventoStatus = 'realizada' | 'a_fazer' | 'atrasada' | 'cancelada'

const STATUS_VISUAL: Record<EventoStatus, {
  label: string; dot: string; bar: string; blocoBg: string; blocoText: string; chip: string
}> = {
  realizada: { label: 'Realizada',     dot: 'bg-urg-lowFg',  bar: 'bg-urg-lowFg',  blocoBg: 'bg-urg-lowBg',       blocoText: 'text-urg-lowFg',  chip: 'bg-urg-lowBg text-urg-lowFg' },
  a_fazer:   { label: 'A fazer',       dot: 'bg-accentBlue', bar: 'bg-accentBlue', blocoBg: 'bg-accentBlue-soft', blocoText: 'text-accentBlue', chip: 'bg-accentBlue-soft text-accentBlue' },
  atrasada:  { label: 'Atrasada',      dot: 'bg-urg-medFg',  bar: 'bg-urg-medFg',  blocoBg: 'bg-urg-medBg',       blocoText: 'text-urg-medFg',  chip: 'bg-urg-medBg text-urg-medFg' },
  cancelada: { label: 'Não realizada', dot: 'bg-ink-subtle', bar: 'bg-ink-subtle', blocoBg: 'bg-surface-subtle',  blocoText: 'text-ink-muted',  chip: 'bg-surface-subtle text-ink-muted' },
}

/** Status de uma reunião a partir dos participantes (professor) ou de reunioes.status (interna) + data. */
function statusReuniao(r: ReuniaoCard): EventoStatus {
  const passou = new Date(r.data) < new Date()

  if (r.tipo_reuniao === 'interna') {
    if (r.status === 'concluida') return 'realizada'
    if (r.status === 'cancelada') return 'cancelada'
    return passou ? 'atrasada' : 'a_fazer'
  }

  const parts = r.participantes
  if (parts.length > 0) {
    if (parts.some(p => p.status === 'pendente'))  return passou ? 'atrasada' : 'a_fazer'
    if (parts.some(p => p.status === 'realizada')) return 'realizada'
    return 'cancelada' // todos cancelados
  }
  if (r.status === 'concluida') return 'realizada'
  return passou ? 'atrasada' : 'a_fazer'
}

/** Status de uma ocorrência de agenda (feedback coletivo): baseada só na data —
 *  ocorrências passadas contam como realizadas, futuras como a fazer. */
function statusOcorrencia(o: AgendaOcorrenciaCard): EventoStatus {
  return new Date(o.data_hora) < new Date() ? 'realizada' : 'a_fazer'
}

/** Tag compacta com o score do professor, colorido pela escala. */
function ScoreTag({ score }: { score: number | null }) {
  const v = scoreVisual(score)
  if (score == null) return null
  return (
    <span
      title={`Score ${v.label} · faixa ${v.faixaLabel}`}
      className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', v.tagClass)}
    >
      {v.label}
    </span>
  )
}

/** Legenda compacta do sistema de cores por status. */
function LegendaStatus() {
  const itens: EventoStatus[] = ['a_fazer', 'realizada', 'atrasada']
  return (
    <div className="flex items-center gap-3">
      {itens.map(s => (
        <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span className={cn('h-2 w-2 rounded-full', STATUS_VISUAL[s].dot)} />
          {STATUS_VISUAL[s].label}
        </span>
      ))}
    </div>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────

export function ReunioesDiaPage() {
  const { profile } = useAuth()
  const canSeeAll = profile?.role === 'admin'
    || profile?.role === 'suporte'
    || profile?.role === 'suporte_aluno'
    || profile?.is_admin === true
    || profile?.is_lider === true

  const { data: coordenadores = [] } = useCoordenadores()
  const [sel, setSel] = useState<string>('')
  const [modo, setModo] = useState<Modo>('dia')
  const [dataRef, setDataRef] = useState(() => new Date())
  const [eventoAberto, setEventoAberto] = useState<EventoGrade | null>(null)
  const coordId = canSeeAll ? (sel || coordenadores[0]?.id || '') : (profile?.id ?? '')
  const coordNome = canSeeAll
    ? (coordenadores.find(c => c.id === coordId)?.nome ?? '—')
    : (profile?.nome ?? '—')

  // "Mensagens do dia": lista de contatos diários do coordenador. A RPC/RLS só
  // libera a própria lista (ou admin de verdade) — por isso só mostramos quando
  // é a agenda do próprio usuário ou ele é admin, evitando erro pra líderes que
  // navegam a agenda de outro coordenador.
  const isRealAdmin = profile?.role === 'admin' || profile?.is_admin === true
  const podeVerContatos = profile?.role === 'admin' || profile?.role === 'coordenacao'
  const podeVerMinhaLista = coordId === profile?.id || isRealAdmin

  const intervalo = useMemo(() => computarIntervalo(modo, dataRef), [modo, dataRef])

  const { data: reunioes, isLoading } = useReunioesPeriodo(coordId || null, intervalo.inicio, intervalo.fim)
  const { data: dados } = useDadosVinculo()
  const { data: agendaOcorrencias, isLoading: isLoadingAgenda } = useAgendaReunioesPeriodo(coordId || null, intervalo.inicio, intervalo.fim)

  const lista       = reunioes ?? []
  // Deduplica: um horário que já virou reunião de grupo aparece pelo card de grupo
  // (em `lista`), não pelo card de feedback — senão o mesmo evento apareceria 2×.
  const listaAgenda = (agendaOcorrencias ?? []).filter(o => !o.reuniao_id)
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
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <LegendaStatus />
        <Toolbar />
      </div>

      {podeVerContatos && podeVerMinhaLista && modo === 'dia' && veHoje && (
        <MensagensDoDia coordId={coordId || null} coordNome={coordNome} />
      )}

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
          onAbrirEvento={setEventoAberto}
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
          onAbrirEvento={setEventoAberto}
        />
      )}

      {eventoAberto && (
        <EventoPopover
          evento={eventoAberto}
          onClose={() => setEventoAberto(null)}
          onVerDia={() => { irParaODia(eventoAberto.hora); setEventoAberto(null) }}
        />
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

  const grupos      = lista.filter(isReuniaoGrupo)
  const individuais = lista.filter(r => !isReuniaoGrupo(r))
  const temGrupo    = grupos.length > 0 || listaAgenda.length > 0

  return (
    <div className="space-y-5 max-w-[640px]">
      {temGrupo && (
        <section className="space-y-2.5">
          <p className="label-micro">Reuniões em grupo</p>
          <div className="space-y-3">
            {grupos.map(r => <ReuniaoGrupoCardView key={r.id} reuniao={r} />)}
            {listaAgenda.map(r => <AgendaOcorrenciaCardView key={r.id} ocorrencia={r} />)}
          </div>
        </section>
      )}

      {individuais.length > 0 && (
        <section className="space-y-2.5">
          {temGrupo && <p className="label-micro">Reuniões 1:1</p>}
          <div className="space-y-3">
            {individuais.map(r => <ReuniaoCardView key={r.id} reuniao={r} dados={dados} />)}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Visão Semana/Mês — eventos combinados (reuniões 1:1 + agendamento) ───────

type EventoGrade = {
  id: string
  hora: Date
  rotulo: string
  tipo: 'reuniao' | 'agenda'
  status: EventoStatus
  fonte: ReuniaoCard | AgendaOcorrenciaCard
}

/** Nome do professor vinculado (se houver) — usado como rótulo do evento e no popup. */
function professorDoEvento(reuniao: ReuniaoCard): ParticipanteCard['professor'] | null {
  return reuniao.participantes.find(p => p.professor)?.professor ?? null
}

function rotuloEvento(tipo: 'reuniao' | 'agenda', fonte: ReuniaoCard | AgendaOcorrenciaCard): string {
  if (tipo === 'agenda') return (fonte as AgendaOcorrenciaCard).titulo
  const r = fonte as ReuniaoCard
  if (r.tipo_reuniao === 'interna') return r.titulo ?? 'Reunião interna'
  if (isReuniaoGrupo(r)) return r.titulo ?? `Grupo · ${r.participantes.length}`
  return professorDoEvento(r)?.nome ?? r.professor_email ?? r.titulo ?? '1:1'
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
      rotulo: rotuloEvento('reuniao', r),
      tipo: 'reuniao',
      status: statusReuniao(r),
      fonte: r,
    })
  }
  for (const a of listaAgenda) {
    add(chaveDia(a.data_hora), {
      id: a.id,
      hora: new Date(a.data_hora),
      rotulo: rotuloEvento('agenda', a),
      tipo: 'agenda',
      status: statusOcorrencia(a),
      fonte: a,
    })
  }
  for (const arr of mapa.values()) arr.sort((a, b) => a.hora.getTime() - b.hora.getTime())
  return mapa
}

// ─── Layout da grade de horas — evita blocos sobrepostos ──────────────────────
// Eventos não têm horário de fim salvo; assume-se uma duração visual fixa e,
// quando dois ou mais caem na mesma janela, divide a largura entre eles
// (igual ao Google Calendar) em vez de empilhar tudo por cima.

const DURACAO_VISUAL_MIN = 20
const ALTURA_PADRAO_PX   = (DURACAO_VISUAL_MIN / 60) * PX_POR_HORA
const ALTURA_MINIMA_PX   = 14

type EventoPosicionado = EventoGrade & { top: number; left: number; largura: number; altura: number }

function posicionarEventosDoDia(eventos: EventoGrade[]): EventoPosicionado[] {
  const ordenados = [...eventos].sort((a, b) => a.hora.getTime() - b.hora.getTime())
  const posicionados: EventoPosicionado[] = []

  // Altura de cada bloco respeita o espaço real até o próximo evento do dia
  // (independente de coluna) — evita blocos vizinhos se tocando/sobrepondo
  // quando as reuniões são mais próximas que a duração visual padrão.
  const alturaPorId = new Map<string, number>()
  for (let i = 0; i < ordenados.length; i++) {
    const atual  = ordenados[i]
    const prox   = ordenados[i + 1]
    const gapMin = prox ? (prox.hora.getTime() - atual.hora.getTime()) / 60_000 : DURACAO_VISUAL_MIN
    const gapPx  = (Math.min(gapMin, DURACAO_VISUAL_MIN) / 60) * PX_POR_HORA
    alturaPorId.set(atual.id, Math.max(ALTURA_MINIMA_PX, gapPx - 2))
  }

  let cluster: { evento: EventoGrade; fimMs: number; coluna: number }[] = []
  let maxColunas = 0
  let clusterFimMaxMs = -Infinity

  function fecharCluster() {
    if (!cluster.length) return
    for (const item of cluster) {
      const horaFracionaria = item.evento.hora.getHours() + item.evento.hora.getMinutes() / 60
      const top = Math.max(0, (horaFracionaria - HORA_INICIO_GRADE) * PX_POR_HORA)
      posicionados.push({
        ...item.evento,
        top,
        left:    (item.coluna / maxColunas) * 100,
        largura: (1 / maxColunas) * 100,
        altura:  alturaPorId.get(item.evento.id) ?? ALTURA_PADRAO_PX,
      })
    }
    cluster = []
    maxColunas = 0
  }

  for (const ev of ordenados) {
    const inicioMs = ev.hora.getTime()
    const fimMs    = inicioMs + DURACAO_VISUAL_MIN * 60_000

    if (cluster.length && inicioMs >= clusterFimMaxMs) {
      fecharCluster()
      clusterFimMaxMs = -Infinity
    }

    const colunasOcupadas = new Set(cluster.filter(c => c.fimMs > inicioMs).map(c => c.coluna))
    let coluna = 0
    while (colunasOcupadas.has(coluna)) coluna++

    cluster.push({ evento: ev, fimMs, coluna })
    maxColunas = Math.max(maxColunas, coluna + 1)
    clusterFimMaxMs = Math.max(clusterFimMaxMs, fimMs)
  }
  fecharCluster()

  return posicionados
}

function SemanaView({ inicioSemana, carregando, lista, listaAgenda, onSelecionarDia, onAbrirEvento }: {
  inicioSemana: Date
  carregando: boolean
  lista: ReuniaoCard[]
  listaAgenda: AgendaOcorrenciaCard[]
  onSelecionarDia: (d: Date) => void
  onAbrirEvento: (ev: EventoGrade) => void
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
          const eventos = posicionarEventosDoDia(eventosPorDia.get(chaveDia(d.toISOString())) ?? [])
          return (
            <div key={d.toISOString()} className="relative border-l border-line-soft">
              {horas.map(h => (
                <div
                  key={h}
                  className="absolute w-full border-t border-line-soft/60"
                  style={{ top: (h - HORA_INICIO_GRADE) * PX_POR_HORA }}
                />
              ))}
              {eventos.map(ev => (
                <button
                  key={ev.id}
                  onClick={() => onAbrirEvento(ev)}
                  title={`${STATUS_VISUAL[ev.status].label} · ${ev.rotulo}`}
                  className={cn(
                    'btn-press absolute flex items-start gap-1 rounded-md px-1.5 py-0.5 text-left text-[10px] leading-tight overflow-hidden hover:opacity-90',
                    STATUS_VISUAL[ev.status].blocoBg, STATUS_VISUAL[ev.status].blocoText,
                  )}
                  style={{
                    top: ev.top, height: ev.altura,
                    left: `calc(${ev.left}% + 2px)`,
                    width: `calc(${ev.largura}% - 4px)`,
                  }}
                >
                  {ev.tipo === 'agenda'
                    ? <Users className="mt-[1px] h-2.5 w-2.5 shrink-0 opacity-70" />
                    : <User className="mt-[1px] h-2.5 w-2.5 shrink-0 opacity-70" />}
                  <span className="min-w-0 truncate">
                    <span className="font-semibold tabular-nums">
                      {ev.hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>{' '}
                    {ev.rotulo}
                  </span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Visão Mês — grade de células, estilo Google Calendar ──────────────────────

function MesView({ mesRef, inicioGrade, carregando, lista, listaAgenda, onSelecionarDia, onAbrirEvento }: {
  mesRef: Date
  inicioGrade: Date
  carregando: boolean
  lista: ReuniaoCard[]
  listaAgenda: AgendaOcorrenciaCard[]
  onSelecionarDia: (d: Date) => void
  onAbrirEvento: (ev: EventoGrade) => void
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
            <div
              key={d.toISOString()}
              role="button" tabIndex={0}
              onClick={() => onSelecionarDia(d)}
              onKeyDown={e => { if (e.key === 'Enter') onSelecionarDia(d) }}
              className={cn(
                'btn-press flex flex-col items-stretch gap-1 border-b border-l border-line-soft p-1.5 text-left min-h-[92px] cursor-pointer hover:bg-surface-subtle/40',
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
                  <button
                    key={ev.id}
                    onClick={e => { e.stopPropagation(); onAbrirEvento(ev) }}
                    title={`${STATUS_VISUAL[ev.status].label} · ${ev.rotulo}`}
                    className={cn(
                      'btn-press flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight hover:opacity-90',
                      STATUS_VISUAL[ev.status].blocoBg, STATUS_VISUAL[ev.status].blocoText,
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_VISUAL[ev.status].dot)} />
                    <span className="truncate">
                      {ev.hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} {ev.rotulo}
                    </span>
                  </button>
                ))}
                {restantes > 0 && (
                  <span className="text-[10px] text-ink-muted px-1">+{restantes} mais</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Popup de evento (semana/mês) — info do professor + link da reunião ───────

function EventoPopover({ evento, onClose, onVerDia }: {
  evento: EventoGrade
  onClose: () => void
  onVerDia: () => void
}) {
  const hora = evento.hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const data = evento.hora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  const reuniao = evento.tipo === 'reuniao' ? (evento.fonte as ReuniaoCard) : null
  const agenda  = evento.tipo === 'agenda'  ? (evento.fonte as AgendaOcorrenciaCard) : null
  const prof    = reuniao ? professorDoEvento(reuniao) : null
  const tempo   = prof ? tempoDeCasaLabel(prof.data_inicio) : null
  const meetLink = reuniao?.meet_link ?? agenda?.meet_link ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-canvas border border-line rounded-xl shadow-elevated w-full max-w-sm mx-4 p-5 space-y-4 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] text-ink-muted capitalize">{data}</p>
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-semibold text-ink tabular-nums">{hora}</p>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_VISUAL[evento.status].chip)}>
                {STATUS_VISUAL[evento.status].label}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="btn-press text-ink-subtle hover:text-ink-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {reuniao && reuniao.tipo_reuniao === 'interna' && (
          <div className="rounded-lg border border-dashed border-line bg-surface-subtle/40 p-3 space-y-1">
            <p className="text-[13px] font-medium text-ink-secondary flex items-center gap-1.5">
              <Users2 className="h-3.5 w-3.5" />Reunião interna
            </p>
            {reuniao.titulo && <p className="text-[12px] text-ink-muted">{reuniao.titulo}</p>}
            {reuniao.participantes_emails.length > 0 && (
              <p className="text-[12px] text-ink-muted">{reuniao.participantes_emails.length} participante(s)</p>
            )}
          </div>
        )}

        {reuniao && isReuniaoGrupo(reuniao) && (
          <div className="space-y-2">
            <p className="text-[14px] font-medium text-ink">{reuniao.titulo ?? 'Reunião em grupo'}</p>
            <p className="text-[12px] text-ink-muted">{reuniao.participantes.length} participante(s)</p>
            {reuniao.participantes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {reuniao.participantes.filter(p => p.professor).map(p => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-subtle px-2.5 py-1 text-[12px] text-ink-secondary">
                    <span className={cn('h-1.5 w-1.5 rounded-full', scoreVisual(p.professor!.score_atual).dotClass)} />
                    {p.professor!.nome}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {reuniao && reuniao.tipo_reuniao !== 'interna' && !isReuniaoGrupo(reuniao) && (
          prof ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-medium text-ink">{prof.nome}</p>
                <ScoreTag score={prof.score_atual} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {tempo && <span className="text-[12px] text-ink-muted">{tempo} de casa</span>}
                {prof.monitoramento && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-urg-highFg">
                    <span className="h-1.5 w-1.5 rounded-full bg-urg-highFg" />Monitoramento
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-surface-subtle/40 p-3 space-y-1">
              <p className="text-[13px] font-medium text-ink-secondary flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />Professor não vinculado
              </p>
              {reuniao.professor_email && (
                <p className="text-[12px] text-ink-muted">{reuniao.professor_email}</p>
              )}
              {reuniao.titulo && <p className="text-[12px] text-ink-muted">{reuniao.titulo}</p>}
            </div>
          )
        )}

        {agenda && (
          <div className="space-y-2">
            <p className="text-[14px] font-medium text-ink">{agenda.titulo}</p>
            <p className="text-[12px] text-ink-muted">
              {agenda.participantes.length}/{agenda.capacidade} confirmado{agenda.participantes.length === 1 ? '' : 's'}
            </p>
            {agenda.participantes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {agenda.participantes.map(p => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-subtle px-2.5 py-1 text-[12px] text-ink-secondary">
                    <span className={cn('h-1.5 w-1.5 rounded-full', scoreVisual(p.score_atual).dotClass)} />
                    {p.nome}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <button onClick={onVerDia} className="btn-press text-[12px] text-ink-muted hover:text-ink underline underline-offset-2">
            Ver dia completo
          </button>
          {meetLink ? (
            <a
              href={meetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press inline-flex items-center gap-1.5 rounded-full bg-accentBlue px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-accentBlue-hov"
            >
              <Video className="h-3.5 w-3.5" />Entrar na reunião
            </a>
          ) : (
            <span className="text-[12px] text-ink-subtle italic">Sem link de reunião</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Card — reunião de feedback (agendamento coletivo) ─────────────────────────

function AgendaOcorrenciaCardView({ ocorrencia }: { ocorrencia: AgendaOcorrenciaCard }) {
  const hora = new Date(ocorrencia.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const sv = STATUS_VISUAL[statusOcorrencia(ocorrencia)]

  return (
    <div className="card-surface relative overflow-hidden p-4 pl-5 space-y-3">
      <span className={cn('absolute inset-y-0 left-0 w-1', sv.bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-ink tabular-nums">{hora}</span>
            <span className="text-[12px] text-ink-muted truncate">{ocorrencia.titulo}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', sv.chip)}>{sv.label}</span>
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
          <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-subtle px-2.5 py-1 text-[12px] text-ink-secondary">
            <span className={cn('h-1.5 w-1.5 rounded-full', scoreVisual(p.score_atual).dotClass)} />
            {p.nome}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Card — reunião de grupo (presença coletiva) ──────────────────────────────

function ReuniaoGrupoCardView({ reuniao }: { reuniao: ReuniaoCard }) {
  const { profile } = useAuth()
  const podeEditar = canEdit(profile)
  const confirmar = useConfirmarReuniaoGrupo()
  const hora = new Date(reuniao.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const sv = STATUS_VISUAL[statusReuniao(reuniao)]
  const [editarAberto, setEditarAberto] = useState(false)
  const [excluirAberto, setExcluirAberto] = useState(false)
  const [obs, setObs] = useState(reuniao.notas ?? '')

  const participantes = reuniao.participantes
  const emAberto = participantes.some(p => p.status === 'pendente')

  // Presença inicial: quem não está marcado como "não compareceu" começa presente.
  const [presentes, setPresentes] = useState<Set<string>>(
    () => new Set(participantes.filter(p => p.status !== 'cancelada').map(p => p.id)),
  )
  function toggle(id: string) {
    setPresentes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleConfirmar() {
    confirmar.mutate(
      { reuniaoId: reuniao.id, presentesIds: [...presentes], observacao: obs },
      {
        onSuccess: () => toast.success('Presença confirmada.'),
        onError:   () => toast.error('Erro ao confirmar presença.'),
      },
    )
  }

  return (
    <div className="card-surface relative overflow-hidden p-4 pl-5 space-y-3">
      <span className={cn('absolute inset-y-0 left-0 w-1', sv.bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-ink tabular-nums">{hora}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', sv.chip)}>{sv.label}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-accentBlue-soft px-2 py-0.5 text-[10px] font-medium text-accentBlue">
              <Users className="h-3 w-3" />Grupo · {participantes.length}
            </span>
          </div>
          {reuniao.titulo && <p className="text-[12px] text-ink-muted truncate mt-0.5">{reuniao.titulo}</p>}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {podeEditar && (
            <>
              <button
                onClick={() => setEditarAberto(true)}
                title="Editar reunião"
                className="btn-press flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-surface-subtle hover:text-ink"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setExcluirAberto(true)}
                title="Excluir reunião"
                className="btn-press flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-urg-highBg hover:text-urg-highFg"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {reuniao.meet_link && (
            <a
              href={reuniao.meet_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press inline-flex items-center gap-1.5 rounded-full bg-accentBlue px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accentBlue-hov"
            >
              <Video className="h-3.5 w-3.5" />Entrar
            </a>
          )}
        </div>
      </div>

      <div className="border-t border-line-soft pt-3 space-y-3">
        {emAberto ? (
          <>
            <p className="label-micro">Presentes ({presentes.size}/{participantes.length})</p>
            <ul className="space-y-1">
              {participantes.map(p => (
                <GrupoPresencaRow key={p.id} part={p} presente={presentes.has(p.id)} onToggle={() => toggle(p.id)} />
              ))}
            </ul>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Observação comum da reunião…"
              className="w-full min-h-[64px] resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-accentBlue"
            />
            <Button
              size="sm"
              disabled={confirmar.isPending}
              onClick={handleConfirmar}
              className="btn-press h-8 text-[12px] gap-1.5 bg-urg-lowFg text-white hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" />
              {confirmar.isPending ? 'Salvando…' : `Confirmar presença (${presentes.size})`}
            </Button>
          </>
        ) : (
          <>
            <ul className="space-y-1.5">
              {participantes.map(p => <GrupoResumoRow key={p.id} part={p} />)}
            </ul>
            {reuniao.notas && <p className="text-[12px] text-ink-secondary leading-relaxed">{reuniao.notas}</p>}
          </>
        )}
      </div>

      {editarAberto && <EditarReuniaoDialog reuniao={reuniao} onClose={() => setEditarAberto(false)} />}
      {excluirAberto && <ExcluirReuniaoDialog reuniao={reuniao} onClose={() => setExcluirAberto(false)} />}
    </div>
  )
}

function GrupoPresencaRow({ part, presente, onToggle }: {
  part: ParticipanteCard; presente: boolean; onToggle: () => void
}) {
  const prof = part.professor
  const tempo = prof ? tempoDeCasaLabel(prof.data_inicio) : null
  return (
    <li className="flex items-center gap-2">
      <button
        onClick={onToggle}
        title={presente ? 'Marcar ausente' : 'Marcar presente'}
        className={cn(
          'btn-press flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors',
          presente ? 'border-urg-lowFg bg-urg-lowFg text-white' : 'border-line bg-surface-canvas text-transparent',
        )}
      >
        <Check className="h-3 w-3" />
      </button>
      <span className={cn('text-[13px] truncate', presente ? 'text-ink' : 'text-ink-muted')}>
        {prof?.nome ?? 'Professor não vinculado'}
      </span>
      {prof && <ScoreTag score={prof.score_atual} />}
      {prof?.monitoramento && <span className="h-1.5 w-1.5 rounded-full bg-urg-highFg flex-shrink-0" title="Monitoramento ativo" />}
      {tempo && <span className="text-[11px] text-ink-muted">· {tempo}</span>}
    </li>
  )
}

function GrupoResumoRow({ part }: { part: ParticipanteCard }) {
  const prof = part.professor
  return (
    <li className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[13px] text-ink truncate">{prof?.nome ?? 'Professor não vinculado'}</span>
        {prof && <ScoreTag score={prof.score_atual} />}
      </div>
      {part.status === 'realizada' ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-urg-lowBg px-2 py-0.5 text-[11px] font-medium text-urg-lowFg flex-shrink-0">
          <Check className="h-3 w-3" />{part.numero ? `${part.numero}º monit.` : 'Presente'}
        </span>
      ) : (
        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-ink-muted flex-shrink-0">
          Não compareceu
        </span>
      )}
    </li>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ReuniaoCardView({ reuniao, dados }: { reuniao: ReuniaoCard; dados: DadosVinculo }) {
  const { profile } = useAuth()
  const podeEditar = canEdit(profile)
  const hora = new Date(reuniao.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const sv = STATUS_VISUAL[statusReuniao(reuniao)]
  const [editarAberto, setEditarAberto] = useState(false)
  const [excluirAberto, setExcluirAberto] = useState(false)

  return (
    <div className="card-surface relative overflow-hidden p-4 pl-5 space-y-3">
      <span className={cn('absolute inset-y-0 left-0 w-1', sv.bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-ink tabular-nums">{hora}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', sv.chip)}>{sv.label}</span>
            {reuniao.tipo_reuniao === 'interna' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] font-medium text-ink-secondary">
                <Users2 className="h-3 w-3" />Interna
              </span>
            )}
            {reuniao.professor_email && (
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                <Mail className="h-3 w-3" />{reuniao.professor_email}
              </span>
            )}
          </div>
          {reuniao.titulo && <p className="text-[12px] text-ink-muted truncate mt-0.5">{reuniao.titulo}</p>}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {podeEditar && (
            <>
              <button
                onClick={() => setEditarAberto(true)}
                title="Editar reunião"
                className="btn-press flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-surface-subtle hover:text-ink"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setExcluirAberto(true)}
                title="Excluir reunião"
                className="btn-press flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-urg-highBg hover:text-urg-highFg"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {reuniao.meet_link && (
            <a
              href={reuniao.meet_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press inline-flex items-center gap-1.5 rounded-full bg-accentBlue px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accentBlue-hov"
            >
              <Video className="h-3.5 w-3.5" />Entrar
            </a>
          )}
        </div>
      </div>

      <div className="border-t border-line-soft pt-3 space-y-3">
        {reuniao.tipo_reuniao === 'interna' ? (
          <ReuniaoInternaBody reuniao={reuniao} />
        ) : reuniao.participantes.length === 0 ? (
          <VincularBlock reuniao={reuniao} participanteId={null} dados={dados} />
        ) : (
          reuniao.participantes.map(part =>
            part.professor
              ? <ParticipanteRow key={part.id} part={part} />
              : <VincularBlock key={part.id} reuniao={reuniao} participanteId={part.id} dados={dados} />
          )
        )}
      </div>

      {editarAberto && <EditarReuniaoDialog reuniao={reuniao} onClose={() => setEditarAberto(false)} />}
      {excluirAberto && <ExcluirReuniaoDialog reuniao={reuniao} onClose={() => setExcluirAberto(false)} />}
    </div>
  )
}

// ─── Editar reunião (data/hora/título) ─────────────────────────────────────────

function EditarReuniaoDialog({ reuniao, onClose }: { reuniao: ReuniaoCard; onClose: () => void }) {
  const editar = useEditarReuniao()
  const dataOriginal = new Date(reuniao.data)
  const [data, setData] = useState(() => paraInputDate(dataOriginal))
  const [hora, setHora] = useState(() => dataOriginal.toTimeString().slice(0, 5))
  const [titulo, setTitulo] = useState(reuniao.titulo ?? '')
  const [pauta, setPauta] = useState(reuniao.pauta ?? '')
  const ehInterna = reuniao.tipo_reuniao === 'interna'

  async function handleSalvar() {
    if (!data) { toast.error('Selecione uma data.'); return }
    try {
      await editar.mutateAsync({
        id: reuniao.id,
        data: new Date(`${data}T${hora}:00`).toISOString(),
        titulo,
        ...(ehInterna ? { pauta } : {}),
      })
      toast.success('Reunião atualizada.')
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao editar reunião.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-canvas border border-line rounded-xl shadow-elevated w-full max-w-md mx-4 p-6 space-y-5 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">Editar reunião</h2>
          <button onClick={onClose} className="btn-press text-ink-subtle hover:text-ink-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
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

          {ehInterna && (
            <div className="space-y-1.5">
              <Label className="label-micro">Pauta (opcional)</Label>
              <textarea
                value={pauta}
                onChange={e => setPauta(e.target.value)}
                rows={3}
                placeholder="Assunto da reunião…"
                className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-ink-secondary">Cancelar</Button>
          <Button
            size="sm"
            onClick={handleSalvar}
            disabled={editar.isPending}
            className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
          >
            {editar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Excluir reunião (com confirmação) ─────────────────────────────────────────

function ExcluirReuniaoDialog({ reuniao, onClose }: { reuniao: ReuniaoCard; onClose: () => void }) {
  const excluir = useExcluirReuniao()
  const nomesVinculados = reuniao.participantes.filter(p => p.professor).map(p => p.professor!.nome)

  async function handleConfirmar() {
    try {
      await excluir.mutateAsync(reuniao.id)
      toast.success('Reunião excluída.')
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir reunião.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-canvas border border-line rounded-xl shadow-elevated w-full max-w-sm mx-4 p-6 space-y-4 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-[16px] font-semibold text-ink">Excluir reunião?</h2>
        <p className="text-[13px] text-ink-secondary leading-relaxed">
          Isso remove a reunião permanentemente do KTM
          {nomesVinculados.length > 0 && (
            <> e o vínculo com {nomesVinculados.length === 1 ? nomesVinculados[0] : `${nomesVinculados.length} professores`}</>
          )}. O evento no Google Calendar (se houver) não é cancelado — só o registro no KTM é apagado.
        </p>
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-ink-secondary">Cancelar</Button>
          <Button
            size="sm"
            onClick={handleConfirmar}
            disabled={excluir.isPending}
            className="btn-press bg-urg-highFg hover:opacity-90 text-white"
          >
            {excluir.isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Participante vinculado ─────────────────────────────────────────────────────

function ParticipanteRow({ part }: { part: ParticipanteCard }) {
  const confirmar = useConfirmarParticipacao()
  const desvincular = useDesvincularProfessor()
  const [obs, setObs] = useState(part.observacao ?? '')
  const [confirmandoTroca, setConfirmandoTroca] = useState(false)
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

  function handleDesvincular() {
    desvincular.mutate(part.id, {
      onSuccess: () => toast.success('Professor desvinculado — selecione o correto abaixo.'),
      onError:   () => toast.error('Erro ao desvincular.'),
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium text-ink truncate">{prof.nome}</span>
          <ScoreTag score={prof.score_atual} />
          {prof.monitoramento && (
            <span className="h-1.5 w-1.5 rounded-full bg-urg-highFg flex-shrink-0" title="Monitoramento ativo" />
          )}
          {tempo && <span className="text-[11px] text-ink-muted">· {tempo}</span>}

          {confirmandoTroca ? (
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[11px] text-ink-muted">Desvincular?</span>
              <button
                onClick={handleDesvincular}
                disabled={desvincular.isPending}
                className="btn-press text-[11px] font-medium text-urg-highFg hover:underline"
              >
                Sim
              </button>
              <button
                onClick={() => setConfirmandoTroca(false)}
                className="btn-press text-[11px] text-ink-muted hover:underline"
              >
                Não
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmandoTroca(true)}
              title="Desvincular e selecionar outro professor"
              className="btn-press flex h-5 w-5 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-subtle hover:text-ink flex-shrink-0"
            >
              <Unlink2 className="h-3 w-3" />
            </button>
          )}
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

// ─── Reunião interna (equipe/liderança, sem professor) ─────────────────────────

function ReuniaoInternaBody({ reuniao }: { reuniao: ReuniaoCard }) {
  const { data: perfisPorEmail } = usePerfisPorEmail()
  const confirmar = useConfirmarReuniaoInterna()
  const [obs, setObs] = useState(reuniao.notas ?? '')
  const pendente = reuniao.status === 'pendente'

  function nomeParticipante(email: string): string {
    return perfisPorEmail?.get(email.toLowerCase()) ?? email.split('@')[0]
  }

  function confirmarReuniaoInterna(aconteceu: boolean) {
    confirmar.mutate(
      { id: reuniao.id, aconteceu, observacao: obs },
      {
        onSuccess: () => toast.success(aconteceu ? 'Reunião confirmada.' : 'Marcada como não realizada.'),
        onError:   () => toast.error('Erro ao confirmar.'),
      },
    )
  }

  return (
    <div className="space-y-2">
      {reuniao.participantes_emails.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reuniao.participantes_emails.map(email => (
            <span
              key={email}
              title={email}
              className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] text-ink-secondary"
            >
              <Users2 className="h-3 w-3" />{nomeParticipante(email)}
            </span>
          ))}
        </div>
      )}

      {reuniao.pauta && (
        <p className="text-[12px] text-ink-secondary leading-relaxed">
          <span className="text-ink-subtle">Pauta: </span>{reuniao.pauta}
        </p>
      )}

      {pendente ? (
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
              onClick={() => confirmarReuniaoInterna(true)}
              className="btn-press h-8 text-[12px] gap-1.5 bg-urg-lowFg text-white hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" />Realizada
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={confirmar.isPending}
              onClick={() => confirmarReuniaoInterna(false)}
              className="btn-press h-8 text-[12px] gap-1.5 border-line text-ink-secondary"
            >
              <X className="h-3.5 w-3.5" />Não aconteceu
            </Button>
          </div>
        </div>
      ) : (
        reuniao.notas && <p className="text-[12px] text-ink-secondary leading-relaxed">{reuniao.notas}</p>
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
  const sugestoes = useMemo(
    () => (dados ? sugerirVinculos(reuniao, dados.profs, dados.emails) : []),
    [reuniao, dados],
  )

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
          <SelectTrigger size="sm" className="bg-surface-canvas border-line text-ink">
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
