import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, Copy, Check, Star, X, Ban, CheckCircle2, ChevronDown, FileText,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePainelProfessores, type PainelProfessor } from '@/hooks/usePainelProfessores'
import { useRegistrarMensagemPendencia, statusChip, useSilencioSnapshotGeral, SILENCIO_LIMIARES } from '@/hooks/useSilencio'
import { useProblemasAbertos, type ProfessorComProblema } from '@/hooks/useObservacoes'
import { ESTAGIOS, mensagemPendencia } from '@/lib/pendenciasMensagens'
import { scoreVisual } from '@/lib/score'
import { SCORE_BUCKETS, bucketFor } from '@/hooks/useDashboardGeral'
import { NIVEIS_ORDEM, nivelInfo, INFORME_JANELA } from '@/lib/prioridade'
import { useFiltrosFavoritos } from '@/hooks/useFiltrosFavoritos'
import { useGrupos } from '@/hooks/useGrupos'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Acompanhamento — painel unificado (fusão de Acompanhamento + Controle de
// Pendências). Centro operacional da coordenação: cards de resumo, filtros,
// Índice de Prioridade, agrupamento, favoritos e as ações de mensagem de
// pendência (copiar / marcar enviada) num só lugar.
// ─────────────────────────────────────────────────────────────────────────────

const RECENTE_DIAS = 14   // "acompanhamento recente" = última mensagem nos últimos N dias
const N_COLUNAS = 9

type QuickId = 'todos' | 'critica' | 'score_baixo' | 'pendencias' | 'bloqueados' | 'acompanhamento' | 'informes'
type OrdenarPor = 'prioridade' | 'score' | 'pendencias' | 'dias' | 'ultimo' | 'nome'
type AgruparPor = 'nenhum' | 'nivel' | 'coordenador' | 'silStatus'

interface Filtros {
  busca: string
  quick: QuickId
  grupoId: string        // 'todos' | grupo id
  nivel: string          // 'todos' | NivelPrioridadeId
  faixaScore: string     // 'todos' | rótulo de bucket
  minPendencias: string  // '0' = qualquer
  minDias: string        // '0' = qualquer
  silStatus: string      // 'todos' | 'sem' | SilencioStatus
  bloqueado: string      // 'todos' | 'sim' | 'nao'
  recente: string        // 'todos' | 'com' | 'sem'
  ordenarPor: OrdenarPor
  ordemDir: 'asc' | 'desc'
  agrupar: AgruparPor
}

const FILTROS_PADRAO: Filtros = {
  busca: '', quick: 'todos', grupoId: 'todos', nivel: 'todos', faixaScore: 'todos',
  minPendencias: '0', minDias: '0', silStatus: 'todos', bloqueado: 'todos', recente: 'todos',
  ordenarPor: 'prioridade', ordemDir: 'desc', agrupar: 'nenhum',
}

const QUICK_PRED: Record<QuickId, (r: PainelProfessor) => boolean> = {
  todos:          () => true,
  critica:        r => r.nivel.id === 'critica',
  score_baixo:    r => r.score_atual != null && r.score_atual < 600,
  pendencias:     r => r.aulas_pendentes_qtd > 0,
  bloqueados:     r => r.elegivel_alocacao === false,
  acompanhamento: r => r.silencio_status != null,
  informes:       r => r.informes_recentes > 0,
}

const MIN_PEND_OPTS = [
  { value: '0', label: 'Qualquer' }, { value: '1', label: '≥ 1' },
  { value: '3', label: '≥ 3' }, { value: '5', label: '≥ 5' }, { value: '10', label: '≥ 10' },
]
const MIN_DIAS_OPTS = [
  { value: '0', label: 'Qualquer' }, { value: '6', label: '≥ 6 dias' },
  { value: '9', label: '≥ 9 dias' }, { value: '12', label: '≥ 12 dias' }, { value: '20', label: '≥ 20 dias' },
]
const SIL_OPTS = [
  { value: 'todos', label: 'Qualquer' }, { value: 'sem', label: 'Sem pendência' },
  { value: 'alerta', label: ESTAGIOS.alerta.titulo },
  { value: 'aviso_saida', label: ESTAGIOS.aviso_saida.titulo },
  { value: 'reuniao', label: ESTAGIOS.reuniao.titulo },
]

const diasCls: Record<string, string> = {
  alerta: 'text-urg-medFg', aviso_saida: 'text-urg-highFg', reuniao: 'text-urg-highFg',
}

function dataCurta(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ─── Filtro + ordenação + agrupamento ─────────────────────────────────────────

function aplicarFiltros(rows: PainelProfessor[], f: Filtros): PainelProfessor[] {
  const termo = f.busca.trim().toLowerCase()
  const minP = Number(f.minPendencias) || 0
  const minD = Number(f.minDias) || 0
  const limiteRecente = Date.now() - RECENTE_DIAS * 86_400_000

  return rows.filter(r => {
    if (!QUICK_PRED[f.quick](r)) return false
    if (termo && !r.nome.toLowerCase().includes(termo)) return false
    if (f.grupoId !== 'todos' && r.grupo_id !== f.grupoId) return false
    if (f.nivel !== 'todos' && r.nivel.id !== f.nivel) return false
    if (f.faixaScore !== 'todos') {
      if (r.score_atual == null || bucketFor(r.score_atual)?.label !== f.faixaScore) return false
    }
    if (r.aulas_pendentes_qtd < minP) return false
    if (r.dias_pendente < minD) return false
    if (f.silStatus !== 'todos') {
      if (f.silStatus === 'sem') { if (r.silencio_status != null) return false }
      else if (r.silencio_status !== f.silStatus) return false
    }
    if (f.bloqueado === 'sim' && r.elegivel_alocacao !== false) return false
    if (f.bloqueado === 'nao' && r.elegivel_alocacao === false) return false
    if (f.recente !== 'todos') {
      const recente = r.ultimo_acompanhamento_em != null &&
        new Date(r.ultimo_acompanhamento_em).getTime() >= limiteRecente
      if (f.recente === 'com' && !recente) return false
      if (f.recente === 'sem' && recente) return false
    }
    return true
  })
}

function valorOrdem(r: PainelProfessor, campo: OrdenarPor): number {
  switch (campo) {
    case 'score':      return r.score_atual ?? -1
    case 'pendencias': return r.aulas_pendentes_qtd
    case 'dias':       return r.dias_pendente
    case 'ultimo':     return r.ultimo_acompanhamento_em ? new Date(r.ultimo_acompanhamento_em).getTime() : 0
    default:           return r.prioridade
  }
}

function ordenar(rows: PainelProfessor[], campo: OrdenarPor, dir: 'asc' | 'desc'): PainelProfessor[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (campo === 'nome') return a.nome.localeCompare(b.nome) * mul
    const diff = valorOrdem(a, campo) - valorOrdem(b, campo)
    return diff !== 0 ? diff * mul : a.nome.localeCompare(b.nome)
  })
}

