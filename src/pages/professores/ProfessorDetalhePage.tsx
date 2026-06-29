import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Eye, EyeOff,
  CalendarDays, Clock, DollarSign, Users, User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useProfessor, useAtualizarMonitoramento, useAtualizarGrupoProfessor } from '@/hooks/useProfessores'
import { useGrupos } from '@/hooks/useGrupos'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { PrioridadeBadge } from '@/components/professores/PrioridadeBadge'
import { StatusBadge } from '@/components/professores/StatusBadge'
import { NovaObservacaoDialog } from '@/components/professores/NovaObservacaoDialog'
import { cn, tempoDeCasaLabel } from '@/lib/utils'
import type { StatusProfessor } from '@/types'

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
  const atualizarGrupo = useAtualizarGrupoProfessor()
  const { profile } = useAuth()
  const { data: grupos = [] } = useGrupos()
  const podeEditar = canEdit(profile?.role)
  const [obsAberta, setObsAberta] = useState(false)
  const [obsFiltro, setObsFiltro] = useState<ObsFiltro>('todos')

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

  const grupoNome = resolverNomePerfil(professor.grupo)
  const coordNome = resolverNomePerfil(professor.coordenador)
  const tempoCasa = tempoDeCasaLabel(professor.data_inicio)

  const obsFiltered = obsFiltro === 'todos'
    ? observacoes
    : observacoes.filter(o => o.tipo === obsFiltro)

  const negativos  = observacoes.filter(o => o.tipo === 'feedback_negativo').length
  const positivos  = observacoes.filter(o => o.tipo === 'feedback_positivo').length

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
          </div>

          {/* Contadores rápidos */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-muted">
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
          </div>

          {/* KTM — grupo, coordenador, status, tempo de casa */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] pt-0.5">
            <StatusProfessorChip status={professor.status} />

            {podeEditar ? (
              <Select
                value={professor.grupo_id ?? ''}
                onValueChange={v => atualizarGrupo.mutate({ id: professor.id, grupo_id: v })}
                disabled={atualizarGrupo.isPending}
              >
                <SelectTrigger className="h-7 w-[150px] text-[12px] bg-surface-canvas border-line text-ink">
                  <SelectValue placeholder="Sem grupo" />
                </SelectTrigger>
                <SelectContent className="bg-surface-canvas border-line text-ink">
                  {grupos.map(g => (
                    <SelectItem key={g.id} value={g.id} className="text-[12px]">{g.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : grupoNome && (
              <span className="inline-flex items-center gap-1 text-ink-muted">
                <Users className="h-3 w-3" />{grupoNome}
              </span>
            )}

            {coordNome && (
              <span className="inline-flex items-center gap-1 text-ink-muted">
                <User className="h-3 w-3" />{coordNome}
              </span>
            )}
            {tempoCasa && (
              <span className="inline-flex items-center gap-1 text-ink-muted">
                <Clock className="h-3 w-3" />{tempoCasa} de casa
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

        {/* Observações */}
        <div className="space-y-4">
          <h2 className="label-micro">Observações ({observacoes.length})</h2>

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
      </div>

      <NovaObservacaoDialog
        open={obsAberta}
        onOpenChange={setObsAberta}
        professorId={professor.id}
      />
    </div>
  )
}

// ─── Professor status chip ────────────────────────────────────────────────────

function StatusProfessorChip({ status }: { status?: StatusProfessor | string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    ativo:     { label: 'Ativo',     cls: 'bg-urg-lowBg text-urg-lowFg' },
    pausa:     { label: 'Em pausa',  cls: 'bg-surface-subtle text-ink-secondary' },
    desligado: { label: 'Desligado', cls: 'bg-urg-highBg text-urg-highFg' },
  }
  const s = map[status ?? 'ativo'] ?? map.ativo
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', s.cls)}>
      {s.label}
    </span>
  )
}
