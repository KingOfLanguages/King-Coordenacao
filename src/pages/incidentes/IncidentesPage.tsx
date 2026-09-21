import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Plus, AlertTriangle, CheckCircle, GraduationCap, ArrowDownNarrowWide, ArrowUpNarrowWide, ListOrdered, Trash2, UserCheck, Hand, Undo2, Pencil, Ticket, ScanSearch, Clock, Eye, EyeOff, BarChart3, Hourglass } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  useIncidentes, useReabrirIncidente, useAssumirIncidente, useLargarIncidente, useAtualizarTiStatus, useCienteInforme,
  statusChamado, natureza as naturezaDe, abaDoIncidente, categoriasVisiveis,
  CATEGORIAS_PROFESSOR, CATEGORIAS_GERAL, CATEGORIAS_PLATAFORMA,
  type Incidente, type StatusChamado, type Aba, type TiStatus,
} from '@/hooks/useIncidentes'
import { NovoIncidenteDialog } from '@/components/incidentes/NovoIncidenteDialog'
import { EditarIncidenteDialog } from '@/components/incidentes/EditarIncidenteDialog'
import { ResolverIncidenteDialog } from '@/components/incidentes/ResolverIncidenteDialog'
import { ExcluirIncidenteDialog } from '@/components/incidentes/ExcluirIncidenteDialog'
import { IncidenteDetalheDialog } from '@/components/incidentes/IncidenteDetalheDialog'
import { DesempenhoPrioridade } from '@/components/incidentes/DesempenhoPrioridade'
import { CalendarioIncidentes } from '@/components/incidentes/CalendarioIncidentes'
import { IncidentesPorAluno } from '@/components/incidentes/IncidentesPorAluno'
import { Abas } from '@/components/ui/abas'
import { useAbaUrl } from '@/hooks/useAbaUrl'
import { useCanView } from '@/hooks/usePagePermissions'
import { tiStatusLabel } from '@/lib/nexusLabels'
import {
  PRIORIDADES, PRIORIDADE_META, normalizarPrioridade, metaPrioridade, estadoPrazo, estaAtrasado,
  compararPorPrioridade, type Prioridade, type EstadoPrazo,
} from '@/lib/incidentePrioridade'
import { rotuloAluno } from '@/lib/incidenteRelato'
import { atributosChamadoTi } from '@/lib/chamadoTi'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useAgora } from '@/hooks/useAgora'
import { canEditIncidente, podeVerCategoriasCoordOnly } from '@/lib/permissions'

/** "fila" = desafios não concluídos. Informe tem visão própria: não entra na
 *  fila (não tem resolução) — antes, 326 deles enchiam a lista de ativos. */
type FiltroStatus = 'fila' | 'aberto' | 'em_andamento' | 'informes' | 'concluido' | 'todos'
type FiltroUrgencia = 'todas' | Prioridade
type Ordem = 'prioridade' | 'novo' | 'antigo'
/** Visões da tela. "Por aluno" era a página /alunos e "Calendário" a aba Agenda
 *  de Tarefas — os mesmos incidentes, agrupados de outro jeito. */
type Visao = 'lista' | 'alunos' | 'calendario'
const VISOES: readonly Visao[] = ['lista', 'alunos', 'calendario']

const ABAS: [Aba, string][] = [
  ['professor', 'Professor'],
  ['geral', 'Geral'],
  ['plataforma', 'Plataforma'],
]

/** Rótulo + cor de cada estado do chamado. */
const STATUS_META: Record<StatusChamado, { label: string; chip: string }> = {
  aberto:       { label: 'Em aberto',    chip: 'bg-urg-medBg text-urg-medFg' },
  em_andamento: { label: 'Em andamento', chip: 'bg-accentBlue-soft text-accentBlue' },
  concluido:    { label: 'Concluído',    chip: 'bg-urg-lowBg text-urg-lowFg' },
}

