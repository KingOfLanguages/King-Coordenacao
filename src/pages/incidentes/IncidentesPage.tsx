import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Plus, AlertTriangle, CheckCircle, GraduationCap, ArrowDownNarrowWide, ArrowUpNarrowWide, Trash2, Clock, UserCheck, CircleDot, Hand, Undo2, Pencil, Ticket, ScanSearch } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  useIncidentes, useReabrirIncidente, useAssumirIncidente, useLargarIncidente, useAtualizarTiStatus,
  statusChamado, natureza as naturezaDe, abaDoIncidente, categoriasVisiveis,
  CATEGORIAS_PROFESSOR, CATEGORIAS_GERAL, CATEGORIAS_PLATAFORMA,
  type Incidente, type StatusChamado, type Aba, type TiStatus,
} from '@/hooks/useIncidentes'
import { NovoIncidenteDialog } from '@/components/incidentes/NovoIncidenteDialog'
import { EditarIncidenteDialog } from '@/components/incidentes/EditarIncidenteDialog'
import { ResolverIncidenteDialog } from '@/components/incidentes/ResolverIncidenteDialog'
import { ExcluirIncidenteDialog } from '@/components/incidentes/ExcluirIncidenteDialog'
import { IncidenteDetalheDialog } from '@/components/incidentes/IncidenteDetalheDialog'
import { urgenciaChip, URGENCIA_EXPLICACAO, tiStatusLabel } from '@/lib/nexusLabels'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { canEditIncidente, podeVerCategoriasCoordOnly } from '@/lib/permissions'

type FiltroStatus = 'ativos' | 'aberto' | 'em_andamento' | 'concluido' | 'todos'
type FiltroUrgencia = 'todas' | 'Baixa' | 'Média' | 'Alta' | 'Crítico'
type Ordem = 'novo' | 'antigo'

const URG_BAR: Record<string, string> = {
  Baixa: 'bg-urg-lowFg',
  Média: 'bg-urg-medFg',
  Alta:  'bg-urg-highFg',
  Crítico: 'bg-urg-critFg',
}

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

const FILTROS_STATUS: [FiltroStatus, string][] = [
  ['ativos', 'Ativos'],
  ['aberto', 'Em aberto'],
  ['em_andamento', 'Em andamento'],
  ['concluido', 'Concluídos'],
  ['todos', 'Todos'],
]

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

