import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, FileText, FileSpreadsheet, ChevronLeft, ChevronRight,
  Clock, CheckCircle2, Users, HelpCircle,
  BookOpen, LayoutGrid, LifeBuoy, UserRound, Building2, CircleDollarSign, AlertOctagon,
  CalendarDays, UserX, ListTodo, UserMinus, Flag, Briefcase, FolderOpen, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIncidentesPeriodo } from '@/hooks/useRelatorios'
import {
  IncidenteStatusBadge,
  UrgencyBadge,
  urgencyFromIncidente,
} from '@/components/incidentes/IncidenteStatusBadge'
import { cn } from '@/lib/utils'
import { exportarPDF, exportarXLSX } from '@/lib/exportar'
import { toast } from 'sonner'
import type { ElementType } from 'react'

// ─── Tipo → icon map ─────────────────────────────────────────────────────────

const TIPO_ICON: Record<string, ElementType> = {
  'Didático':            BookOpen,
  'Plataforma':          LayoutGrid,
  'Suporte':             LifeBuoy,
  'Aluno':               UserRound,
  'Administrativo':      Building2,
  'Financeiro':          CircleDollarSign,
  'Dúvida':              HelpCircle,
  'Ocorrência':          AlertOctagon,
  'Mês de análise':      CalendarDays,
  'No-Show':             UserX,
  'Muitas pendências':   ListTodo,
  'Muitas faltas':       UserMinus,
  'Reclamação':          Flag,
  'Profissionalismo':    Briefcase,
  'Organização':         FolderOpen,
  'Erros de lançamento': AlertTriangle,
}

// All tipos ordered: Suporte first, CI second (matches NovoIncidentePanel)
const ALL_TIPOS = [
  'Didático', 'Plataforma', 'Suporte', 'Aluno',
  'Administrativo', 'Financeiro', 'Dúvida', 'Ocorrência',
  'Mês de análise', 'No-Show', 'Muitas pendências', 'Muitas faltas',
  'Reclamação', 'Profissionalismo', 'Organização', 'Erros de lançamento',
]

// ─── Period helpers ───────────────────────────────────────────────────────────

type Periodo = 'semanal' | 'mensal'

function getPeriodo(tipo: Periodo, offset: number): { inicio: Date; fim: Date } {
  const hoje = new Date()
  if (tipo === 'semanal') {
    // week starts Monday
    const dow   = hoje.getDay() === 0 ? 7 : hoje.getDay() // Mon=1…Sun=7
    const inicio = new Date(hoje)
    inicio.setDate(hoje.getDate() - (dow - 1) + offset * 7)
    inicio.setHours(0, 0, 0, 0)
    const fim = new Date(inicio)
    fim.setDate(inicio.getDate() + 6)
    fim.setHours(23, 59, 59, 999)
    return { inicio, fim }
  } else {
    const base  = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1)
    const inicio = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0)
    const fim    = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999)
    return { inicio, fim }
  }
}

