import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { Copy, Check, Search, CheckCircle2, ArrowUpDown } from 'lucide-react'
import {
  useSilencioFila, useRegistrarMensagemPendencia, useSilencioSnapshotGeral,
  SILENCIO_LIMIARES, statusChip, flagPorStatus,
  type SilencioEpisodio, type SilencioStatus,
} from '@/hooks/useSilencio'
import { ESTAGIOS, ORDEM_ESTAGIOS, mensagemPendencia } from '@/lib/pendenciasMensagens'
import { useGrupos } from '@/hooks/useGrupos'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { cn } from '@/lib/utils'

type Aba = 'todos' | SilencioStatus
type Ordem = 'dias' | 'pendencias' | 'alunos' | 'nome'

const TODOS = 'todos'

const ORDENS: { value: Ordem; label: string }[] = [
  { value: 'dias',       label: 'Mais dias parado' },
  { value: 'pendencias', label: 'Mais pendências' },
  { value: 'alunos',     label: 'Mais alunos' },
  { value: 'nome',       label: 'Nome (A–Z)' },
]

// Cor do "dias" por estágio — comunica gravidade sem precisar de mais uma coluna.
const diasCls: Record<SilencioStatus, string> = {
  alerta:      'text-urg-medFg',
  aviso_saida: 'text-urg-highFg',
  reuniao:     'text-urg-highFg',
}

const pendente = (ep: SilencioEpisodio) => !ep[flagPorStatus[ep.status]]

function semanaLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function SilencioPage() {
  const { profile } = useAuth()
  const podeAgir = canEdit(profile)
  const { data: fila = [], isLoading } = useSilencioFila()
  const { data: serieGeral = [] } = useSilencioSnapshotGeral()
  const { data: grupos = [] } = useGrupos()

  const [aba, setAba]                         = useState<Aba>('todos')
  const [busca, setBusca]                     = useState('')
  const [grupoFiltro, setGrupoFiltro]         = useState<string>(TODOS)
  const [ordem, setOrdem]                     = useState<Ordem>('dias')
  const [mostrarContatados, setMostrarContatados] = useState(false)

  // Base respeitando a coordenação — as contagens das abas seguem esse recorte.
  const baseGrupo = useMemo(
    () => grupoFiltro === TODOS ? fila : fila.filter(ep => ep.grupo_id === grupoFiltro),
    [fila, grupoFiltro],
  )

  const contagem = useMemo(() => {
    const c: Record<Aba, number> = { todos: 0, alerta: 0, aviso_saida: 0, reuniao: 0 }
    for (const ep of baseGrupo) if (pendente(ep)) { c[ep.status]++; c.todos++ }
    return c
  }, [baseGrupo])

  const lista = useMemo(() => {
    let arr = aba === TODOS ? baseGrupo : baseGrupo.filter(ep => ep.status === aba)
    if (!mostrarContatados) arr = arr.filter(pendente)
    const termo = busca.trim().toLowerCase()
    if (termo) arr = arr.filter(ep => ep.nome.toLowerCase().includes(termo))
    return [...arr].sort((a, b) => {
      switch (ordem) {
        case 'nome':       return a.nome.localeCompare(b.nome)
        case 'pendencias': return b.aulas_pendentes - a.aulas_pendentes
        case 'alunos':     return (b.qtd_alunos ?? 0) - (a.qtd_alunos ?? 0)
        default:           return b.dias_pendente - a.dias_pendente
      }
    })
  }, [baseGrupo, aba, mostrarContatados, busca, ordem])

  const chartData = serieGeral.map(s => ({ label: semanaLabel(s.semana), pendencias: s.total_pendencias }))

  const abas: { id: Aba; label: string; n?: number }[] = [
    { id: 'todos', label: 'Todos' },
    ...ORDEM_ESTAGIOS.map(s => ({ id: s as Aba, label: `${ESTAGIOS[s].n}. ${ESTAGIOS[s].titulo}` })),
  ]

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Controle de pendências</h1>
          <p className="text-[13px] text-ink-muted">
            <span className="tabular-nums text-ink-secondary font-medium">{fila.length}</span> professores com pendências
            {' · '}
            <span className="tabular-nums text-ink-secondary font-medium">{contagem.todos}</span> aguardando contato
          </p>
        </div>
      </header>

      {/* ── Controles: abas (estágios) + filtros práticos ── */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-1 bg-surface-subtle rounded-full p-1 w-fit">
          {abas.map(a => {
            const n = contagem[a.id]
            const ativa = aba === a.id
            return (
              <button
                key={a.id}
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
                  {n}
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
                          : 'Tudo em dia neste estágio. Ative "Incluir já contatados" para ver o histórico.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              lista.map(ep => (
                <FilaRow key={ep.professor_id} ep={ep} podeAgir={podeAgir} contatado={!pendente(ep)} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Gráfico (contexto, secundário) ── */}
      <div className="card-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="label-micro">Pendências por semana (todos os professores)</h2>
          {chartData.length <= 1 && (
            <span className="text-[11px] text-ink-subtle">os pontos acumulam a cada semana</span>
          )}
        </div>
        {chartData.length === 0 ? (
          <p className="text-[12px] text-ink-muted py-6 text-center">Ainda sem dados de snapshot.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="pendencias" stroke="var(--accent-blue)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="text-[11px] text-ink-subtle leading-relaxed">
          Processo gradativo: cada professor aparece só no estágio atual dele. Vale para ativos e em pausa.
          O sinal do KMS só marca pendência após ~1 semana, então ninguém aparece com menos de {SILENCIO_LIMIARES.alerta} dias.
        </p>
      </div>
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

function FilaRow({ ep, podeAgir, contatado }: { ep: SilencioEpisodio; podeAgir: boolean; contatado: boolean }) {
  const registrar = useRegistrarMensagemPendencia()
  const [copiado, setCopiado] = useState(false)

  const mensagem = mensagemPendencia(ep.status, ep.nome, ep.aulas_pendentes)

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
      await registrar.mutateAsync({ professorId: ep.professor_id, estagio: ep.status, texto: mensagem })
      toast.success(`${ep.nome}: ${ESTAGIOS[ep.status].n}ª mensagem registrada.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar mensagem.')
    }
  }

  return (
    <tr className={cn(
      'border-b border-line-soft last:border-0 transition-colors',
      contatado ? 'opacity-60 hover:opacity-100' : 'hover:bg-surface-subtle/50',
    )}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/professores/${ep.professor_id}`} className="text-ink font-medium hover:text-accentBlue hover:underline">
            {ep.nome}
          </Link>
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', statusChip[ep.status])}>
            {ESTAGIOS[ep.status].titulo}
          </span>
          {ep.professor_status === 'pausa' && (
            <span className="inline-flex items-center rounded-full bg-surface-subtle text-ink-muted px-2 py-0.5 text-[10.5px] font-medium">
              em pausa
            </span>
          )}
          {contatado && (
            <span className="inline-flex items-center gap-1 rounded-full bg-urg-lowBg text-urg-lowFg px-2 py-0.5 text-[10.5px] font-medium">
              <Check className="h-3 w-3" /> contatado
            </span>
          )}
        </div>
        {(ep.grupo_nome || ep.coordenador_nome) && (
          <div className="text-[11px] text-ink-muted mt-0.5">
            {ep.grupo_nome}{ep.grupo_nome && ep.coordenador_nome ? ' · ' : ''}{ep.coordenador_nome}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-center tabular-nums text-ink">{ep.qtd_alunos ?? '—'}</td>
      <td className="px-4 py-2.5 text-center tabular-nums text-ink font-medium">{ep.aulas_pendentes}</td>
      <td className="px-4 py-2.5 text-center">
        <span className={cn('tabular-nums font-semibold', diasCls[ep.status])}>{ep.dias_pendente}</span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handleCopiar}
            className="btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-medium rounded-md bg-surface-subtle text-ink-secondary hover:text-ink transition-colors"
          >
            {copiado ? <Check className="h-3.5 w-3.5 text-urg-lowFg" /> : <Copy className="h-3.5 w-3.5" />}
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
          {podeAgir && !contatado && (
            <button
              onClick={handleMarcar}
              disabled={registrar.isPending}
              className="btn-press px-3 py-1.5 text-[11.5px] font-medium rounded-md bg-urg-lowBg text-urg-lowFg hover:opacity-80 transition-opacity disabled:opacity-50 whitespace-nowrap"
            >
              {registrar.isPending ? 'Salvando…' : ESTAGIOS[ep.status].botao}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