export function IncidentesPage() {
  const { profile } = useAuth()
  const podeEditar = canEditIncidente(profile)
  const podeVerCoordOnly = podeVerCategoriasCoordOnly(profile)
  const { data: incidentes = [], isLoading } = useIncidentes()
  const reabrir = useReabrirIncidente()
  const assumir = useAssumirIncidente()
  const largar = useLargarIncidente()
  const atualizarTiStatus = useAtualizarTiStatus()

  const [novoAberto, setNovoAberto] = useState(false)
  const [resolverAlvo, setResolverAlvo] = useState<Incidente | null>(null)
  const [editarAlvo, setEditarAlvo] = useState<Incidente | null>(null)
  const [excluirAlvo, setExcluirAlvo] = useState<Incidente | null>(null)
  const [detalheClick, setDetalheClick] = useState<Incidente | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [aba, setAba] = useState<Aba>('professor')

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
  const [status, setStatus] = useState<FiltroStatus>('ativos')
  const [urgenciaFiltro, setUrgenciaFiltro] = useState<FiltroUrgencia>('todas')
  const [professorFiltro, setProfessorFiltro] = useState<string>('todos')
  const [ordem, setOrdem] = useState<Ordem>('novo')
  const [soMeus, setSoMeus] = useState(false)

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

  const temposResolucao = porAba
    .map(diasResolucao)
    .filter((d): d is number => d !== null)
  const tempoMedioResolucao = temposResolucao.length
    ? temposResolucao.reduce((a, b) => a + b, 0) / temposResolucao.length
    : null

  const stats = {
    aberto: porAba.filter(i => statusChamado(i) === 'aberto').length,
    emAndamento: porAba.filter(i => statusChamado(i) === 'em_andamento').length,
    concluidos: porAba.filter(i => i.resolved).length,
    tempoMedioResolucao,
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = porAba.filter(i => {
      if (soMeus && i.created_by !== profile?.id) return false
      const st = statusChamado(i)
      if (status === 'ativos' && st === 'concluido') return false
      if (status === 'aberto' && st !== 'aberto') return false
      if (status === 'em_andamento' && st !== 'em_andamento') return false
      if (status === 'concluido' && st !== 'concluido') return false
      if (categoria !== 'todas' && i.problem_type !== categoria) return false
      if (urgenciaFiltro !== 'todas' && i.urgency !== urgenciaFiltro) return false
      if (professorFiltro !== 'todos' && i.professor_id !== professorFiltro) return false
      if (termo && !(
        i.teacher_name.toLowerCase().includes(termo) ||
        (i.aluno_nome ?? '').toLowerCase().includes(termo) ||
        i.coordinator.toLowerCase().includes(termo) ||
        i.description.toLowerCase().includes(termo)
      )) return false
      return true
    })
    const sinal = ordem === 'novo' ? -1 : 1
    return [...lista].sort((a, b) => sinal * a.created_at.localeCompare(b.created_at))
  }, [porAba, busca, categoria, status, urgenciaFiltro, professorFiltro, ordem, soMeus, profile?.id])

  function trocarAba(novaAba: Aba) {
    setAba(novaAba)
    setCategoria('todas')
    setProfessorFiltro('todos')
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
        <Button
          size="sm"
          className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white gap-1.5"
          onClick={() => setNovoAberto(true)}
        >
          <Plus className="h-3.5 w-3.5" />Novo Incidente
        </Button>
      </header>

      <div className="flex items-center gap-1 rounded-full bg-surface-subtle p-1 w-fit">
        {ABAS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => trocarAba(value)}
            className={cn(
              'btn-press px-4 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-200',
              aba === value ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
            )}
          >
            {label} <span className="text-ink-muted tabular-nums">{incidentes.filter(i => abaDoIncidente(i) === value).length}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => setStatus('aberto')}
          className={cn('card-surface p-4 text-left transition-all hover:shadow-sm', status === 'aberto' && 'ring-1 ring-urg-medFg/40')}
        >
          <p className="text-[11px] text-urg-medFg flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Em aberto</p>
          <p className="text-2xl font-semibold text-urg-medFg tabular-nums">{stats.aberto}</p>
        </button>
        <button
          onClick={() => setStatus('em_andamento')}
          className={cn('card-surface p-4 text-left transition-all hover:shadow-sm', status === 'em_andamento' && 'ring-1 ring-accentBlue/40')}
        >
          <p className="text-[11px] text-accentBlue flex items-center gap-1"><CircleDot className="h-3 w-3" />Em andamento</p>
          <p className="text-2xl font-semibold text-accentBlue tabular-nums">{stats.emAndamento}</p>
        </button>
        <button
          onClick={() => setStatus('concluido')}
          className={cn('card-surface p-4 text-left transition-all hover:shadow-sm', status === 'concluido' && 'ring-1 ring-urg-lowFg/40')}
        >
          <p className="text-[11px] text-urg-lowFg flex items-center gap-1"><CheckCircle className="h-3 w-3" />Concluídos</p>
          <p className="text-2xl font-semibold text-urg-lowFg tabular-nums">{stats.concluidos}</p>
        </button>
        <div className="card-surface p-4">
          <p className="text-[11px] text-ink-muted flex items-center gap-1"><Clock className="h-3 w-3" />Tempo médio de resolução</p>
          <p className="text-2xl font-semibold text-ink tabular-nums">
            {stats.tempoMedioResolucao === null ? '—' : fmtDuracao(stats.tempoMedioResolucao)}
          </p>
          <p className="text-[10px] text-ink-subtle mt-0.5">
            {stats.concluidos > 0 ? `${stats.concluidos} concluído${stats.concluidos !== 1 ? 's' : ''}` : 'nada concluído ainda'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <Input
            placeholder={aba === 'professor' ? 'Buscar por professor, aluno ou descrição…' : 'Buscar por referência ou descrição…'}
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
          <SelectTrigger className="h-9 w-[150px] text-[12px] bg-surface-canvas border-line text-ink">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface-canvas border-line text-ink">
            <SelectItem value="todas">Todas as urgências</SelectItem>
            <SelectItem value="Baixa">Baixa</SelectItem>
            <SelectItem value="Média">Média</SelectItem>
            <SelectItem value="Alta">Alta</SelectItem>
            <SelectItem value="Crítico">Crítico</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 bg-surface-subtle rounded-full p-1">
          {FILTROS_STATUS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatus(value)}
              className={cn(
                'btn-press px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
                status === value ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOrdem(o => (o === 'novo' ? 'antigo' : 'novo'))}
          className="btn-press flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium text-ink-secondary bg-surface-subtle hover:text-ink transition-colors"
          title="Alternar ordenação"
        >
          {ordem === 'novo' ? <ArrowDownNarrowWide className="h-3.5 w-3.5" /> : <ArrowUpNarrowWide className="h-3.5 w-3.5" />}
          {ordem === 'novo' ? 'Mais recentes' : 'Mais antigos'}
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
          <p className="text-[13px] text-ink-muted">Nenhum incidente encontrado.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtrados.map(i => {
            const st = statusChamado(i)
            const meta = STATUS_META[st]
            const isInforme = naturezaDe(i) === 'informe'
            const isPlataforma = abaDoIncidente(i) === 'plataforma'
            const urgenciaAlta = i.urgency === 'Alta' || i.urgency === 'Crítico'
            return (
            <div
              key={i.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetalheClick(i)}
              onKeyDown={e => { if (e.key === 'Enter') setDetalheClick(i) }}
              className={cn(
                'flex gap-2.5 rounded-lg border border-line bg-surface-canvas px-3 py-2.5 items-start transition-colors hover:bg-surface-subtle/40 cursor-pointer',
                i.urgency === 'Crítico' && 'ring-1 ring-urg-critFg/30',
              )}
            >
              <div className={cn(
                'w-[3px] self-stretch rounded-full flex-shrink-0',
                URG_BAR[i.urgency] ?? 'bg-ink-subtle',
                i.urgency === 'Crítico' && 'animate-pulse',
              )} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-medium', meta.chip)}>
                    {meta.label}
                  </span>
                  {isInforme && (
                    <span className="inline-flex items-center rounded-full bg-surface-muted text-ink-muted px-1.5 py-0.5 text-[10.5px] font-medium">
                      Informe
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
                  {i.aluno_nome && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accentBlue-soft/60 text-accentBlue px-1.5 py-0.5 text-[10.5px] font-medium">
                      <GraduationCap className="h-3 w-3" />{i.aluno_nome}
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-full bg-surface-subtle text-ink-secondary px-1.5 py-0.5 text-[10.5px] font-medium">
                    {i.problem_type}
                  </span>
                </div>
                <p className="text-[12.5px] text-ink-secondary mt-1 truncate" title={i.description}>{i.description}</p>
                <p className="text-[10.5px] text-ink-muted mt-1">
                  {i.coordinator} · {tempoRelativo(i.created_at)}
                  {i.responsavel_nome && (
                    <span> · resp. {i.responsavel_nome}</span>
                  )}
                  {st === 'em_andamento' && i.assumido_por_nome && (
                    <span className="text-accentBlue"> · sendo resolvido por {i.assumido_por_nome}</span>
                  )}
                  {st === 'concluido' && (() => {
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
                      urgenciaChip[i.urgency] ?? 'bg-surface-subtle text-ink-secondary',
                    )}>
                      {urgenciaAlta && <AlertTriangle className="h-3 w-3" />}
                      {i.urgency}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent onClick={e => e.stopPropagation()}>
                    {URGENCIA_EXPLICACAO[i.urgency] ?? 'Nível de urgência do chamado.'}
                  </TooltipContent>
                </Tooltip>
                {podeEditar && (
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    {isPlataforma && (
                      <button
                        onClick={() => atualizarTiStatus.mutate(
                          { id: i.id, ti_status: (i.ti_status === 'em_analise_ti' ? 'chamado_aberto' : 'em_analise_ti') as TiStatus },
                          { onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao atualizar estado do TI.') },
                        )}
                        className="btn-press flex items-center gap-1 px-3 py-1.5 text-[11.5px] font-medium rounded-lg bg-accentBlue-soft text-accentBlue hover:opacity-80 transition-opacity"
                        title="Alternar estado junto ao TI"
                      >
                        <ScanSearch className="h-3.5 w-3.5" />
                        {i.ti_status === 'em_analise_ti' ? 'Em análise' : 'Chamado aberto'}
                      </button>
                    )}
                    {!isInforme && st === 'aberto' && (
                      <button
                        onClick={() => assumir.mutate(
                          { id: i.id, professor_id: i.professor_id },
                          { onSuccess: () => toast.success('Você assumiu este chamado.'), onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao assumir.') },
                        )}
                        className="btn-press flex items-center gap-1 px-3 py-1.5 text-[11.5px] font-medium rounded-lg bg-accentBlue-soft text-accentBlue hover:opacity-80 transition-opacity"
                      >
                        <Hand className="h-3.5 w-3.5" />Assumir
                      </button>
                    )}
                    {!isInforme && st === 'em_andamento' && (
                      <button
                        onClick={() => largar.mutate(
                          { id: i.id, professor_id: i.professor_id },
                          { onSuccess: () => toast.success('Chamado devolvido para "em aberto".'), onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao largar.') },
                        )}
                        className="btn-press flex items-center gap-1 px-3 py-1.5 text-[11.5px] font-medium rounded-lg bg-surface-subtle text-ink-secondary hover:text-ink transition-colors"
                        title="Devolver para em aberto"
                      >
                        <Undo2 className="h-3.5 w-3.5" />Largar
                      </button>
                    )}
                    {!isInforme && (st === 'concluido' ? (
                      <button
                        onClick={() => reabrir.mutate(
                          { id: i.id, professor_id: i.professor_id },
                          { onSuccess: () => toast.success('Chamado reaberto.'), onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao reabrir.') },
                        )}
                        className="btn-press px-3 py-1.5 text-[11.5px] font-medium rounded-lg bg-urg-medBg text-urg-medFg hover:opacity-80 transition-opacity"
                      >
                        Reabrir
                      </button>
                    ) : (
                      <button
                        onClick={() => setResolverAlvo(i)}
                        className="btn-press px-3 py-1.5 text-[11.5px] font-medium rounded-lg bg-urg-lowBg text-urg-lowFg hover:opacity-80 transition-opacity"
                      >
                        Concluir
                      </button>
                    ))}
                    <button
                      onClick={() => setEditarAlvo(i)}
                      aria-label="Editar chamado"
                      title="Editar"
                      className="btn-press p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-surface-subtle transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setExcluirAlvo(i)}
                      aria-label="Excluir incidente"
                      className="btn-press p-1.5 rounded-lg text-ink-subtle hover:text-urg-highFg hover:bg-urg-highBg transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}

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