/** Ação de destaque da linha — a única cheia de cor, para dizer qual é o passo
 *  natural daquele chamado. Usa os tokens `aviso.*` porque `urg-*`/`accent-*`
 *  NÃO viram no tema escuro: continuariam pastel quase branco sobre o preto.
 *  O hover sobe para o token `*Bd` (um degrau de tinta) em vez de usar
 *  modificador de opacidade, que em cor `var()` fica transparente sem erro. */
const ACAO_DESTAQUE: Record<'info' | 'ok', string> = {
  info: 'bg-aviso-infoBg text-aviso-infoFg border-aviso-infoBd hover:bg-aviso-infoBd hover:text-aviso-infoFg',
  ok:   'bg-aviso-okBg text-aviso-okFg border-aviso-okBd hover:bg-aviso-okBd hover:text-aviso-okFg',
}

const FILTROS_STATUS: [FiltroStatus, string][] = [
  ['fila', 'Fila'],
  ['aberto', 'Ninguém assumiu'],
  ['em_andamento', 'Em andamento'],
  ['informes', 'Informes'],
  ['concluido', 'Concluídos'],
  ['todos', 'Todos'],
]

const ORDEM_LABEL: Record<Ordem, string> = {
  prioridade: 'Por prioridade',
  novo: 'Mais recentes',
  antigo: 'Mais antigos',
}
const PROXIMA_ORDEM: Record<Ordem, Ordem> = { prioridade: 'novo', novo: 'antigo', antigo: 'prioridade' }

function tempoRelativo(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'há 1 dia'
  return `há ${dias} dias`
}

/** Duração em dias (número) → rótulo legível. Menos de 1 dia vira horas. */
function fmtDuracao(dias: number): string {
  if (dias < 1) {
    const horas = Math.max(1, Math.round(dias * 24))
    return `${horas}h`
  }
  const arred = dias < 10 ? dias.toFixed(1).replace('.', ',') : String(Math.round(dias))
  return `${arred} ${dias < 2 ? 'dia' : 'dias'}`
}

/** Tempo entre criação e resolução, em dias (fracionários). null se não resolvido. */
function diasResolucao(i: { created_at: string; resolved: boolean; resolved_at: string | null }): number | null {
  if (!i.resolved || !i.resolved_at) return null
  return (new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime()) / 86_400_000
}

