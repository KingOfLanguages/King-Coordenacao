import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Eye, EyeOff,
  CalendarDays, Clock, DollarSign, AlertTriangle,
  CheckCircle2, XCircle, Hourglass,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProfessor, useAtualizarMonitoramento } from '@/hooks/useProfessores'
import { PrioridadeBadge } from '@/components/professores/PrioridadeBadge'
import { StatusBadge } from '@/components/professores/StatusBadge'
import { NovaObservacaoDialog } from '@/components/professores/NovaObservacaoDialog'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ReuniaoRow = {
  id: string
  data: string
  status: 'pendente' | 'concluida' | 'cancelada'
  notas?: string | null
  profiles?: { nome: string } | { nome: string }[] | null
}

type ObservacaoRow = {
  id: string
  tipo: string
  texto: string
  created_at: string
  profiles?: { nome: string } | { nome: string }[] | null
}

type IncidenteRow = {
  id: string
  tipo: string
  descricao: string
  status: 'pendente' | 'aprovado' | 'rejeitado'
  urgencia: 'baixa' | 'media' | 'alta'
  solucao?: string | null
  created_at: string
}

// ─── Observation labels/tones ─────────────────────────────────────────────────

const labelTipo: Record<string, string> = {
  reuniao:           'Reunião',
  ocorrencia:        'Ocorrência',
  feedback_positivo: '🟢 Positivo',
  feedback_negativo: '🔴 Negativo',
  feedback_neutro:   '⚪ Neutro',
}

const borderTipo: Record<string, string> = {
  reuniao:           'border-accentBlue/40',
  ocorrencia:        'border-urg-medFg/40',
  feedback_positivo: 'border-urg-lowFg/40',
  feedback_negativo: 'border-urg-highFg/40',
  feedback_neutro:   'border-line',
}

const chipTipo: Record<string, string> = {
  reuniao:           'bg-accentBlue-soft text-accentBlue',
  ocorrencia:        'bg-urg-medBg text-urg-medFg',
  feedback_positivo: 'bg-urg-lowBg text-urg-lowFg',
  feedback_negativo: 'bg-urg-highBg text-urg-highFg',
  feedback_neutro:   'bg-surface-subtle text-ink-secondary',
}

// ─── Incident helpers ─────────────────────────────────────────────────────────

const urgLabel: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' }
const urgChip: Record<string, string>  = {
  baixa: 'bg-urg-lowBg  text-urg-lowFg',
  media: 'bg-urg-medBg  text-urg-medFg',
  alta:  'bg-urg-highBg text-urg-highFg',
}
const urgBorder: Record<string, string> = {
  baixa: 'border-urg-lowFg/20',
  media: 'border-urg-medFg/20',
  alta:  'border-urg-highFg/20',
}

type ObsFiltro = 'todos' | 'feedback_positivo' | 'feedback_negativo' | 'feedback_neutro' | 'reuniao' | 'ocorrencia'