function formatRange(tipo: Periodo, inicio: Date, fim: Date): string {
  const d = (date: Date) =>
    date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  if (tipo === 'semanal') return `${d(inicio)} — ${d(fim)}`
  return inicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function calcTempoMedio(incidentes: { status: string; created_at: string; updated_at?: string }[]): string {
  const resolvidos = incidentes.filter(i => i.status === 'aprovado' && i.updated_at)
  if (!resolvidos.length) return '—'
  const msTotal = resolvidos.reduce((acc, i) => {
    return acc + (new Date(i.updated_at!).getTime() - new Date(i.created_at).getTime())
  }, 0)
  const minutos = Math.round(msTotal / resolvidos.length / 60_000)
  if (minutos < 60)   return `${minutos}min`
  if (minutos < 1440) return `${Math.round(minutos / 60)}h`
  return `${Math.round(minutos / 1440)}d`
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RelatoriosPage() {
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<Periodo>('semanal')
  const [offset,  setOffset]  = useState(0)

  const { inicio, fim } = useMemo(() => getPeriodo(periodo, offset), [periodo, offset])

  const { data: incidentes = [], isLoading } = useIncidentesPeriodo({
    inicio: inicio.toISOString(),
    fim:    fim.toISOString(),
  })

  // ─── Métricas ──────────────────────────────────────────────────────────────
  const total        = incidentes.length
  const resolvidos   = incidentes.filter(i => i.status === 'aprovado').length
  const pendentes    = incidentes.filter(i => i.status === 'pendente').length
  const acompanham   = incidentes.filter(i => i.precisa_acompanhamento).length
  const taxa         = total ? Math.round((resolvidos / total) * 100) : 0
  const tempoMedio   = useMemo(() => calcTempoMedio(incidentes), [incidentes])

  const ranking = useMemo(() => {
    const map = new Map<string, number>()
    incidentes.forEach(i => {
      const nome = i.professores?.nome
      if (nome) map.set(nome, (map.get(nome) ?? 0) + 1)
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [incidentes])

  const urgDist = useMemo(() => {
    const alta  = incidentes.filter(i => urgencyFromIncidente(i) === 'alta').length
    const media = incidentes.filter(i => urgencyFromIncidente(i) === 'media').length
    const baixa = incidentes.filter(i => urgencyFromIncidente(i) === 'baixa').length
    return { alta, media, baixa }
  }, [incidentes])

  const tiposData = useMemo(() => {
    const freqMap = new Map<string, number>()
    incidentes.forEach(i => freqMap.set(i.tipo, (freqMap.get(i.tipo) ?? 0) + 1))

    // Use known list, sorted by count desc, then alphabetically
    return ALL_TIPOS.map(k => ({ key: k, count: freqMap.get(k) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  }, [incidentes])

  const maxTipo    = Math.max(1, ...tiposData.map(t => t.count))
  const maxRanking = ranking[0]?.[1] ?? 1

  // ─── Exports ───────────────────────────────────────────────────────────────
  function handleExportPDF() {
    try {
      exportarPDF(
        `Relatório de Incidentes — ${formatRange(periodo, inicio, fim)}`,
        ['Data', 'Tipo', 'Professor', 'Descrição', 'Status', 'Urgência'],
        incidentes.map(i => [
          new Date(i.created_at).toLocaleDateString('pt-BR'),
          i.tipo,
          i.professores?.nome ?? '—',
          i.descricao.slice(0, 60) + (i.descricao.length > 60 ? '...' : ''),
          i.status,
          urgencyFromIncidente(i),
        ]),
        `relatorio_incidentes_${periodo}`
      )
      toast.success('PDF gerado.')
    } catch {
      toast.error('Erro ao gerar PDF.')
    }
  }

  function handleExportXLSX() {
    try {
      exportarXLSX(
        incidentes.map(i => ({
          Data:        new Date(i.created_at).toLocaleDateString('pt-BR'),
          Tipo:        i.tipo,
          Professor:   i.professores?.nome ?? '—',
          Responsável: i.responsavel ?? '—',
          Urgência:    urgencyFromIncidente(i),
          Status:      i.status,
          Descrição:   i.descricao,
          Solução:     i.solucao ?? '—',
        })),
        `relatorio_incidentes_${periodo}`
      )
      toast.success('Planilha gerada.')
    } catch {
      toast.error('Erro ao gerar planilha.')
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-6 py-6 max-w-[920px] mx-auto space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}
            className="btn-press text-ink-secondary hover:text-ink hover:bg-surface-subtle">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold text-ink">Relatórios</h1>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleExportPDF}
            className="btn-press border-line text-ink-secondary hover:bg-surface-subtle gap-1.5 text-[12px]">
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportXLSX}
            className="btn-press border-line text-ink-secondary hover:bg-surface-subtle gap-1.5 text-[12px]">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Word
          </Button>
        </div>
      </div>

      {/* ── Period selector ── */}
      <div className="card-surface p-3 flex flex-wrap items-center gap-4">
        <div className="grid grid-cols-2 rounded-md bg-surface-subtle p-0.5 text-[12px] font-medium">
          {(['semanal', 'mensal'] as Periodo[]).map(p => (
            <button key={p} onClick={() => { setPeriodo(p); setOffset(0) }}
              className={cn(
                'btn-press px-3 py-1.5 rounded capitalize',
                periodo === p
                  ? 'bg-surface-canvas text-ink shadow-card'
                  : 'text-ink-muted hover:text-ink'
              )}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-1 justify-center">
          <button onClick={() => setOffset(o => o - 1)}
            className="btn-press h-7 w-7 rounded-md flex items-center justify-center hover:bg-surface-subtle text-ink-muted hover:text-ink">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="tabular-nums text-[13px] font-medium text-ink min-w-[210px] text-center select-none">
            {formatRange(periodo, inicio, fim)}
          </span>
          <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0}
            className={cn(
              'btn-press h-7 w-7 rounded-md flex items-center justify-center hover:bg-surface-subtle text-ink-muted hover:text-ink',
              offset >= 0 && 'opacity-30 pointer-events-none'
            )}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-[13px] text-ink-muted">
          Carregando dados…
        </div>
      ) : (
        <>
          {/* ── Top 3 stat cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                icon: Clock, label: 'Tempo Médio de Resolução',
                value: tempoMedio, sub: null,
              },
              {
                icon: CheckCircle2, label: 'Taxa de Resolução',
                value: `${taxa}%`, sub: total > 0 ? `${resolvidos} de ${total} resolvidos` : null,
              },
              {
                icon: Users, label: 'Professores com Incidentes',
                value: String(ranking.length), sub: null,
              },
            ].map(({ icon: Icon, label, value, sub }) => (
              <div key={label} className="card-surface p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-ink-muted" />
                  <span className="label-micro">{label}</span>
                </div>
                <p className="text-[30px] font-semibold text-ink tabular-nums leading-none">{value}</p>
                {sub && <p className="text-[11px] text-ink-muted tabular-nums">{sub}</p>}
              </div>
            ))}
          </div>

          {/* ── Ranking de professores ── */}
          {ranking.length > 0 && (
            <div className="card-surface p-4 space-y-3">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">
                Ranking de professores com mais incidentes
              </p>
              <div className="space-y-2">
                {ranking.map(([nome, count], idx) => (
                  <div key={nome} className="grid items-center gap-3 text-[13px]"
                    style={{ gridTemplateColumns: '20px 160px 1fr 28px' }}>
                    <span className="text-ink-muted tabular-nums text-right shrink-0">{idx + 1}.</span>
                    <span className="truncate text-ink-secondary">{nome}</span>
                    <div className="h-2.5 rounded-full bg-surface-subtle overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accentBlue transition-[width] duration-500"
                        style={{ width: `${(count / maxRanking) * 100}%` }}
                      />
                    </div>
                    <span className="text-ink font-semibold tabular-nums text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 4 count mini-cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total',          value: total,      cls: 'text-ink' },
              { label: 'Resolvidos',     value: resolvidos, cls: 'text-urg-lowFg' },
              { label: 'Pendentes',      value: pendentes,  cls: 'text-urg-medFg' },
              { label: 'Acompanhamento', value: acompanham, cls: 'text-urg-highFg' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="card-surface p-4 text-center space-y-1.5">
                <p className="label-micro">{label}</p>
                <p className={cn('text-[28px] font-semibold tabular-nums leading-none', cls)}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* ── Distribuição por urgência ── */}
          <div className="card-surface p-4 space-y-4">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">
              Distribuição por urgência
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Alta',  count: urgDist.alta,  barCls: 'bg-urg-highFg', textCls: 'text-urg-highFg' },
                { label: 'Média', count: urgDist.media, barCls: 'bg-urg-medFg',  textCls: 'text-urg-medFg'  },
                { label: 'Baixa', count: urgDist.baixa, barCls: 'bg-urg-lowFg',  textCls: 'text-urg-lowFg'  },
              ].map(({ label, count, barCls, textCls }) => {
                const pct = total ? Math.round((count / total) * 100) : 0
                return (
                  <div key={label} className="space-y-2">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-ink-secondary font-medium">{label}</span>
                      <span className={cn('tabular-nums font-semibold', textCls)}>
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-subtle overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-[width] duration-500', barCls)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Tipos mais recorrentes ── */}
          <div className="card-surface p-4 space-y-3">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">
              Tipos mais recorrentes
            </p>
            <div className="space-y-1.5">
              {tiposData.map(({ key, count }, idx) => {
                const Icon = TIPO_ICON[key] ?? HelpCircle
                const pct  = total ? Math.round((count / total) * 100) : 0
                return (
                  <div key={key}
                    className="grid items-center gap-2 text-[12px]"
                    style={{ gridTemplateColumns: '22px 18px 130px 1fr 28px 36px' }}>
                    <span className="text-ink-muted tabular-nums text-right">{idx + 1}.</span>
                    <Icon className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                    <span className="text-ink-secondary truncate">{key}</span>
                    <div className="h-2 rounded-full bg-surface-subtle overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-500',
                          count > 0 ? 'bg-accentBlue/85' : 'bg-transparent'
                        )}
                        style={{ width: `${(count / maxTipo) * 100}%` }}
                      />
                    </div>
                    <span className={cn(
                      'tabular-nums text-right font-semibold',
                      count > 0 ? 'text-ink' : 'text-ink-muted'
                    )}>
                      {count}
                    </span>
                    <span className="tabular-nums text-right text-ink-muted">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Detalhes dos incidentes ── */}
          {incidentes.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">
                Detalhes dos incidentes ({incidentes.length})
              </p>
              <div className="space-y-3">
                {incidentes.map(inc => {
                  const Icon    = TIPO_ICON[inc.tipo] ?? HelpCircle
                  const urgency = urgencyFromIncidente(inc)
                  const borderCls =
                    urgency === 'alta'  ? 'border-l-urg-highFg' :
                    urgency === 'media' ? 'border-l-urg-medFg'  : 'border-l-urg-lowFg'
                  return (
                    <div key={inc.id}
                      className={cn('card-surface p-4 space-y-2.5 border-l-2', borderCls)}>
                      {/* Row 1: badges + date */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-subtle text-[11px] font-medium text-ink-secondary">
                            <Icon className="h-3 w-3 shrink-0" />
                            {inc.tipo}
                          </span>
                          <UrgencyBadge level={urgency} />
                        </div>
                        <span className="text-[11px] text-ink-muted tabular-nums whitespace-nowrap shrink-0">
                          {new Date(inc.created_at).toLocaleDateString('pt-BR', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {/* Row 2: professor + responsável */}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[13px]">
                        {inc.professores?.nome && (
                          <span className="font-semibold text-ink">
                            Professor: {inc.professores.nome}
                          </span>
                        )}
                        {inc.responsavel && (
                          <span className="text-ink-secondary">
                            <span className="font-medium text-ink">Responsável:</span> {inc.responsavel}
                          </span>
                        )}
                      </div>

                      {/* Descrição */}
                      <p className="text-[13px] text-ink-secondary leading-relaxed">
                        <span className="font-medium text-ink">Descrição:</span> {inc.descricao}
                      </p>

                      {/* Solução */}
                      {inc.solucao && (
                        <p className="text-[13px] text-ink-secondary leading-relaxed">
                          <span className="font-medium text-ink">Solução:</span> {inc.solucao}
                        </p>
                      )}

                      {/* Status chips */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <IncidenteStatusBadge
                          status={inc.status as 'pendente' | 'aprovado' | 'rejeitado'}
                        />
                        {inc.precisa_acompanhamento && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-urg-medBg text-[11px] font-medium text-urg-medFg">
                            <span className="h-1.5 w-1.5 rounded-full bg-urg-medFg" />
                            Acompanhamento
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="card-surface p-10 text-center text-ink-muted text-[13px]">
              Nenhum incidente registrado neste período.
            </div>
          )}
        </>
      )}
    </div>
  )
}
