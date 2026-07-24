import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  Copy, Check, Search, CheckCircle2, ArrowUpDown, AlertTriangle,
  RefreshCw, Unlock, Lock, ClipboardList, ShieldAlert, History,
} from 'lucide-react'
import {
  usePendenciasFila, useRegistrarMensagem, useLiberarAgenda,
  usePendenciaLogs, usePendenciaSnapshots, usePendenciaHistorico, usePendenciaAuditoria,
  type PendenciaFila, type EstagioNum,
} from '@/hooks/usePendencias'
import {
  ESTAGIO, ORDEM_ESTAGIOS, mensagemDoEstagio, severidadeLabel,
  TIPO_PENDENCIA, tipoEventoLabel,
} from '@/lib/centralPendencias'
import { useGrupos } from '@/hooks/useGrupos'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { cn } from '@/lib/utils'

type Aba = 'todos' | EstagioNum
type Ordem = 'dias' | 'pendencias' | 'alunos' | 'nome'

const TODOS = 'todos'

const ORDENS: { value: Ordem; label: string }[] = [
  { value: 'dias',       label: 'Mais dias parado' },
  { value: 'pendencias', label: 'Mais pendências' },
  { value: 'alunos',     label: 'Mais alunos' },
  { value: 'nome',       label: 'Nome (A–Z)' },
]

/** Já foi registrada a mensagem do estágio ATUAL do professor? */
const jaContatado = (ep: PendenciaFila) =>
  ep.ultimaMensagemEm != null && ep.ultimaMensagemEstagio === ep.estagio

function fmtData(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
}
function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}
function semanaLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const zeroContagem = (): Record<Aba, number> => ({ todos: 0, 1: 0, 2: 0, 3: 0 })