const FILTROS: { value: ObsFiltro; label: string }[] = [
  { value: 'todos',             label: 'Todos' },
  { value: 'feedback_positivo', label: '🟢 Positivos' },
  { value: 'feedback_negativo', label: '🔴 Negativos' },
  { value: 'feedback_neutro',   label: '⚪ Neutros' },
  { value: 'reuniao',           label: 'Reuniões' },
  { value: 'ocorrencia',        label: 'Ocorrências' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ProfessorDetalhePage() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const { data: professor, isLoading } = useProfessor(id!)
  const atualizarMonitoramento = useAtualizarMonitoramento()
  const [obsAberta, setObsAberta] = useState(false)
  const [obsFiltro, setObsFiltro] = useState<ObsFiltro>('todos')
  const [abaAtiva, setAbaAtiva]   = useState<'observacoes' | 'incidentes'>('observacoes')

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center text-ink-muted text-[13px]">
      Carregando…
    </div>
  )
  if (!professor) return (
    <div className="flex h-64 items-center justify-center text-ink-muted text-[13px]">
      Professor não encontrado.
    </div>
  )

  const reunioes    = (professor.reunioes    ?? []) as ReuniaoRow[]
  const observacoes = (professor.observacoes ?? []) as ObservacaoRow[]
  const incidentes  = (professor.incidentes  ?? []) as IncidenteRow[]

  const obsFiltered = obsFiltro === 'todos'
    ? observacoes
    : observacoes.filter(o => o.tipo === obsFiltro)

  const negativos  = observacoes.filter(o => o.tipo === 'feedback_negativo').length
  const positivos  = observacoes.filter(o => o.tipo === 'feedback_positivo').length
  const pendentes  = incidentes.filter(i => i.status === 'pendente').length
  const temAnalise = incidentes.some(i =>
    /m[eê]s\s*de\s*an[aá]li/i.test(i.tipo) || /an[aá]lise/i.test(i.tipo)
  )

  function resolverNomePerfil(profiles: { nome: string } | { nome: string }[] | null | undefined): string | null {
    if (!profiles) return null
    if (Array.isArray(profiles)) return profiles[0]?.nome ?? null
    return profiles.nome ?? null
  }

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px] mx-auto">
      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost" size="icon"
          onClick={() => navigate('/professores')}
          className="btn-press text-ink-secondary hover:text-ink hover:bg-surface-subtle mt-0.5"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{professor.nome}</h1>
            <PrioridadeBadge professor={professor} />
            {temAnalise && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-urg-medBg px-2.5 py-1 text-[11px] font-medium text-urg-medFg">
                <Hourglass className="h-3 w-3" />
                Mês de Análise
              </span>
            )}
          </div>

          {/* Contadores rápidos */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-muted">
            {professor.tempo_na_king && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {professor.tempo_na_king} na King
              </span>
            )}
            {professor.renda && (
              <span className="inline-flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {professor.renda}
              </span>
            )}
            {professor.data_ultima_reuniao && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Última reunião {new Date(professor.data_ultima_reuniao).toLocaleDateString('pt-BR')}
              </span>
            )}
            {negativos > 0 && (
              <span className="text-urg-highFg font-medium">
                🔴 {negativos} feedback{negativos !== 1 ? 's' : ''} negativo{negativos !== 1 ? 's' : ''}
              </span>
            )}
            {positivos > 0 && (
              <span className="text-urg-lowFg font-medium">
                🟢 {positivos} positivo{positivos !== 1 ? 's' : ''}
              </span>
            )}
            {pendentes > 0 && (
              <span className="text-urg-medFg font-medium">
                ⚡ {pendentes} incidente{pendentes !== 1 ? 's' : ''} pendente{pendentes !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline" size="sm"
            className="btn-press border-line text-ink-secondary hover:text-ink gap-1.5"
            onClick={() => atualizarMonitoramento.mutate({
              id: professor.id,
              monitoramento: !professor.monitoramento,
            })}
          >
            {professor.monitoramento
              ? <><EyeOff className="h-3.5 w-3.5" />Sair do monitoramento</>
              : <><Eye className="h-3.5 w-3.5" />Monitoramento</>
            }
          </Button>
          <Button
            size="sm"
            className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white gap-1.5"
            onClick={() => setObsAberta(true)}
          >
            <Plus className="h-3.5 w-3.5" />Observação
          </Button>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Reuniões */}
        <section className="card-surface p-5 space-y-3 self-start">
          <h2 className="label-micro">Reuniões</h2>
          {reunioes.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Nenhuma reunião registrada.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {reunioes.slice(0, 10).map(r => (
                <li key={r.id} className="flex items-center justify-between py-2 text-[13px] gap-2">
                  <span className="text-ink tabular-nums">
                    {new Date(r.data).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
              {reunioes.length > 10 && (
                <li className="pt-2 text-[12px] text-ink-muted">
                  + {reunioes.length - 10} mais
                </li>
              )}
            </ul>
          )}
        </section>

        {/* Observações + Incidentes */}
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-line-soft">
            {([
              ['observacoes', `Observações (${observacoes.length})`],
              ['incidentes',  `Incidentes (${incidentes.length})`],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setAbaAtiva(tab)}
                className={cn(
                  'px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors',
                  abaAtiva === tab
                    ? 'border-accentBlue text-accentBlue'
                    : 'border-transparent text-ink-secondary hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Observações ── */}
          {abaAtiva === 'observacoes' && (
            <div className="space-y-4">
              {/* Filtros de tipo */}
              <div className="flex flex-wrap gap-2">
                {FILTROS.map(f => {
                  const count = f.value === 'todos'
                    ? observacoes.length
                    : observacoes.filter(o => o.tipo === f.value).length
                  return (
                    <button
                      key={f.value}
                      onClick={() => setObsFiltro(f.value)}
                      className={cn(
                        'btn-press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                        obsFiltro === f.value
                          ? 'bg-accentBlue text-white'
                          : 'bg-surface-subtle text-ink-secondary hover:bg-surface-canvas hover:border-line border border-transparent',
                      )}
                    >
                      {f.label}
                      <span className={cn(
                        'tabular-nums',
                        obsFiltro === f.value ? 'text-white/70' : 'text-ink-muted',
                      )}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {obsFiltered.length === 0 ? (
                <div className="card-surface p-8 text-center">
                  <p className="text-[13px] text-ink-muted">
                    {obsFiltro === 'todos'
                      ? 'Nenhuma observação registrada.'
                      : 'Nenhuma observação desse tipo.'}
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {obsFiltered.map(o => {
                    const autor = resolverNomePerfil(o.profiles)
                    return (
                      <li
                        key={o.id}
                        className={cn(
                          'card-surface p-4 space-y-2 border-l-2',
                          borderTipo[o.tipo] ?? 'border-line',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn(
                            'inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium',
                            chipTipo[o.tipo] ?? 'bg-surface-subtle text-ink-muted',
                          )}>
                            {labelTipo[o.tipo] ?? o.tipo}
                          </span>
                          <div className="flex items-center gap-2 text-[11px] text-ink-subtle tabular-nums">
                            {autor && <span className="text-ink-muted">{autor}</span>}
                            <span>{new Date(o.created_at).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                        <p className="text-[13px] text-ink-secondary leading-relaxed">{o.texto}</p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ── Incidentes ── */}
          {abaAtiva === 'incidentes' && (
            <div className="space-y-3">
              {incidentes.length === 0 ? (
                <div className="card-surface p-8 text-center">
                  <p className="text-[13px] text-ink-muted">Nenhum incidente vinculado.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {incidentes.map(inc => (
                    <li
                      key={inc.id}
                      className={cn(
                        'card-surface p-4 space-y-2.5 border-l-2',
                        urgBorder[inc.urgencia] ?? 'border-line',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <p className="text-[13px] font-medium text-ink leading-snug">{inc.tipo}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                              urgChip[inc.urgencia],
                            )}>
                              <AlertTriangle className="h-2.5 w-2.5" />
                              {urgLabel[inc.urgencia]}
                            </span>
                            <IncStatusChip status={inc.status} />
                            <span className="text-[11px] text-ink-muted tabular-nums">
                              {new Date(inc.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[13px] text-ink-secondary leading-relaxed line-clamp-3">
                        {inc.descricao}
                      </p>
                      {inc.solucao && (
                        <div className="rounded-md bg-urg-lowBg/40 border border-urg-lowFg/15 px-3 py-2 text-[12px] text-urg-lowFg">
                          <span className="font-medium">Solução:</span> {inc.solucao}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <NovaObservacaoDialog
        open={obsAberta}
        onOpenChange={setObsAberta}
        professorId={professor.id}
      />
    </div>
  )
}

// ─── Incident status chip ─────────────────────────────────────────────────────

function IncStatusChip({ status }: { status: 'pendente' | 'aprovado' | 'rejeitado' }) {
  if (status === 'aprovado') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-urg-lowBg px-2 py-0.5 text-[11px] font-medium text-urg-lowFg">
      <CheckCircle2 className="h-2.5 w-2.5" />Aprovado
    </span>
  )
  if (status === 'rejeitado') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-ink-muted">
      <XCircle className="h-2.5 w-2.5" />Rejeitado
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-urg-medBg px-2 py-0.5 text-[11px] font-medium text-urg-medFg">
      <Hourglass className="h-2.5 w-2.5" />Pendente
    </span>
  )
}