interface Grupo { chave: string; label: string; ordem: number; rows: PainelProfessor[] }

function construirGrupos(rows: PainelProfessor[], modo: AgruparPor): Grupo[] {
  if (modo === 'nenhum') return [{ chave: '', label: '', ordem: 0, rows }]
  const mapa = new Map<string, Grupo>()
  for (const r of rows) {
    let chave: string, label: string, ordem: number
    if (modo === 'nivel') {
      chave = r.nivel.id; label = r.nivel.label; ordem = 10 - r.nivel.ordem  // crítica primeiro
    } else if (modo === 'coordenador') {
      chave = r.coordenador_nome ?? '—'; label = r.coordenador_nome ?? 'Sem coordenador'; ordem = 0
    } else {
      if (r.silencio_status) { chave = r.silencio_status; label = ESTAGIOS[r.silencio_status].titulo; ordem = ESTAGIOS[r.silencio_status].n }
      else { chave = 'sem'; label = 'Sem pendência'; ordem = 99 }
    }
    const g = mapa.get(chave) ?? { chave, label, ordem, rows: [] }
    g.rows.push(r)
    mapa.set(chave, g)
  }
  return [...mapa.values()].sort((a, b) => a.ordem - b.ordem || a.label.localeCompare(b.label))
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function AcompanhamentoPage() {
  const { profile } = useAuth()
  const podeAgir = canEdit(profile)
  const { data: rows = [], isLoading } = usePainelProfessores()
  const { data: grupos = [] } = useGrupos()
  const { favoritos, adicionar, remover } = useFiltrosFavoritos<Filtros>(profile?.id)

  const [f, setF] = useState<Filtros>(FILTROS_PADRAO)

  const cards = useMemo(() => {
    const totalAulas = rows.reduce((a, r) => a + r.aulas_pendentes_qtd, 0)
    return [
      { id: 'todos'          as QuickId, label: 'Professores',            valor: rows.length,                                                    tone: 'neutral' as const },
      { id: 'critica'        as QuickId, label: 'Prioridade crítica',     valor: rows.filter(QUICK_PRED.critica).length,                          tone: 'high'    as const },
      { id: 'score_baixo'    as QuickId, label: 'Score baixo (<600)',     valor: rows.filter(QUICK_PRED.score_baixo).length,                      tone: 'med'     as const },
      { id: 'pendencias'     as QuickId, label: 'Com pendências',         valor: rows.filter(QUICK_PRED.pendencias).length,                       tone: 'med'     as const },
      { id: undefined,                   label: 'Aulas pendentes (total)', valor: totalAulas,                                                     tone: 'neutral' as const },
      { id: 'bloqueados'     as QuickId, label: 'Bloqueados p/ alunos',   valor: rows.filter(QUICK_PRED.bloqueados).length,                       tone: 'high'    as const },
      { id: 'acompanhamento' as QuickId, label: 'Em acompanhamento',      valor: rows.filter(QUICK_PRED.acompanhamento).length,                   tone: 'neutral' as const },
      { id: 'informes'       as QuickId, label: `Com informes (${INFORME_JANELA}d)`, valor: rows.filter(QUICK_PRED.informes).length,               tone: 'med'     as const },
    ]
  }, [rows])

  const filtrados = useMemo(() => aplicarFiltros(rows, f), [rows, f])
  const ordenados = useMemo(() => ordenar(filtrados, f.ordenarPor, f.ordemDir), [filtrados, f.ordenarPor, f.ordemDir])
  const gruposLista = useMemo(() => construirGrupos(ordenados, f.agrupar), [ordenados, f.agrupar])

  const filtrosAtivos = JSON.stringify(f) !== JSON.stringify(FILTROS_PADRAO)

  function salvarFavorito() {
    const nome = window.prompt('Nome do filtro favorito:')
    if (nome && nome.trim()) {
      adicionar(nome, f)
      toast.success('Filtro salvo.')
    }
  }

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <header className="space-y-0.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Acompanhamento</h1>
        <p className="text-[13px] text-ink-muted">
          Painel de gestão dos professores — priorizado automaticamente pelos casos mais críticos.
        </p>
      </header>

      {/* ── 1. Cards de resumo ── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-8">
        {cards.map((c, i) => (
          <CardResumo
            key={i}
            label={c.label}
            valor={c.valor}
            tone={c.tone}
            ativo={c.id != null && f.quick === c.id}
            onClick={c.id != null ? () => setF(s => ({ ...s, quick: s.quick === c.id ? 'todos' : c.id! })) : undefined}
          />
        ))}
      </div>

      {/* ── 2. Filtros ── */}
      <div className="card-surface p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
            <Input
              placeholder="Buscar professor…"
              value={f.busca}
              onChange={e => setF(s => ({ ...s, busca: e.target.value }))}
              className="pl-9 h-9 bg-surface-canvas border-line"
            />
          </div>

          <FiltroSelect
            valor={f.grupoId}
            onChange={v => setF(s => ({ ...s, grupoId: v }))}
            placeholder="Coordenação"
            opcoes={[{ value: 'todos', label: 'Todas as coordenações' }, ...grupos.map(g => ({ value: g.id, label: g.nome }))]}
          />
          <FiltroSelect
            valor={f.nivel}
            onChange={v => setF(s => ({ ...s, nivel: v }))}
            opcoes={[{ value: 'todos', label: 'Toda prioridade' }, ...NIVEIS_ORDEM.map(id => ({ value: id, label: nivelInfo(id).label }))]}
          />
          <FiltroSelect
            valor={f.faixaScore}
            onChange={v => setF(s => ({ ...s, faixaScore: v }))}
            opcoes={[{ value: 'todos', label: 'Toda faixa de score' }, ...SCORE_BUCKETS.map(b => ({ value: b.label, label: b.label }))]}
          />
          <FiltroSelect valor={f.minPendencias} onChange={v => setF(s => ({ ...s, minPendencias: v }))} opcoes={MIN_PEND_OPTS} prefixo="Pendências" />
          <FiltroSelect valor={f.minDias} onChange={v => setF(s => ({ ...s, minDias: v }))} opcoes={MIN_DIAS_OPTS} prefixo="Dias" />
          <FiltroSelect valor={f.silStatus} onChange={v => setF(s => ({ ...s, silStatus: v }))} opcoes={SIL_OPTS} prefixo="Status" />
          <FiltroSelect
            valor={f.bloqueado}
            onChange={v => setF(s => ({ ...s, bloqueado: v }))}
            opcoes={[{ value: 'todos', label: 'Bloqueio: todos' }, { value: 'sim', label: 'Bloqueados' }, { value: 'nao', label: 'Não bloqueados' }]}
          />
          <FiltroSelect
            valor={f.recente}
            onChange={v => setF(s => ({ ...s, recente: v }))}
            opcoes={[{ value: 'todos', label: 'Acomp.: todos' }, { value: 'com', label: 'Com acomp. recente' }, { value: 'sem', label: 'Sem acomp. recente' }]}
          />
          <FiltroSelect
            valor={f.agrupar}
            onChange={v => setF(s => ({ ...s, agrupar: v as AgruparPor }))}
            opcoes={[
              { value: 'nenhum', label: 'Sem agrupamento' },
              { value: 'nivel', label: 'Agrupar: prioridade' },
              { value: 'coordenador', label: 'Agrupar: coordenador' },
              { value: 'silStatus', label: 'Agrupar: status' },
            ]}
          />

          {filtrosAtivos && (
            <button
              onClick={() => setF(FILTROS_PADRAO)}
              className="btn-press inline-flex items-center gap-1 rounded-md px-2.5 h-9 text-[12px] font-medium text-ink-secondary hover:text-ink hover:bg-surface-subtle transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Limpar
            </button>
          )}
        </div>

        {/* Favoritos */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-2.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted uppercase tracking-wide">
            <Star className="h-3 w-3" /> Favoritos
          </span>
          {favoritos.length === 0 && (
            <span className="text-[12px] text-ink-subtle">nenhum salvo</span>
          )}
          {favoritos.map(fav => (
            <span key={fav.id} className="inline-flex items-center rounded-full bg-surface-subtle text-ink-secondary text-[11.5px] font-medium overflow-hidden">
              <button onClick={() => setF({ ...FILTROS_PADRAO, ...fav.filtros })} className="btn-press pl-2.5 pr-1 py-1 hover:text-ink transition-colors">
                {fav.nome}
              </button>
              <button onClick={() => remover(fav.id)} className="btn-press pr-2 pl-0.5 py-1 text-ink-muted hover:text-urg-highFg transition-colors" aria-label="Remover favorito">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            onClick={salvarFavorito}
            disabled={!filtrosAtivos}
            className="btn-press inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium text-accentBlue hover:bg-accentBlue-soft transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            + Salvar filtro atual
          </button>
        </div>
      </div>

      {/* Meta */}
      <p className="text-[12px] text-ink-muted tabular-nums -mt-1">
        {ordenados.length} de {rows.length} professores
      </p>

      {/* ── 3. Tabela ── */}
      <div className="card-surface overflow-x-auto">
        <table className="w-full text-[13px] min-w-[980px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-ink-muted uppercase tracking-wide">
              <SortHeader label="Professor"   campo="nome"       f={f} setF={setF} />
              <SortHeader label="Score"        campo="score"      f={f} setF={setF} align="center" numeric />
              <SortHeader label="Pendências"   campo="pendencias" f={f} setF={setF} align="center" numeric />
              <SortHeader label="Dias"         campo="dias"       f={f} setF={setF} align="center" numeric />
              <SortHeader label="Prioridade"   campo="prioridade" f={f} setF={setF} numeric />
              <th className="px-3 py-2.5 font-medium">Coordenador</th>
              <SortHeader label="Último acomp." campo="ultimo"    f={f} setF={setF} numeric />
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium text-right">Ações</th>
            </tr>
          </thead>

          {isLoading ? (
            <tbody><SkeletonRows /></tbody>
          ) : ordenados.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={N_COLUNAS}>
                  <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                    <CheckCircle2 className="h-7 w-7 text-urg-lowFg" />
                    <p className="text-[13px] text-ink-secondary font-medium">Nenhum professor neste filtro.</p>
                    <p className="text-[12px] text-ink-muted">Ajuste a busca ou os filtros acima.</p>
                  </div>
                </td>
              </tr>
            </tbody>
          ) : (
            gruposLista.map(g => (
              <tbody key={g.chave || 'todos'}>
                {f.agrupar !== 'nenhum' && (
                  <tr className="bg-surface-subtle/60">
                    <td colSpan={N_COLUNAS} className="px-3 py-1.5 text-[11px] font-semibold text-ink-secondary uppercase tracking-wide">
                      {g.label} <span className="text-ink-muted tabular-nums font-normal">· {g.rows.length}</span>
                    </td>
                  </tr>
                )}
                {g.rows.map(r => (
                  <PainelRow key={r.professor_id} r={r} podeAgir={podeAgir} />
                ))}
              </tbody>
            ))
          )}
        </table>
      </div>

      {/* ── 4. Contexto secundário (recolhível) ── */}
      <ContextoSecundario />
    </div>
  )
}

// ─── Contexto secundário: gráfico semanal + problemas abertos ─────────────────

function semanaLabel(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function ContextoSecundario() {
  const [aberto, setAberto] = useState(false)

  return (
    <div className="space-y-3">
      <button
        onClick={() => setAberto(v => !v)}
        className="btn-press inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-secondary hover:text-ink transition-colors"
      >
        <ChevronDown className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')} />
        {aberto ? 'Ocultar contexto' : 'Mostrar contexto (evolução + problemas abertos)'}
      </button>

      {aberto && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <PendenciasSemanaChart />
          <ProblemasAbertosPanel />
        </div>
      )}
    </div>
  )
}

function PendenciasSemanaChart() {
  const { data: serieGeral = [] } = useSilencioSnapshotGeral()
  const chartData = serieGeral.map(s => ({ label: semanaLabel(s.semana), pendencias: s.total_pendencias }))

  return (
    <section className="card-surface p-4 space-y-3 min-w-0">
      <div className="flex items-center justify-between">
        <h2 className="label-micro">Pendências por semana (todos os professores)</h2>
        {chartData.length <= 1 && <span className="text-[11px] text-ink-subtle">os pontos acumulam a cada semana</span>}
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
        O sinal do KMS só marca pendência após ~1 semana, então ninguém aparece com menos de {SILENCIO_LIMIARES.alerta} dias.
      </p>
    </section>
  )
}

function ProblemasAbertosPanel() {
  const { data: professores = [], isLoading } = useProblemasAbertos()
  const [expandido, setExpandido] = useState(false)
  const visiveis = expandido ? professores : professores.slice(0, 8)

  return (
    <section className="card-surface p-4 space-y-3 self-start">
      <div className="flex items-center justify-between">
        <h2 className="label-micro">Problemas abertos</h2>
        {professores.length > 0 && (
          <span className="text-[11px] text-urg-highFg font-medium tabular-nums">{professores.length}</span>
        )}
      </div>

      {isLoading ? (
        <p className="text-[12px] text-ink-muted">Carregando…</p>
      ) : professores.length === 0 ? (
        <p className="text-[12px] text-ink-muted">Nenhum professor com questão em aberto.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {visiveis.map(p => <ProblemaAbertoRow key={p.professor_id} professor={p} />)}
          </ul>
          {professores.length > 8 && (
            <button onClick={() => setExpandido(v => !v)} className="btn-press text-[11px] text-accentBlue font-medium">
              {expandido ? 'Ver menos' : `+ ${professores.length - 8} mais`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function ProblemaAbertoRow({ professor }: { professor: ProfessorComProblema }) {
  return (
    <li className="pb-2 border-b border-line-soft last:border-0 last:pb-0">
      <Link to={`/professores/${professor.professor_id}`} className="text-[12.5px] text-ink font-medium hover:text-accentBlue transition-colors">
        {professor.nome}
      </Link>
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {professor.ocorrencias_abertas > 0 && (
          <span className="inline-flex items-center rounded-full bg-urg-medBg text-urg-medFg px-2 py-0.5 text-[10.5px] font-medium tabular-nums">
            {professor.ocorrencias_abertas} ocorrência{professor.ocorrencias_abertas !== 1 ? 's' : ''}
          </span>
        )}
        {professor.incidentes_abertos > 0 && (
          <span className="inline-flex items-center rounded-full bg-urg-highBg text-urg-highFg px-2 py-0.5 text-[10.5px] font-medium tabular-nums">
            {professor.incidentes_abertos} incidente{professor.incidentes_abertos !== 1 ? 's' : ''} (Nexus)
          </span>
        )}
      </div>
    </li>
  )
}

// ─── Card de resumo ───────────────────────────────────────────────────────────

function CardResumo({ label, valor, tone, ativo, onClick }: {
  label: string; valor: number; tone: 'neutral' | 'med' | 'high'; ativo: boolean; onClick?: () => void
}) {
  const valorCls = tone === 'high' ? 'text-urg-highFg' : tone === 'med' ? 'text-urg-medFg' : 'text-ink'
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'card-surface px-3 py-2.5 text-left transition-colors',
        onClick ? 'btn-press hover:border-accentBlue/40 cursor-pointer' : 'cursor-default',
        ativo && 'border-accentBlue ring-1 ring-accentBlue/30',
      )}
    >
      <div className={cn('text-xl font-semibold tabular-nums leading-none', valorCls)}>{valor}</div>
      <div className="mt-1 text-[11px] text-ink-muted leading-tight">{label}</div>
    </button>
  )
}

// ─── Select de filtro compacto ────────────────────────────────────────────────

function FiltroSelect({ valor, onChange, opcoes, placeholder, prefixo }: {
  valor: string; onChange: (v: string) => void
  opcoes: { value: string; label: string }[]; placeholder?: string; prefixo?: string
}) {
  const sel = opcoes.find(o => o.value === valor)
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-fit min-w-[132px] bg-surface-canvas border-line text-[12.5px]">
        <SelectValue placeholder={placeholder}>
          {prefixo ? <span className="text-ink-muted">{prefixo}: <span className="text-ink">{sel?.label}</span></span> : sel?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {opcoes.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

// ─── Cabeçalho ordenável ──────────────────────────────────────────────────────

function SortHeader({ label, campo, f, setF, align = 'left', numeric = false }: {
  label: string; campo: OrdenarPor; f: Filtros; setF: Dispatch<SetStateAction<Filtros>>
  align?: 'left' | 'center' | 'right'; numeric?: boolean
}) {
  const ativo = f.ordenarPor === campo
  function toggle() {
    setF(s => ({
      ...s,
      ordenarPor: campo,
      ordemDir: s.ordenarPor === campo ? (s.ordemDir === 'asc' ? 'desc' : 'asc') : (numeric ? 'desc' : 'asc'),
    }))
  }
  return (
    <th className={cn('px-3 py-2.5 font-medium', align === 'center' && 'text-center', align === 'right' && 'text-right')}>
      <button
        onClick={toggle}
        className={cn(
          'btn-press inline-flex items-center gap-1 hover:text-ink transition-colors',
          align === 'center' && 'mx-auto', ativo && 'text-ink',
        )}
      >
        {label}
        {ativo
          ? (f.ordemDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )
}

// ─── Linha ────────────────────────────────────────────────────────────────────

function PainelRow({ r, podeAgir }: { r: PainelProfessor; podeAgir: boolean }) {
  const registrar = useRegistrarMensagemPendencia()
  const [copiado, setCopiado] = useState(false)
  const score = scoreVisual(r.score_atual)
  const critica = r.nivel.id === 'critica'

  const temEpisodio = r.silencio_status != null
  const mensagem = temEpisodio ? mensagemPendencia(r.silencio_status!, r.nome, r.aulas_pendentes_qtd) : ''

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
    if (!r.silencio_status) return
    try {
      await registrar.mutateAsync({ professorId: r.professor_id, estagio: r.silencio_status, texto: mensagem })
      toast.success(`${r.nome}: ${ESTAGIOS[r.silencio_status].n}ª mensagem registrada.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar mensagem.')
    }
  }

  return (
    <tr className={cn('border-b border-line-soft last:border-0 transition-colors hover:bg-surface-subtle/50', critica && 'bg-urg-highBg/20')}>
      {/* Professor */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/professores/${r.professor_id}`} className="text-ink font-medium hover:text-accentBlue hover:underline">
            {r.nome}
          </Link>
          {r.precisa_mes_analise && (
            <span
              title="Chegou à 3ª etapa sem regularizar — recomendação de Mês de Análise."
              className="inline-flex items-center gap-1 rounded-full bg-urg-highBg text-urg-highFg px-2 py-0.5 text-[10.5px] font-medium"
            >
              <AlertTriangle className="h-3 w-3" /> Mês de Análise
            </span>
          )}
          {r.informes_recentes > 0 && (
            <span
              title={
                `${r.informes_recentes} informe${r.informes_recentes > 1 ? 's' : ''} nos últimos ${INFORME_JANELA} dias` +
                (r.informe_reincidente
                  ? ' — com reincidência na mesma categoria. Pesa mais no Índice de Prioridade.'
                  : '. Conta como sinal no Índice de Prioridade.')
              }
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                r.informe_reincidente ? 'bg-urg-medBg text-urg-medFg' : 'bg-surface-subtle text-ink-secondary',
              )}
            >
              <FileText className="h-3 w-3" />
              {r.informes_recentes} informe{r.informes_recentes > 1 ? 's' : ''}
              {r.informe_reincidente && ' · reincide'}
            </span>
          )}
        </div>
        {r.grupo_nome && <div className="text-[11px] text-ink-muted mt-0.5">{r.grupo_nome}</div>}
      </td>

      {/* Score */}
      <td className="px-3 py-2.5 text-center">
        {r.score_atual != null ? (
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums', score.tagClass)}>
            {score.label}
          </span>
        ) : <span className="text-ink-muted">—</span>}
      </td>

      {/* Pendências */}
      <td className="px-3 py-2.5 text-center tabular-nums font-medium text-ink">
        {r.aulas_pendentes_qtd > 0 ? r.aulas_pendentes_qtd : <span className="text-ink-muted font-normal">—</span>}
      </td>

      {/* Dias */}
      <td className="px-3 py-2.5 text-center">
        {r.dias_pendente > 0 ? (
          <span className={cn('tabular-nums font-semibold', r.silencio_status ? diasCls[r.silencio_status] : 'text-ink-secondary')}>
            {r.dias_pendente}
          </span>
        ) : <span className="text-ink-muted">—</span>}
      </td>

      {/* Prioridade */}
      <td className="px-3 py-2.5">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', r.nivel.tagClass)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', r.nivel.dotClass)} />
          {r.nivel.label}
        </span>
      </td>

      {/* Coordenador */}
      <td className="px-3 py-2.5 text-ink-muted">{r.coordenador_nome ?? '—'}</td>

      {/* Último acompanhamento */}
      <td className="px-3 py-2.5 text-ink-muted whitespace-nowrap">
        {r.ultimo_acompanhamento_em ? (
          <span title={r.ultimo_acompanhamento_estagio ? ESTAGIOS[r.ultimo_acompanhamento_estagio].titulo : undefined}>
            {dataCurta(r.ultimo_acompanhamento_em)}
          </span>
        ) : '—'}
      </td>

      {/* Status do acompanhamento + bloqueio */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col items-start gap-1">
          {r.silencio_status ? (
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', statusChip[r.silencio_status])}>
              {ESTAGIOS[r.silencio_status].titulo}
            </span>
          ) : <span className="text-[11px] text-ink-muted">Sem pendência</span>}
          <div className="flex items-center gap-1">
            {r.contatado && (
              <span className="inline-flex items-center gap-1 rounded-full bg-urg-lowBg text-urg-lowFg px-2 py-0.5 text-[10px] font-medium">
                <Check className="h-2.5 w-2.5" /> contatado
              </span>
            )}
            {r.elegivel_alocacao === false && (
              <span title="Bloqueado para receber novos alunos" className="inline-flex items-center gap-1 rounded-full bg-urg-highBg text-urg-highFg px-2 py-0.5 text-[10px] font-medium">
                <Ban className="h-2.5 w-2.5" /> bloqueado
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Ações */}
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-2">
          {temEpisodio ? (
            <>
              <button
                onClick={handleCopiar}
                className="btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-medium rounded-md bg-surface-subtle text-ink-secondary hover:text-ink transition-colors"
              >
                {copiado ? <Check className="h-3.5 w-3.5 text-urg-lowFg" /> : <Copy className="h-3.5 w-3.5" />}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
              {podeAgir && !r.contatado && (
                <button
                  onClick={handleMarcar}
                  disabled={registrar.isPending}
                  className="btn-press px-3 py-1.5 text-[11.5px] font-medium rounded-md bg-urg-lowBg text-urg-lowFg hover:opacity-80 transition-opacity disabled:opacity-50 whitespace-nowrap"
                >
                  {registrar.isPending ? 'Salvando…' : ESTAGIOS[r.silencio_status!].botao}
                </button>
              )}
            </>
          ) : <span className="text-ink-subtle text-[12px]">—</span>}
        </div>
      </td>
    </tr>
  )
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b border-line-soft last:border-0">
          <td className="px-3 py-3"><div className="h-4 w-44 rounded bg-surface-subtle animate-pulse" /></td>
          {Array.from({ length: 7 }).map((_, j) => (
            <td key={j} className="px-3 py-3"><div className="h-4 w-12 mx-auto rounded bg-surface-subtle animate-pulse" /></td>
          ))}
          <td className="px-3 py-3"><div className="h-7 w-32 ml-auto rounded bg-surface-subtle animate-pulse" /></td>
        </tr>
      ))}
    </>
  )
}