function dataHoraFmt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Chip do relógio do chamado: vencido em vermelho; perto de vencer em âmbar. */
function ChipPrazo({ estado, i }: { estado: EstadoPrazo; i: Incidente }) {
  const perto = estado.etapa === 'primeira_acao'
    ? estado.restanteMs < 60 * 60_000
    : estado.restanteMs < 24 * 3_600_000
  const alvo = estado.etapa === 'primeira_acao' ? i.prazo_primeira_acao : i.prazo_resolucao
  return (
    <span
      title={`${estado.etapa === 'primeira_acao' ? 'Prazo para alguém assumir' : 'Prazo de resolução'}: ${alvo ? dataHoraFmt(alvo) : '—'}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums',
        estado.vencido
          ? 'bg-urg-critBg text-urg-critFg'
          : perto
            ? 'bg-urg-medBg text-urg-medFg'
            : 'bg-surface-subtle text-ink-secondary',
      )}
    >
      {estado.etapa === 'primeira_acao' ? <Hourglass className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {estado.rotulo}
    </span>
  )
}

export function IncidentesPage() {
  const { profile } = useAuth()
  const podeEditar = canEditIncidente(profile)
  const podeVerCoordOnly = podeVerCategoriasCoordOnly(profile)
  const { data: incidentes = [], isLoading } = useIncidentes()
  const reabrir = useReabrirIncidente()
  const assumir = useAssumirIncidente()
  const largar = useLargarIncidente()
  const atualizarTiStatus = useAtualizarTiStatus()
  const ciente = useCienteInforme()
  // Relógio de 1 min: mantém "assumir em 40min" e o placar de atrasados em dia com a tela aberta.
  const agora = useAgora()

  const [novoAberto, setNovoAberto] = useState(false)
  const [resolverAlvo, setResolverAlvo] = useState<Incidente | null>(null)
  const [editarAlvo, setEditarAlvo] = useState<Incidente | null>(null)
  const [excluirAlvo, setExcluirAlvo] = useState<Incidente | null>(null)
  const [detalheClick, setDetalheClick] = useState<Incidente | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [aba, setAba] = useState<Aba>('professor')
  const [verDesempenho, setVerDesempenho] = useState(false)
  const [visao, setVisao] = useAbaUrl<Visao>(VISOES, 'lista', 'visao')
  const { canView } = useCanView()
  // A visão por aluno herda a permissão da antiga página /alunos.
  const podeVerPorAluno = canView('alunos')

  // Deep-link: /incidentes?incidente=<id> abre o detalhe daquele incidente.
  // Derivado em render (sem setState em efeito): o alvo é o que o usuário clicou
  // ou, na falta disso, o incidente apontado pela URL.
  const detalheDeepLink = useMemo(() => {
    const id = searchParams.get('incidente')
    return id ? incidentes.find(i => i.id === id) ?? null : null
  }, [searchParams, incidentes])
  const detalheAlvo = detalheClick ?? detalheDeepLink

  function fecharDetalhe() {
    setDetalheClick(null)
    if (searchParams.get('incidente')) {
      searchParams.delete('incidente')
      setSearchParams(searchParams, { replace: true })
    }
  }
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<string>('todas')
  // ?status= permite chegar direto numa visão (ex.: "Hoje" → informes novos).
  const [status, setStatus] = useState<FiltroStatus>(() => {
    const s = searchParams.get('status')
    return FILTROS_STATUS.some(([v]) => v === s) ? (s as FiltroStatus) : 'fila'
  })
  const [urgenciaFiltro, setUrgenciaFiltro] = useState<FiltroUrgencia>('todas')
  const [professorFiltro, setProfessorFiltro] = useState<string>('todos')
  const [ordem, setOrdem] = useState<Ordem>('prioridade')
  const [soMeus, setSoMeus] = useState(false)
  const [soAtrasados, setSoAtrasados] = useState(false)

  const porAba = useMemo(
    () => incidentes.filter(i => abaDoIncidente(i) === aba),
    [incidentes, aba],
  )

  const categoriasAbaBase = aba === 'professor' ? CATEGORIAS_PROFESSOR : aba === 'plataforma' ? CATEGORIAS_PLATAFORMA : CATEGORIAS_GERAL
  const categoriasAba = categoriasVisiveis(categoriasAbaBase, podeVerCoordOnly)

  const professoresComIncidente = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const i of porAba) {
      if (i.professor_id) mapa.set(i.professor_id, i.teacher_name)
    }
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [porAba])

  // ── Placar: só a fila (desafios não concluídos) da aba ──────────────────────
  const placar = useMemo(() => {
    const fila = porAba.filter(i => naturezaDe(i) === 'desafio' && !i.resolved)
    const porNivel = Object.fromEntries(PRIORIDADES.map(p => [p, { total: 0, atrasados: 0 }])) as
      Record<Prioridade, { total: number; atrasados: number }>
    let semAcao = 0, semAcaoVencida = 0, atrasados = 0
    for (const i of fila) {
      const n = porNivel[normalizarPrioridade(i.urgency)]
      n.total++
      const atr = estaAtrasado(i, agora)
      if (atr) { n.atrasados++; atrasados++ }
      if (!i.primeira_acao_em && !i.assumido_por) {
        semAcao++
        if (i.prazo_primeira_acao && new Date(i.prazo_primeira_acao).getTime() < agora) semAcaoVencida++
      }
    }
    const informesNovos = porAba.filter(i => naturezaDe(i) === 'informe' && !i.ciente_em).length
    return { porNivel, semAcao, semAcaoVencida, atrasados, informesNovos }
  }, [porAba, agora])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = porAba.filter(i => {
      const informe = naturezaDe(i) === 'informe'
      if (soMeus && i.created_by !== profile?.id) return false
      const st = statusChamado(i)
      if (status === 'fila' && (informe || i.resolved)) return false
      if (status === 'aberto' && (informe || st !== 'aberto')) return false
      if (status === 'em_andamento' && (informe || st !== 'em_andamento')) return false
      if (status === 'informes' && !informe) return false
      if (status === 'concluido' && (informe || !i.resolved)) return false
      if (soAtrasados && !estaAtrasado(i, agora)) return false
      if (categoria !== 'todas' && i.problem_type !== categoria) return false
      if (urgenciaFiltro !== 'todas' && normalizarPrioridade(i.urgency) !== urgenciaFiltro) return false
      if (professorFiltro !== 'todos' && i.professor_id !== professorFiltro) return false
      if (termo && !(
        i.teacher_name.toLowerCase().includes(termo) ||
        (i.aluno_nome ?? '').toLowerCase().includes(termo) ||
        i.coordinator.toLowerCase().includes(termo) ||
        i.description.toLowerCase().includes(termo) ||
        (i.passos ?? '').toLowerCase().includes(termo) ||
        // ID do King (professor e aluno) — buscar por "1234" tem que achar.
        String(i.aluno_id ?? '') === termo ||
        (i.professor_kms_id ?? '') === termo
      )) return false
      return true
    })
    if (ordem === 'prioridade') {
      // Informes: os ainda não lidos primeiro, depois a importância, depois o mais novo.
      if (status === 'informes') {
        return [...lista].sort((a, b) =>
          (a.ciente_em ? 1 : 0) - (b.ciente_em ? 1 : 0) ||
          metaPrioridade(b.urgency).peso - metaPrioridade(a.urgency).peso ||
          b.created_at.localeCompare(a.created_at))
      }
      return [...lista].sort((a, b) => compararPorPrioridade(a, b, agora))
    }
    const sinal = ordem === 'novo' ? -1 : 1
    return [...lista].sort((a, b) => sinal * a.created_at.localeCompare(b.created_at))
  }, [porAba, busca, categoria, status, urgenciaFiltro, professorFiltro, ordem, soMeus, soAtrasados, profile?.id, agora])

  function trocarAba(novaAba: Aba) {
    setAba(novaAba)
    setCategoria('todas')
    setProfessorFiltro('todos')
  }

  /** Card do placar: filtra a fila por aquele nível (clicar de novo desfaz). */
  function filtrarNivel(p: Prioridade) {
    setStatus('fila')
    setUrgenciaFiltro(f => (f === p ? 'todas' : p))
  }

  return (
    <TooltipProvider>
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Incidentes</h1>
          <p className="text-[13px] text-ink-muted">
            {aba === 'professor' && 'Incidentes vinculados a um professor.'}
            {aba === 'geral' && 'Questões administrativas, operacionais e ocorrências que não dependem do professor.'}
            {aba === 'plataforma' && 'Bugs e melhorias reportados ao TI.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {visao === 'lista' && <Button
            size="sm"
            variant="outline"
            className={cn('btn-press gap-1.5 border-line', verDesempenho && 'bg-surface-subtle')}
            onClick={() => setVerDesempenho(v => !v)}
            aria-pressed={verDesempenho}
          >
            <BarChart3 className="h-3.5 w-3.5" />Desempenho
          </Button>}
          <Button
            size="sm"
            className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white gap-1.5"
            onClick={() => setNovoAberto(true)}
          >
            <Plus className="h-3.5 w-3.5" />Novo Incidente
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
      {visao === 'lista' ? (
        <Abas<Aba>
          ariaLabel="Tipo de incidente"
          valor={aba}
          onChange={trocarAba}
          abas={ABAS.map(([value, label]) => ({ id: value, label, n: incidentes.filter(i => abaDoIncidente(i) === value).length }))}
        />
      ) : <span />}
        <Abas<Visao>
          ariaLabel="Visão"
          valor={visao}
          onChange={setVisao}
          abas={[
            { id: 'lista', label: 'Lista' },
            ...(podeVerPorAluno ? [{ id: 'alunos' as const, label: 'Por aluno' }] : []),
            { id: 'calendario', label: 'Calendário' },
          ]}
        />
      </div>

      {visao === 'alunos' && podeVerPorAluno && <IncidentesPorAluno />}
      {visao === 'calendario' && (
        <CalendarioIncidentes
          onAbrir={id => { const alvo = incidentes.find(x => x.id === id); if (alvo) setDetalheClick(alvo) }}
          onVerLista={() => setVisao('lista')}
        />
      )}

      {visao === 'lista' && <>

      {verDesempenho && <DesempenhoPrioridade incidentes={porAba} aba={aba} />}

      {/* Placar da fila: quanto tem em cada nível e quanto disso já venceu. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {PRIORIDADES.map(p => {
          const n = placar.porNivel[p]
          const ativo = status === 'fila' && urgenciaFiltro === p
          return (
            <button
              key={p}
              onClick={() => filtrarNivel(p)}
              aria-pressed={ativo}
              className={cn(
                'card-surface relative overflow-hidden p-4 pl-5 text-left transition-all hover:shadow-sm',
                ativo && 'ring-1 ring-ink',
              )}
            >
              <span className={cn('absolute inset-y-0 left-0 w-1', PRIORIDADE_META[p].cor)} />
              <p className="text-[11px] font-medium text-ink-muted">{p}</p>
              <p className="text-2xl font-semibold text-ink tabular-nums">{n.total}</p>
              <p className={cn('text-[11px] mt-0.5 tabular-nums', n.atrasados ? 'text-urg-critFg font-medium' : 'text-ink-subtle')}>
                {n.atrasados ? `${n.atrasados} atrasado${n.atrasados > 1 ? 's' : ''}` : 'nenhum atrasado'}
              </p>
            </button>
          )
        })}
        <button
          onClick={() => { setStatus(s => (s === 'aberto' ? 'fila' : 'aberto')); setUrgenciaFiltro('todas') }}
          aria-pressed={status === 'aberto'}
          className={cn(
            'card-surface p-4 text-left transition-all hover:shadow-sm col-span-2 md:col-span-1',
            status === 'aberto' && 'ring-1 ring-ink',
          )}
        >
          <p className="text-[11px] font-medium text-ink-muted flex items-center gap-1"><Hourglass className="h-3 w-3" />Ninguém assumiu</p>
          <p className="text-2xl font-semibold text-ink tabular-nums">{placar.semAcao}</p>
          <p className={cn('text-[11px] mt-0.5 tabular-nums', placar.semAcaoVencida ? 'text-urg-critFg font-medium' : 'text-ink-subtle')}>
            {placar.semAcaoVencida ? `${placar.semAcaoVencida} fora do prazo` : 'todos dentro do prazo'}
          </p>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <Input
            placeholder={aba === 'professor' ? 'Buscar por professor, aluno, ID do King ou descrição…' : 'Buscar por referência, ID do King ou descrição…'}
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-9 bg-surface-canvas border-line"
          />
        </div>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="h-9 w-[180px] text-[12px] bg-surface-canvas border-line text-ink">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface-canvas border-line text-ink max-h-64">
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {categoriasAba.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {aba === 'professor' && (
          <Select value={professorFiltro} onValueChange={setProfessorFiltro}>
            <SelectTrigger className="h-9 w-[180px] text-[12px] bg-surface-canvas border-line text-ink">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-surface-canvas border-line text-ink max-h-64">
              <SelectItem value="todos">Todos os professores</SelectItem>
              {professoresComIncidente.map(([id, nome]) => (
                <SelectItem key={id} value={id}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={urgenciaFiltro} onValueChange={v => setUrgenciaFiltro(v as FiltroUrgencia)}>
          <SelectTrigger className="h-9 w-[160px] text-[12px] bg-surface-canvas border-line text-ink">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface-canvas border-line text-ink">
            <SelectItem value="todas">Todas as prioridades</SelectItem>
            {PRIORIDADES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Abas<FiltroStatus>
          ariaLabel="Situação"
          tamanho="sm"
          valor={status}
          onChange={setStatus}
          abas={FILTROS_STATUS.map(([value, label]) => (
            value === 'informes' ? { id: value, label, n: placar.informesNovos, alerta: true } : { id: value, label }
          ))}
        />
        <button
          onClick={() => setSoAtrasados(v => !v)}
          aria-pressed={soAtrasados}
          className={cn(
            'btn-press flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium transition-colors',
            soAtrasados ? 'bg-urg-critFg text-white' : 'text-ink-secondary bg-surface-subtle hover:text-ink',
          )}
          title="Mostrar só o que passou do prazo de 1ª ação ou de resolução"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Atrasados{placar.atrasados > 0 && <span className="tabular-nums">· {placar.atrasados}</span>}
        </button>
        <button
          onClick={() => setOrdem(o => PROXIMA_ORDEM[o])}
          className="btn-press flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium text-ink-secondary bg-surface-subtle hover:text-ink transition-colors"
          title="Alternar ordenação"
        >
          {ordem === 'prioridade' ? <ListOrdered className="h-3.5 w-3.5" /> : ordem === 'novo' ? <ArrowDownNarrowWide className="h-3.5 w-3.5" /> : <ArrowUpNarrowWide className="h-3.5 w-3.5" />}
          {ORDEM_LABEL[ordem]}
        </button>
        <button
          onClick={() => setSoMeus(v => !v)}
          className={cn(
            'btn-press flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium transition-colors',
            soMeus
              ? 'bg-accentBlue text-white'
              : 'text-ink-secondary bg-surface-subtle hover:text-ink',
          )}
          title="Mostrar só os chamados que eu abri"
        >
          <UserCheck className="h-3.5 w-3.5" />
          Meus chamados
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
      ) : filtrados.length === 0 ? (
        <div className="card-surface p-8 text-center">
          <p className="text-[13px] text-ink-muted">
            {status === 'fila' && !soAtrasados && urgenciaFiltro === 'todas' ? 'Fila vazia: nenhum chamado aberto nesta aba.' : 'Nenhum incidente encontrado.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtrados.map(i => {
            const st = statusChamado(i)
            const meta = STATUS_META[st]
            const isInforme = naturezaDe(i) === 'informe'
            const isPlataforma = abaDoIncidente(i) === 'plataforma'
            const nivel = normalizarPrioridade(i.urgency)
            const nivelMeta = PRIORIDADE_META[nivel]
            const urgente = nivel === 'Urgente' && !i.resolved && !isInforme
            // Os hooks de mutação são compartilhados pela lista inteira: sem
            // comparar o id, um clique em "Assumir" desabilitaria a linha toda.
            const assumindo  = assumir.isPending && assumir.variables?.id === i.id
            const largando   = largar.isPending && largar.variables?.id === i.id
            const reabrindo  = reabrir.isPending && reabrir.variables?.id === i.id
            const mudandoTi  = atualizarTiStatus.isPending && atualizarTiStatus.variables?.id === i.id
            const marcandoCiente = ciente.isPending && ciente.variables?.id === i.id
            // Informe não tem fluxo de resolução → não tem relógio.
            const relogio = estadoPrazo(i, agora)
            return (
            <div
              key={i.id}
              role="button"
              tabIndex={0}
              {...atributosChamadoTi(i)}
              onClick={() => setDetalheClick(i)}
              onKeyDown={e => { if (e.key === 'Enter') setDetalheClick(i) }}
              className={cn(
                'flex gap-2.5 rounded-lg border bg-surface-canvas px-3 py-2.5 items-start transition-colors hover:bg-surface-subtle/40 cursor-pointer',
                // Urgente: destaque fixo (a borda na cor do nível). Piscar cansava
                // o olho e, com 44 itens assim, ninguém mais via.
                urgente ? 'border-urg-critFg' : 'border-line',
              )}
            >
              <div className={cn(
                'w-[3px] self-stretch rounded-full flex-shrink-0',
                isInforme ? 'bg-ink-subtle' : nivelMeta.cor,
              )} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {isInforme ? (
                    <span className={cn(
                      'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-medium',
                      i.ciente_em ? 'bg-surface-muted text-ink-muted' : 'bg-accentBlue text-white',
                    )}>
                      {i.ciente_em ? 'Informe' : 'Informe novo'}
                    </span>
                  ) : (
                    <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-medium', meta.chip)}>
                      {meta.label}
                    </span>
                  )}
                  {isPlataforma && i.ti_status && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accentBlue-soft/60 text-accentBlue px-1.5 py-0.5 text-[10.5px] font-medium">
                      <Ticket className="h-3 w-3" />{tiStatusLabel[i.ti_status] ?? i.ti_status}
                    </span>
                  )}
                  {i.professor_id ? (
                    <span className="text-[13px] font-medium text-ink">{i.teacher_name}</span>
                  ) : (
                    <span className="text-[13px] font-medium text-ink-secondary italic">{i.teacher_name}</span>
                  )}
                  {rotuloAluno(i) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accentBlue-soft/60 text-accentBlue px-1.5 py-0.5 text-[10.5px] font-medium">
                      <GraduationCap className="h-3 w-3" />{rotuloAluno(i)}
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-full bg-surface-subtle text-ink-secondary px-1.5 py-0.5 text-[10.5px] font-medium">
                    {i.problem_type}
                  </span>
                  {relogio && <ChipPrazo estado={relogio} i={i} />}
                </div>
                {urgente && i.urgencia_justificativa && (
                  <p className="text-[12px] text-urg-critFg mt-1 truncate" title={i.urgencia_justificativa}>
                    <AlertTriangle className="inline h-3 w-3 -mt-0.5 mr-1" />{i.urgencia_justificativa}
                  </p>
                )}
                <p className="text-[12.5px] text-ink-secondary mt-1 truncate" title={i.description}>{i.description}</p>
                <p className="text-[10.5px] text-ink-muted mt-1">
                  {i.coordinator} · {tempoRelativo(i.created_at)}
                  {i.responsavel_nome && (
                    <span> · resp. {i.responsavel_nome}</span>
                  )}
                  {st === 'em_andamento' && !isInforme && i.assumido_por_nome && (
                    <span className="text-accentBlue"> · sendo resolvido por {i.assumido_por_nome}</span>
                  )}
                  {isInforme && i.ciente_em && (
                    <span> · lido{i.ciente_por_nome ? ` por ${i.ciente_por_nome}` : ''} {tempoRelativo(i.ciente_em)}</span>
                  )}
                  {st === 'concluido' && !isInforme && (() => {
                    const d = diasResolucao(i)
                    const por = i.assumido_por_nome ? ` por ${i.assumido_por_nome}` : ''
                    return d !== null
                      ? <span className="text-urg-lowFg"> · concluído em {fmtDuracao(d)}{por}</span>
                      : (por ? <span className="text-urg-lowFg"> · concluído{por}</span> : null)
                  })()}
                </p>
                {i.image_urls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {i.image_urls.map((url, idx) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="block h-10 w-10 overflow-hidden rounded-md border border-line hover:opacity-90"
                      >
                        <img src={url} alt={`Anexo ${idx + 1}`} loading="lazy" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium cursor-help',
                      nivelMeta.chip,
                    )}>
                      {(nivel === 'Urgente' || nivel === 'Alta') && <AlertTriangle className="h-3 w-3" />}
                      {nivel}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent onClick={e => e.stopPropagation()} className="max-w-xs">
                    {isInforme ? nivelMeta.importancia : (
                      <>
                        {nivelMeta.criterio}
                        <br />Assumir {nivelMeta.primeiraAcao} · resolver {nivelMeta.resolucao}.
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  {/* Ponto de encaixe do botão "Abrir chamado no TI" da extensão.
                      Fica na MESMA fileira das ações — numa linha própria ele
                      quebrava o alinhamento do card. Vazio para quem não tem a
                      extensão, e aí o flex não ocupa espaço nenhum. */}
                  <span data-ktm-chamado-slot="" className="contents" />
                  {podeEditar && (
                    <>
                    {isInforme && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className={i.ciente_em ? undefined : ACAO_DESTAQUE.info}
                        disabled={marcandoCiente}
                        onClick={() => ciente.mutate(
                          { id: i.id, ciente: !i.ciente_em },
                          { onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao marcar o informe.') },
                        )}
                        title={i.ciente_em ? 'Voltar a marcar como novo' : 'Marcar como lido'}
                      >
                        {i.ciente_em ? <><EyeOff />Marcar como novo</> : <><Eye />Ciente</>}
                      </Button>
                    )}
                    {isPlataforma && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mudandoTi}
                        onClick={() => atualizarTiStatus.mutate(
                          { id: i.id, ti_status: (i.ti_status === 'em_analise_ti' ? 'chamado_aberto' : 'em_analise_ti') as TiStatus },
                          { onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao atualizar estado do TI.') },
                        )}
                        title="Alternar estado junto ao TI"
                      >
                        <ScanSearch />
                        {i.ti_status === 'em_analise_ti' ? 'Em análise' : 'Chamado aberto'}
                      </Button>
                    )}
                    {!isInforme && st === 'aberto' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className={ACAO_DESTAQUE.info}
                        disabled={assumindo}
                        onClick={() => assumir.mutate(
                          { id: i.id, professor_id: i.professor_id },
                          { onSuccess: () => toast.success('Você assumiu este chamado.'), onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao assumir.') },
                        )}
                      >
                        <Hand />Assumir
                      </Button>
                    )}
                    {!isInforme && st === 'em_andamento' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={largando}
                        onClick={() => largar.mutate(
                          { id: i.id, professor_id: i.professor_id },
                          { onSuccess: () => toast.success('Chamado devolvido para "em aberto".'), onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao largar.') },
                        )}
                        title="Devolver para em aberto"
                      >
                        <Undo2 />Largar
                      </Button>
                    )}
                    {!isInforme && (st === 'concluido' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={reabrindo}
                        onClick={() => reabrir.mutate(
                          { id: i.id, professor_id: i.professor_id },
                          { onSuccess: () => toast.success('Chamado reaberto.'), onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao reabrir.') },
                        )}
                      >
                        <Undo2 />Reabrir
                      </Button>
                    ) : (
                      // Em aberto o passo natural é assumir, então "Concluir" fica
                      // discreto; assumido, ele vira a ação de destaque da linha.
                      <Button
                        size="sm"
                        variant={st === 'aberto' ? 'outline' : 'ghost'}
                        className={st === 'aberto' ? undefined : ACAO_DESTAQUE.ok}
                        onClick={() => setResolverAlvo(i)}
                      >
                        <CheckCircle />Concluir
                      </Button>
                    ))}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditarAlvo(i)}
                      aria-label="Editar chamado"
                      title="Editar"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="hover:bg-aviso-warnBg hover:text-aviso-warnFg"
                      onClick={() => setExcluirAlvo(i)}
                      aria-label="Excluir incidente"
                      title="Excluir"
                    >
                      <Trash2 />
                    </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}

      </>}

      <NovoIncidenteDialog open={novoAberto} onOpenChange={setNovoAberto} />
      <EditarIncidenteDialog
        open={!!editarAlvo}
        onOpenChange={o => !o && setEditarAlvo(null)}
        incidente={editarAlvo}
      />
      <ResolverIncidenteDialog
        open={!!resolverAlvo}
        onOpenChange={o => !o && setResolverAlvo(null)}
        incidente={resolverAlvo}
      />
      <ExcluirIncidenteDialog
        open={!!excluirAlvo}
        onOpenChange={o => !o && setExcluirAlvo(null)}
        incidente={excluirAlvo}
      />
      <IncidenteDetalheDialog
        open={!!detalheAlvo}
        onOpenChange={o => !o && fecharDetalhe()}
        incidente={detalheAlvo}
        podeEditar={podeEditar}
        onEditar={() => { const alvo = detalheAlvo; fecharDetalhe(); setEditarAlvo(alvo) }}
      />
    </div>
    </TooltipProvider>
  )
}