export function CentralPendenciasPage() {
  const { profile } = useAuth()
  const podeAgir = canEdit(profile)
  const { data: fila = [], isLoading, isFetching, refetch } = usePendenciasFila()
  const { data: grupos = [] } = useGrupos()

  const [aba, setAba]                             = useState<Aba>(TODOS)
  const [busca, setBusca]                         = useState('')
  const [grupoFiltro, setGrupoFiltro]             = useState<string>(TODOS)
  const [ordem, setOrdem]                         = useState<Ordem>('dias')
  const [mostrarContatados, setMostrarContatados] = useState(false)
  const [sel, setSel]                             = useState<PendenciaFila | null>(null)

  // Base respeitando a coordenação escolhida — todas as contagens seguem esse recorte.
  const baseGrupo = useMemo(
    () => grupoFiltro === TODOS ? fila : fila.filter(ep => ep.grupo_id === grupoFiltro),
    [fila, grupoFiltro],
  )

  // KPIs (guia §5.2) — sobre o recorte atual.
  const kpis = useMemo(() => ({
    total: baseGrupo.length,
    bloqueados: baseGrupo.filter(ep => ep.agendaBloqueada).length,
    reuniao: baseGrupo.filter(ep => ep.estagio === 3).length,
  }), [baseGrupo])

  const contagem = useMemo(() => {
    const c = zeroContagem()
    for (const ep of baseGrupo) if (!jaContatado(ep)) { c[ep.estagio]++; c.todos++ }
    return c
  }, [baseGrupo])

  const lista = useMemo(() => {
    let arr = aba === TODOS ? baseGrupo : baseGrupo.filter(ep => ep.estagio === aba)
    if (!mostrarContatados) arr = arr.filter(ep => !jaContatado(ep))
    const termo = busca.trim().toLowerCase()
    if (termo) arr = arr.filter(ep => ep.nome.toLowerCase().includes(termo))
    return [...arr].sort((a, b) => {
      switch (ordem) {
        case 'nome':       return a.nome.localeCompare(b.nome)
        case 'pendencias': return b.aulasPendentes - a.aulasPendentes
        case 'alunos':     return (b.qtdAlunos ?? 0) - (a.qtdAlunos ?? 0)
        default:           return b.dias - a.dias
      }
    })
  }, [baseGrupo, aba, mostrarContatados, busca, ordem])

  const abas: { id: Aba; label: string }[] = [
    { id: TODOS, label: 'Todos' },
    ...ORDEM_ESTAGIOS.map(n => ({ id: n as Aba, label: `${n}. ${ESTAGIO[n].titulo}` })),
  ]

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Central de Pendências</h1>
          <p className="text-[13px] text-ink-muted">
            <span className="tabular-nums text-ink-secondary font-medium">{kpis.total}</span> professores com pendências
            {' · '}
            <span className="tabular-nums text-ink-secondary font-medium">{kpis.bloqueados}</span> com agenda bloqueada
            {kpis.reuniao > 0 && (
              <>
                {' · '}
                <span className="inline-flex items-center gap-1 text-urg-highFg font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{kpis.reuniao}</span> em reunião
                </span>
              </>
            )}
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-press inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-canvas px-3 py-1.5 text-[12.5px] font-medium text-ink-secondary hover:text-ink transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Atualizar
        </button>
      </header>

      {/* ── Controles: abas (estágios) + filtros ── */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-1 bg-surface-subtle rounded-full p-1 w-fit">
          {abas.map(a => {
            const ativa = aba === a.id
            return (
              <button
                key={String(a.id)}
                onClick={() => setAba(a.id)}
                className={cn(
                  'btn-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors',
                  ativa ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
                )}
              >
                {a.label}
                <span className={cn(
                  'tabular-nums text-[11px] rounded-full px-1.5 py-px',
                  ativa ? 'bg-accentBlue-soft text-accentBlue' : 'bg-surface-canvas text-ink-muted',
                )}>
                  {contagem[a.id]}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
            <Input
              placeholder="Buscar professor…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9 h-9 bg-surface-canvas border-line"
            />
          </div>

          <Select value={grupoFiltro} onValueChange={setGrupoFiltro}>
            <SelectTrigger className="h-9 w-[168px] bg-surface-canvas border-line text-[13px]">
              <SelectValue placeholder="Coordenação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas as coordenações</SelectItem>
              {grupos.map(g => (
                <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={ordem} onValueChange={v => setOrdem(v as Ordem)}>
            <SelectTrigger className="h-9 w-[168px] bg-surface-canvas border-line text-[13px]">
              <ArrowUpDown className="h-3.5 w-3.5 text-ink-muted" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDENS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Meta + toggle de já-contatados ── */}
      <div className="flex items-center justify-between -mt-1">
        <p className="text-[12px] text-ink-muted tabular-nums">
          {lista.length} {lista.length === 1 ? 'professor' : 'professores'}
          {busca && ' encontrado(s)'}
        </p>
        <button
          onClick={() => setMostrarContatados(v => !v)}
          className={cn(
            'btn-press inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors border',
            mostrarContatados
              ? 'bg-accentBlue-soft text-accentBlue border-transparent'
              : 'bg-surface-canvas text-ink-secondary border-line hover:text-ink',
          )}
        >
          <Check className={cn('h-3.5 w-3.5', mostrarContatados ? 'opacity-100' : 'opacity-40')} />
          Incluir já contatados
        </button>
      </div>

      {/* ── Tabela (ação principal) ── */}
      <div className="card-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-ink-muted uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Professor</th>
                <th className="px-4 py-2.5 font-medium text-center">Alunos</th>
                <th className="px-4 py-2.5 font-medium text-center">Pendências</th>
                <th className="px-4 py-2.5 font-medium text-center">Dias sem lançar</th>
                <th className="px-4 py-2.5 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRows />
              ) : lista.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                      <CheckCircle2 className="h-7 w-7 text-urg-lowFg" />
                      <p className="text-[13px] text-ink-secondary font-medium">
                        {busca ? 'Nenhum professor encontrado.' : 'Ninguém aguardando contato aqui.'}
                      </p>
                      <p className="text-[12px] text-ink-muted max-w-xs">
                        {busca
                          ? 'Ajuste a busca ou troque a coordenação.'
                          : mostrarContatados
                            ? 'Não há professores neste filtro.'
                            : 'Tudo em dia neste estágio. Ative "Incluir já contatados" para ver quem já recebeu a mensagem.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                lista.map(ep => (
                  <FilaRow
                    key={ep.id_Professor}
                    ep={ep}
                    podeAgir={podeAgir}
                    onDetalhe={() => setSel(ep)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-ink-subtle leading-relaxed">
        Régua oficial do King: <strong>2 dias</strong> = Lembrete · <strong>3–4 dias</strong> = Bloqueio da agenda ·
        <strong> 5+ dias</strong> = Reunião (risco de encerramento; só a coordenação libera). O motor roda ~1×/dia —
        use <em>Atualizar</em> para recarregar. Liberar a agenda registra a decisão, mas se houver bloqueio por outro
        motivo (ex.: desligamento) ele permanece.
      </p>

      {sel && <DetalheDialog ep={sel} onClose={() => setSel(null)} />}
    </div>
  )
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-line-soft last:border-0">
          <td className="px-4 py-3"><div className="h-4 w-44 rounded bg-surface-subtle animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-4 w-6 mx-auto rounded bg-surface-subtle animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-4 w-6 mx-auto rounded bg-surface-subtle animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-4 w-6 mx-auto rounded bg-surface-subtle animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-7 w-40 ml-auto rounded bg-surface-subtle animate-pulse" /></td>
        </tr>
      ))}
    </>
  )
}

function FilaRow({ ep, podeAgir, onDetalhe }: {
  ep: PendenciaFila; podeAgir: boolean; onDetalhe: () => void
}) {
  const registrar = useRegistrarMensagem()
  const liberar   = useLiberarAgenda()
  const [copiado, setCopiado] = useState(false)
  const [confirmLiberar, setConfirmLiberar] = useState(false)

  const contatado = jaContatado(ep)
  const nx = severidadeLabel(ep.severidadeNx)
  const mensagem = mensagemDoEstagio(ep.estagio, ep.nome, ep.aulasPendentes)

  async function handleCopiar() {
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
      toast.success('Mensagem copiada.')
    } catch {
      toast.error('Não consegui copiar. Copie manualmente.')
    }
  }

  async function handleMarcar() {
    try {
      await registrar.mutateAsync({ id_Professor: ep.id_Professor, estagio: ep.estagio, texto: mensagem })
      toast.success(`${ep.nome}: ${ESTAGIO[ep.estagio].n}ª mensagem registrada.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar mensagem.')
    }
  }

  async function handleLiberar() {
    if (!confirmLiberar) {
      setConfirmLiberar(true)
      setTimeout(() => setConfirmLiberar(false), 4000)
      return
    }
    setConfirmLiberar(false)
    try {
      await liberar.mutateAsync({ id_Professor: ep.id_Professor })
      toast.success('Agenda liberada.', {
        description: 'Registrado. Se houver bloqueio por outro motivo, ele permanece.',
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao liberar agenda.')
    }
  }

  return (
    <tr className={cn(
      'border-b border-line-soft last:border-0 transition-colors',
      contatado ? 'opacity-60 hover:opacity-100' : 'hover:bg-surface-subtle/50',
    )}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {ep.professor_uuid ? (
            <Link to={`/professores/${ep.professor_uuid}`} className="text-ink font-medium hover:text-accentBlue hover:underline">
              {ep.nome}
            </Link>
          ) : (
            <span className="text-ink font-medium">{ep.nome}</span>
          )}
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', ESTAGIO[ep.estagio].chip)}>
            {ESTAGIO[ep.estagio].titulo}
          </span>
          {ep.professor_status === 'pausa' && (
            <span className="inline-flex items-center rounded-full bg-surface-subtle text-ink-muted px-2 py-0.5 text-[10.5px] font-medium">
              em pausa
            </span>
          )}
          {ep.agendaBloqueada && (
            <span className="inline-flex items-center gap-1 rounded-full bg-urg-highBg text-urg-highFg px-2 py-0.5 text-[10.5px] font-medium">
              <Lock className="h-3 w-3" /> agenda bloqueada
            </span>
          )}
          {ep.regularizado && (
            <span className="inline-flex items-center gap-1 rounded-full bg-urg-lowBg text-urg-lowFg px-2 py-0.5 text-[10.5px] font-medium">
              regularizou · aguardando liberação
            </span>
          )}
          {ep.estagio === 3 && !ep.regularizado && (
            <span
              title="5+ dias sem lançar — risco de encerramento."
              className="inline-flex items-center gap-1 rounded-full bg-urg-highBg text-urg-highFg px-2 py-0.5 text-[10.5px] font-medium"
            >
              <AlertTriangle className="h-3 w-3" /> risco de encerramento
            </span>
          )}
          {contatado && (
            <span className="inline-flex items-center gap-1 rounded-full bg-urg-lowBg text-urg-lowFg px-2 py-0.5 text-[10.5px] font-medium">
              <Check className="h-3 w-3" /> contatado
            </span>
          )}
        </div>
        <div className="text-[11px] text-ink-muted mt-0.5">
          {ep.grupo_nome && <span>{ep.grupo_nome}{ep.coordenador_nome ? ' · ' : ''}{ep.coordenador_nome}</span>}
          {ep.grupo_nome && ' — '}
          {ep.ultimaMensagemEm
            ? `última msg: ${fmtData(ep.ultimaMensagemEm)}${ep.ultimaMensagemEstagio ? ` (${ESTAGIO[ep.ultimaMensagemEstagio].n}ª)` : ''}`
            : 'nenhuma mensagem registrada'}
        </div>
      </td>
      <td className="px-4 py-2.5 text-center tabular-nums text-ink">{ep.qtdAlunos ?? '—'}</td>
      <td className="px-4 py-2.5 text-center tabular-nums text-ink font-medium">
        {ep.aulasPendentes}
        {nx && <span className="ml-1 text-[11px] text-ink-muted">({nx})</span>}
      </td>
      <td className="px-4 py-2.5 text-center">
        <span className={cn('tabular-nums font-semibold', ESTAGIO[ep.estagio].dias)}>{ep.dias}</span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onDetalhe}
            className="btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-medium rounded-md bg-surface-subtle text-ink-secondary hover:text-ink transition-colors"
          >
            <ClipboardList className="h-3.5 w-3.5" /> Detalhes
          </button>
          <button
            onClick={handleCopiar}
            className="btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-medium rounded-md bg-surface-subtle text-ink-secondary hover:text-ink transition-colors"
          >
            {copiado ? <Check className="h-3.5 w-3.5 text-urg-lowFg" /> : <Copy className="h-3.5 w-3.5" />}
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
          {podeAgir && ep.estagio === 3 && (
            <button
              onClick={handleLiberar}
              disabled={liberar.isPending}
              className={cn(
                'btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-medium rounded-md transition-colors disabled:opacity-50 whitespace-nowrap',
                confirmLiberar
                  ? 'bg-urg-highBg text-urg-highFg'
                  : 'bg-surface-subtle text-ink-secondary hover:text-ink',
              )}
            >
              <Unlock className="h-3.5 w-3.5" />
              {liberar.isPending ? 'Liberando…' : confirmLiberar ? 'Confirmar liberação' : 'Liberar agenda'}
            </button>
          )}
          {podeAgir && !contatado && (
            <button
              onClick={handleMarcar}
              disabled={registrar.isPending}
              className="btn-press px-3 py-1.5 text-[11.5px] font-medium rounded-md bg-urg-lowBg text-urg-lowFg hover:opacity-80 transition-opacity disabled:opacity-50 whitespace-nowrap"
            >
              {registrar.isPending ? 'Salvando…' : ESTAGIO[ep.estagio].botao}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Detalhe do professor (drawer): série + trilha de mensagens + episódios + auditoria ───

function DetalheDialog({ ep, onClose }: { ep: PendenciaFila; onClose: () => void }) {
  const [verAuditoria, setVerAuditoria] = useState(false)
  const { data: logs = [],  isLoading: loadingLogs } = usePendenciaLogs(ep.id_Professor)
  const { data: snaps = [] }                          = usePendenciaSnapshots(ep.id_Professor)
  const { data: hist = [], isLoading: loadingHist }   = usePendenciaHistorico(ep.id_Professor)
  const { data: audit = [], isFetching: loadingAudit } = usePendenciaAuditoria(ep.id_Professor, verAuditoria)

  const chartData = snaps.map(s => ({ label: semanaLabel(s.semana), pendencias: s.qtdPendencias }))

  // Recorrência: episódios anteriores (Historico, já encerrados) + o atual (Fila).
  // estagioFinal é o pico do episódio, então "passou pela etapa N" = pico >= N.
  const estagiosEp = [...hist.map(h => h.estagioFinal), ep.estagio]
  const totalPassagens = estagiosEp.length
  const passouPelaEtapa = (n: number) => estagiosEp.filter(s => s >= n).length

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            {ep.nome}
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', ESTAGIO[ep.estagio].chip)}>
              {ESTAGIO[ep.estagio].titulo}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Resumo */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-secondary">
          <span><span className="text-ink-muted">Dias sem lançar:</span> <strong className="tabular-nums">{ep.dias}</strong> (pico {ep.diasPico})</span>
          <span><span className="text-ink-muted">Pendências:</span> <strong className="tabular-nums">{ep.aulasPendentes}</strong></span>
          <span><span className="text-ink-muted">Alunos:</span> <strong className="tabular-nums">{ep.qtdAlunos ?? '—'}</strong></span>
          {severidadeLabel(ep.severidadeNx) && (
            <span><span className="text-ink-muted">Gravidade:</span> <strong>{severidadeLabel(ep.severidadeNx)}</strong></span>
          )}
          <span><span className="text-ink-muted">Aberto em:</span> {fmtData(ep.abertoEm)}</span>
        </div>

        {/* Recorrência — quantas vezes passou e em que etapa */}
        {loadingHist ? (
          <div className="rounded-lg bg-surface-subtle/60 px-3 py-2 text-[12px] text-ink-muted">Carregando recorrência…</div>
        ) : (
          <div className="rounded-lg bg-surface-subtle/60 px-3 py-2 space-y-1.5">
            <p className="text-[12px] text-ink-secondary">
              Passou <strong className="tabular-nums">{totalPassagens}×</strong> pela Central de Pendências
              {hist.length > 0 && (
                <span className="text-ink-muted"> · {hist.length} encerrado{hist.length > 1 ? 's' : ''} + o atual</span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ORDEM_ESTAGIOS.map(n => (
                <span key={n} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium', ESTAGIO[n].chip)}>
                  {ESTAGIO[n].titulo}: {passouPelaEtapa(n)}×
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Gráfico semanal */}
        {chartData.length > 0 && (
          <div className="pt-1">
            <p className="label-micro mb-2">Pendências por semana</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="pendencias" stroke="var(--accent-blue)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Trilha de mensagens (o informe) */}
        <div className="pt-1">
          <p className="label-micro mb-1.5">Mensagens enviadas</p>
          {loadingLogs ? (
            <p className="text-[12px] text-ink-muted">Carregando…</p>
          ) : logs.length === 0 ? (
            <p className="text-[12px] text-ink-muted">Nenhuma mensagem registrada.</p>
          ) : (
            <ul className="space-y-1">
              {logs.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-[12px] border-b border-line-soft last:border-0 pb-1">
                  <span className="text-ink-secondary">
                    {ESTAGIO[m.estagio]?.titulo ?? `Estágio ${m.estagio}`}
                    {m.enviadoPorNome && <span className="text-ink-muted"> · {m.enviadoPorNome}</span>}
                  </span>
                  <span className="text-ink-muted tabular-nums whitespace-nowrap">{fmtDataHora(m.enviadoEm)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Episódios anteriores */}
        {hist.length > 0 && (
          <div className="pt-1">
            <p className="label-micro mb-1.5">Episódios resolvidos</p>
            <ul className="space-y-1">
              {hist.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-[12px] border-b border-line-soft last:border-0 pb-1">
                  <span className="text-ink-secondary">{fmtData(h.abertoEm)} → {fmtData(h.resolvidoEm)}</span>
                  <span className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-urg-highBg text-urg-highFg px-2 py-0.5 text-[10.5px] font-medium tabular-nums">
                      pico {h.diasPico}d
                    </span>
                    <span className="text-ink-muted">{ESTAGIO[h.estagioFinal]?.titulo ?? `Estágio ${h.estagioFinal}`}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Auditoria forense (sob demanda) */}
        <div className="pt-1">
          <div className="flex items-center justify-between">
            <p className="label-micro">Auditoria do bloqueio</p>
            {!verAuditoria && (
              <button
                onClick={() => setVerAuditoria(true)}
                className="btn-press inline-flex items-center gap-1.5 rounded-md bg-surface-subtle px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary hover:text-ink transition-colors"
              >
                <ShieldAlert className="h-3.5 w-3.5" /> Ver auditoria
              </button>
            )}
          </div>

          {verAuditoria && (
            loadingAudit ? (
              <p className="text-[12px] text-ink-muted mt-2">Carregando auditoria…</p>
            ) : audit.length === 0 ? (
              <p className="text-[12px] text-ink-muted mt-2">Sem eventos de bloqueio/desbloqueio registrados.</p>
            ) : (
              <div className="space-y-3 mt-2">
                {audit.map((ev, i) => (
                  <div key={i} className="rounded-lg border border-line-soft p-2.5">
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                        {ev.tipoEvento === 1 ? <Lock className="h-3.5 w-3.5 text-urg-highFg" /> : <Unlock className="h-3.5 w-3.5 text-urg-lowFg" />}
                        {tipoEventoLabel(ev.tipoEvento)}
                      </span>
                      <span className="text-ink-muted tabular-nums">{fmtDataHora(ev.ocorridoEm)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-ink-muted mt-1">
                      <span>{ESTAGIO[ev.estagio]?.titulo ?? `Estágio ${ev.estagio}`}</span>
                      <span>{ev.diasPendente} dias</span>
                      <span>{ev.aulasPendentes} pendências</span>
                      {ev.dataMaisAntiga && <span>mais antiga: {fmtData(ev.dataMaisAntiga)}</span>}
                    </div>
                    {ev.pendencias.length > 0 && (
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-[11.5px]">
                          <thead>
                            <tr className="text-left text-ink-muted">
                              <th className="py-1 pr-3 font-medium">Aluno</th>
                              <th className="py-1 pr-3 font-medium">Turma</th>
                              <th className="py-1 pr-3 font-medium">Data</th>
                              <th className="py-1 font-medium">Tipo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ev.pendencias.map((p, j) => (
                              <tr key={j} className="border-t border-line-soft">
                                <td className="py-1 pr-3 tabular-nums">#{p.id_Aluno}</td>
                                <td className="py-1 pr-3 tabular-nums">{p.turma_Id ? `#${p.turma_Id}` : '—'}</td>
                                <td className="py-1 pr-3 tabular-nums">{fmtData(p.data_Pendencia)}</td>
                                <td className="py-1">{TIPO_PENDENCIA[p.tipo] ?? p.tipo}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
                <p className="flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
                  <History className="h-3 w-3" />
                  Identificadores (não nomes) — pendências congeladas no momento do bloqueio.
                </p>
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
