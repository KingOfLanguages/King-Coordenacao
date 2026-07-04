import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Plus, Eye, EyeOff, AlertTriangle, Pencil, Trash2, FileWarning,
  CalendarDays, Clock, DollarSign, Users, User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useProfessor, useAtualizarMonitoramento, useAtualizarGrupoProfessor } from '@/hooks/useProfessores'
import { useProfessorAcompanhamento, faixaCls, type ProfessorAcompanhamento, type ProfessorScoreHistoricoRow, type ProfessorAlunoKms } from '@/hooks/useProfessorAcompanhamento'
import { useNexusDados, type NexusIncidente, type NexusTracking, type NexusAlerta } from '@/hooks/useNexusDados'
import { useResolverObservacao, type ObservacaoSnapshot } from '@/hooks/useObservacoes'
import { useGrupos } from '@/hooks/useGrupos'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { PrioridadeBadge } from '@/components/professores/PrioridadeBadge'
import { StatusBadge } from '@/components/professores/StatusBadge'
import { NovaObservacaoDialog } from '@/components/professores/NovaObservacaoDialog'
import { ObservacaoSnapshotDetalhe } from '@/components/professores/ObservacaoSnapshotDetalhe'
import { EditarReuniaoProfessorDialog } from '@/components/professores/EditarReuniaoProfessorDialog'
import { ExcluirReuniaoProfessorDialog } from '@/components/professores/ExcluirReuniaoProfessorDialog'
import { ColocarEmMesAnaliseDialog } from '@/components/mesAnalise/ColocarEmMesAnaliseDialog'
import { ResolverMesAnaliseDialog } from '@/components/mesAnalise/ResolverMesAnaliseDialog'
import { NovoIncidenteDialog } from '@/components/incidentes/NovoIncidenteDialog'
import { cn, tempoDeCasaLabel } from '@/lib/utils'
import { urgenciaChip, urgenciaBorda, nivelLabel, nivelChip, statusEscalonamento } from '@/lib/nexusLabels'
import { labelTipo, dotTipo, borderTipo, chipTipo } from '@/lib/observacaoLabels'
import type { StatusProfessor } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type PerfilRef = { nome: string } | { nome: string }[] | null | undefined

type ReuniaoRow = {
  id: string
  status: 'pendente' | 'realizada' | 'cancelada'
  numero: number | null
  observacao: string | null
  confirmado_em: string | null
  confirmado_por?: PerfilRef
  reuniao?: ({ id: string; data: string; titulo: string | null }
    | { id: string; data: string; titulo: string | null }[]
    | null)
}

type ReuniaoHistorico = {
  id: string
  status: 'pendente' | 'realizada' | 'cancelada'
  numero: number | null
  observacao: string | null
  data: string
  reuniaoId: string | null
}

type ObservacaoRow = {
  id: string
  tipo: string
  texto: string
  created_at: string
  snapshot?: ObservacaoSnapshot | null
  resolvido?: boolean
  resolvido_em?: string | null
  profiles?: { nome: string } | { nome: string }[] | null
}

// ─── Observation filters ──────────────────────────────────────────────────────

type ObsFiltro = 'todos' | 'feedback_positivo' | 'feedback_negativo' | 'feedback_neutro' | 'reuniao' | 'ocorrencia'

const FILTROS: { value: ObsFiltro; label: string }[] = [
  { value: 'todos',             label: 'Todos' },
  { value: 'feedback_positivo', label: 'Positivos' },
  { value: 'feedback_negativo', label: 'Negativos' },
  { value: 'feedback_neutro',   label: 'Neutros' },
  { value: 'reuniao',           label: 'Reuniões' },
  { value: 'ocorrencia',        label: 'Ocorrências' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ProfessorDetalhePage() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const { data: professor, isLoading } = useProfessor(id!)
  const { data: acompanhamentoData } = useProfessorAcompanhamento(id)
  const { data: nexusData } = useNexusDados(id)
  const atualizarMonitoramento = useAtualizarMonitoramento()
  const atualizarGrupo = useAtualizarGrupoProfessor()
  const resolverObservacao = useResolverObservacao()
  const { profile } = useAuth()
  const { data: grupos = [] } = useGrupos()
  const podeEditar = canEdit(profile)
  const [obsAberta, setObsAberta] = useState(false)
  const [obsFiltro, setObsFiltro] = useState<ObsFiltro>('todos')
  const [colocarMesAnaliseAberto, setColocarMesAnaliseAberto] = useState(false)
  const [resolverMesAnaliseAberto, setResolverMesAnaliseAberto] = useState(false)
  const [novoIncidenteAberto, setNovoIncidenteAberto] = useState(false)
  const [editarReuniaoAlvo, setEditarReuniaoAlvo] = useState<ReuniaoHistorico | null>(null)
  const [excluirReuniaoAlvo, setExcluirReuniaoAlvo] = useState<string | null>(null)
  const [obsExpandidas, setObsExpandidas] = useState<Set<string>>(new Set())

  // Deriva do que useNexusDados já busca — sem query extra.
  const emMesAnalise = nexusData?.incidentes.find(i => i.problem_type === 'Mês de análise' && !i.resolved) ?? null

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

  const observacoes = (professor.observacoes ?? []) as ObservacaoRow[]

  const reunioes = ((professor.reuniao_professores ?? []) as ReuniaoRow[])
    .map(r => {
      const reuniao = Array.isArray(r.reuniao) ? r.reuniao[0] : r.reuniao
      return {
        ...r,
        data: reuniao?.data ?? r.confirmado_em,
        reuniaoId: reuniao?.id ?? null,
        confirmadoPorNome: resolverNomePerfil(r.confirmado_por),
      }
    })
    .filter((r): r is typeof r & { data: string } => !!r.data)
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

  const grupoNome = resolverNomePerfil(professor.grupo)
  const coordNome = resolverNomePerfil(professor.coordenador)
  const tempoCasa = tempoDeCasaLabel(professor.data_inicio)

  const obsFiltered = obsFiltro === 'todos'
    ? observacoes
    : observacoes.filter(o => o.tipo === obsFiltro)

  const negativos  = observacoes.filter(o => o.tipo === 'feedback_negativo').length
  const positivos  = observacoes.filter(o => o.tipo === 'feedback_positivo').length

  function resolverNomePerfil(profiles: PerfilRef): string | null {
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
            {emMesAnalise && (
              <button
                onClick={() => podeEditar && setResolverMesAnaliseAberto(true)}
                disabled={!podeEditar}
                className="btn-press inline-flex items-center gap-1 rounded-full bg-urg-highBg text-urg-highFg px-2.5 py-1 text-[11px] font-medium disabled:cursor-default"
              >
                <AlertTriangle className="h-3 w-3" />Em Mês de Análise
              </button>
            )}
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
              <span className="inline-flex items-center gap-1.5 text-urg-highFg font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-urg-highFg" />
                {negativos} feedback{negativos !== 1 ? 's' : ''} negativo{negativos !== 1 ? 's' : ''}
              </span>
            )}
            {positivos > 0 && (
              <span className="inline-flex items-center gap-1.5 text-urg-lowFg font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-urg-lowFg" />
                {positivos} positivo{positivos !== 1 ? 's' : ''}
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
                <SelectTrigger size="sm" className="w-[150px] bg-surface-canvas border-line text-ink">
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
          {podeEditar && (
            <Button
              variant="outline" size="sm"
              className="btn-press border-line text-ink-secondary hover:text-ink gap-1.5"
              onClick={() => setNovoIncidenteAberto(true)}
            >
              <FileWarning className="h-3.5 w-3.5" />Incidente
            </Button>
          )}
          {podeEditar && !emMesAnalise && (
            <Button
              variant="outline" size="sm"
              className="btn-press border-urg-highFg/30 text-urg-highFg hover:bg-urg-highBg gap-1.5"
              onClick={() => setColocarMesAnaliseAberto(true)}
            >
              <AlertTriangle className="h-3.5 w-3.5" />Mês de Análise
            </Button>
          )}
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

      {/* ── Acompanhamento (API KMS) ── */}
      {acompanhamentoData?.acompanhamento && (
        <AcompanhamentoSection
          acompanhamento={acompanhamentoData.acompanhamento}
          historico={acompanhamentoData.historico}
          alunos={acompanhamentoData.alunos}
        />
      )}

      {/* ── Alunos vinculados (KMS) ── */}
      {acompanhamentoData?.alunos && acompanhamentoData.alunos.length > 0 && (
        <AlunosKmsSection alunos={acompanhamentoData.alunos} />
      )}

      {/* ── Ocorrências (King Nexus) ── */}
      {nexusData && (nexusData.incidentes.length > 0 || nexusData.tracking || nexusData.alertas.length > 0) && (
        <NexusSection
          incidentes={nexusData.incidentes}
          tracking={nexusData.tracking}
          alertas={nexusData.alertas}
        />
      )}

      {/* ── Main grid ── */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Reuniões */}
        <section className="card-surface p-5 space-y-3 self-start">
          <h2 className="label-micro">Reuniões ({reunioes.length})</h2>
          {reunioes.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Nenhuma reunião registrada.</p>
          ) : (
            <ul className="space-y-2.5">
              {reunioes.slice(0, 10).map(r => (
                <li key={r.id} className="space-y-1 pb-2.5 border-b border-line-soft last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="text-ink tabular-nums">
                      {new Date(r.data).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </span>
                    <div className="flex items-center gap-1">
                      {r.status === 'realizada' && r.numero && (
                        <span className="text-[11px] text-ink-muted tabular-nums">{r.numero}º</span>
                      )}
                      <StatusBadge status={r.status} />
                      {podeEditar && (
                        <>
                          <button
                            onClick={() => setEditarReuniaoAlvo(r)}
                            title="Editar reunião"
                            className="btn-press flex h-5 w-5 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-subtle hover:text-ink"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setExcluirReuniaoAlvo(r.id)}
                            title="Excluir reunião"
                            className="btn-press flex h-5 w-5 items-center justify-center rounded-full text-ink-subtle hover:bg-urg-highBg hover:text-urg-highFg"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {r.observacao && (
                    <p className="text-[12px] text-ink-secondary leading-relaxed">{r.observacao}</p>
                  )}
                  {r.confirmadoPorNome && (
                    <p className="text-[10.5px] text-ink-subtle">Confirmado por {r.confirmadoPorNome}</p>
                  )}
                </li>
              ))}
              {reunioes.length > 10 && (
                <li className="pt-1 text-[12px] text-ink-muted">
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
                  {f.value !== 'todos' && (
                    <span className={cn('h-1.5 w-1.5 rounded-full', dotTipo[f.value])} />
                  )}
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
                const temSnapshot = !!o.snapshot
                const expandida = obsExpandidas.has(o.id)
                return (
                  <li
                    key={o.id}
                    className={cn(
                      'card-surface p-4 space-y-2 border-l-2',
                      borderTipo[o.tipo] ?? 'border-line',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {temSnapshot ? (
                        <Link
                          to={`/observacoes/${o.id}`}
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium hover:opacity-80 transition-opacity',
                            chipTipo[o.tipo] ?? 'bg-surface-subtle text-ink-muted',
                          )}
                        >
                          {labelTipo[o.tipo] ?? o.tipo}
                        </Link>
                      ) : (
                        <span className={cn(
                          'inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium',
                          chipTipo[o.tipo] ?? 'bg-surface-subtle text-ink-muted',
                        )}>
                          {labelTipo[o.tipo] ?? o.tipo}
                        </span>
                      )}
                      <div className="flex items-center gap-2 text-[11px] text-ink-subtle tabular-nums">
                        {autor && <span className="text-ink-muted">{autor}</span>}
                        <span>{new Date(o.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                    <p className="text-[13px] text-ink-secondary leading-relaxed">{o.texto}</p>
                    {o.tipo === 'ocorrencia' && (
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                          o.resolvido ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-urg-highBg text-urg-highFg',
                        )}>
                          {o.resolvido ? 'Resolvida' : 'Em aberto'}
                        </span>
                        {podeEditar && (
                          <button
                            onClick={() => resolverObservacao.mutate({ id: o.id, resolvido: !o.resolvido })}
                            disabled={resolverObservacao.isPending}
                            className="btn-press text-[11px] text-accentBlue font-medium"
                          >
                            {o.resolvido ? 'Reabrir' : 'Marcar como resolvida'}
                          </button>
                        )}
                      </div>
                    )}
                    {temSnapshot && (
                      <div className="pt-1 border-t border-line-soft">
                        <button
                          onClick={() => setObsExpandidas(prev => {
                            const next = new Set(prev)
                            if (next.has(o.id)) next.delete(o.id); else next.add(o.id)
                            return next
                          })}
                          className="btn-press text-[11px] text-accentBlue font-medium pt-1.5"
                        >
                          {expandida ? 'Ocultar contexto no momento' : 'Ver contexto no momento'}
                        </button>
                        {expandida && (
                          <div className="pt-2">
                            <ObservacaoSnapshotDetalhe snapshot={o.snapshot!} compact />
                          </div>
                        )}
                      </div>
                    )}
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
      <ColocarEmMesAnaliseDialog
        open={colocarMesAnaliseAberto}
        onOpenChange={setColocarMesAnaliseAberto}
        professorFixo={{ id: professor.id, nome: professor.nome }}
      />
      <ResolverMesAnaliseDialog
        open={resolverMesAnaliseAberto}
        onOpenChange={setResolverMesAnaliseAberto}
        incidente={emMesAnalise ? {
          id: emMesAnalise.id,
          teacher_name: professor.nome,
          solution: emMesAnalise.solution,
          professor_id: professor.id,
        } : null}
      />
      <EditarReuniaoProfessorDialog
        open={!!editarReuniaoAlvo}
        onOpenChange={o => !o && setEditarReuniaoAlvo(null)}
        participacao={editarReuniaoAlvo}
      />
      <ExcluirReuniaoProfessorDialog
        open={!!excluirReuniaoAlvo}
        onOpenChange={o => !o && setExcluirReuniaoAlvo(null)}
        participanteId={excluirReuniaoAlvo}
      />
      <NovoIncidenteDialog
        open={novoIncidenteAberto}
        onOpenChange={setNovoIncidenteAberto}
        professorFixo={{ id: professor.id, nome: professor.nome }}
      />
    </div>
  )
}

// ─── Acompanhamento (score/alertas — API de Acompanhamento de Professores) ────

function AcompanhamentoSection({
  acompanhamento, historico, alunos,
}: {
  acompanhamento: ProfessorAcompanhamento
  historico: ProfessorScoreHistoricoRow[]
  alunos: ProfessorAlunoKms[]
}) {
  const temFaltasOuNoShow = (acompanhamento.faltas_professor?.quantidade ?? 0) > 0
    || (acompanhamento.no_show_primeira_aula?.quantidade ?? 0) > 0

  const alertasLista = [
    acompanhamento.aulas_pendentes_qtd > 0 &&
      { label: `${acompanhamento.aulas_pendentes_qtd} aula(s) pendente(s)`, detalhe: acompanhamento.aulas_pendentes_data_mais_antiga },
    (acompanhamento.faltas_professor?.quantidade ?? 0) > 0 &&
      { label: `${acompanhamento.faltas_professor!.quantidade} falta(s) do professor`, detalhe: null },
    (acompanhamento.no_show_primeira_aula?.quantidade ?? 0) > 0 &&
      { label: `${acompanhamento.no_show_primeira_aula!.quantidade} no-show de 1ª aula`, detalhe: null },
    (acompanhamento.agendas_bloqueadas?.quantidade_horarios ?? 0) > 0 &&
      { label: `${acompanhamento.agendas_bloqueadas!.quantidade_horarios} horário(s) bloqueado(s)`, detalhe: null },
  ].filter(Boolean) as { label: string; detalhe: string | null }[]

  const alunosMap = new Map(alunos.map(a => [a.aluno_id, a]))
  const av = acompanhamento.avaliacao_alunos
  const estrelasBreakdown = [
    { n: 5, qtd: av?.estrelas_5 ?? 0 },
    { n: 4, qtd: av?.estrelas_4 ?? 0 },
    { n: 3, qtd: av?.estrelas_3 ?? 0 },
    { n: 2, qtd: av?.estrelas_2 ?? 0 },
    { n: 1, qtd: av?.estrelas_1 ?? 0 },
  ]

  return (
    <section className="card-surface p-5 space-y-4">
      <h2 className="label-micro">Acompanhamento</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Score */}
        <div className="space-y-1.5">
          <p className="text-[11px] text-ink-muted">Score</p>
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-ink tabular-nums">{acompanhamento.score_atual ?? '—'}</span>
            {acompanhamento.score_faixa && (
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', faixaCls[acompanhamento.score_faixa] ?? 'bg-surface-subtle text-ink-secondary')}>
                {acompanhamento.score_faixa}
              </span>
            )}
          </div>
          <p className="text-[11px] text-ink-muted">
            {acompanhamento.elegivel_alocacao ? 'Elegível para alocação' : 'Não elegível para alocação'}
          </p>
        </div>

        {/* Reunião de monitoramento (KMS) */}
        <div className="space-y-1.5">
          <p className="text-[11px] text-ink-muted">Reunião de monitoramento</p>
          <p className="text-[13px] text-ink capitalize">{acompanhamento.reuniao_status?.replace(/_/g, ' ') ?? '—'}</p>
          {acompanhamento.reuniao_proxima && (
            <p className="text-[11px] text-ink-muted">
              Próxima: {new Date(acompanhamento.reuniao_proxima).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>

        {/* Avaliação dos alunos */}
        <div className="space-y-1.5">
          <p className="text-[11px] text-ink-muted">Avaliação dos alunos</p>
          {av?.total_avaliacoes ? (
            <>
              <p className="text-[13px] text-ink tabular-nums">
                {av.media_estrelas?.toFixed(2) ?? '—'} ★ ({av.total_avaliacoes})
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-ink-muted tabular-nums">
                {estrelasBreakdown.map(e => (
                  <span key={e.n}>{e.n}★ {e.qtd}</span>
                ))}
              </div>
              <p className="text-[11px] text-ink-muted">
                {av.comentarios_positivos ?? 0} coment. positivos · {av.comentarios_negativos ?? 0} negativos
              </p>
            </>
          ) : (
            <p className="text-[13px] text-ink-muted">Sem avaliações no período.</p>
          )}
        </div>
      </div>

      {acompanhamento.turnover_saida && (
        <div className="rounded-lg bg-surface-subtle p-3 space-y-1">
          <p className="text-[11px] text-ink-muted">Saída do professor</p>
          <p className="text-[13px] text-ink">
            {acompanhamento.turnover_saida.motivo ?? 'Motivo não informado'}
            {acompanhamento.turnover_saida.data && (
              <span className="text-ink-muted"> · {new Date(acompanhamento.turnover_saida.data).toLocaleDateString('pt-BR')}</span>
            )}
          </p>
          {(acompanhamento.turnover_saida.quantidade_alunos_realocados ?? 0) > 0 && (
            <p className="text-[11px] text-urg-medFg font-medium">
              {acompanhamento.turnover_saida.quantidade_alunos_realocados} aluno(s) precisaram ser realocados
            </p>
          )}
        </div>
      )}

      {historico.length > 1 && <ScoreHistoricoChart historico={historico} />}

      {alertasLista.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] text-ink-muted">Alertas ativos</p>
          <div className="flex flex-wrap gap-2">
            {alertasLista.map((a, i) => (
              <span key={i} className="inline-flex items-center rounded-full bg-urg-medBg text-urg-medFg px-2.5 py-1 text-[11px] font-medium">
                {a.label}
              </span>
            ))}
          </div>
          {temFaltasOuNoShow && (
            <p className="text-[10.5px] text-ink-subtle italic">
              Faltas e no-show trazem só contagem e datas — a origem dos dados não vincula a um aluno específico.
            </p>
          )}
        </div>
      )}

      {(acompanhamento.trocas_professor?.length ?? 0) > 0 && (
        <TrocasProfessorList trocas={acompanhamento.trocas_professor!} alunosMap={alunosMap} />
      )}
    </section>
  )
}

// ─── Trocas de professor — cruzadas com nomes de alunos (KMS) ─────────────────

type TrocaProfessor = NonNullable<ProfessorAcompanhamento['trocas_professor']>[number]

const statusTrocaCls: Record<string, string> = {
  Concluido: 'bg-urg-lowBg text-urg-lowFg',
  Erro: 'bg-urg-highBg text-urg-highFg',
  SemProfessorDisponivel: 'bg-urg-medBg text-urg-medFg',
}

function TrocasProfessorList({
  trocas, alunosMap,
}: {
  trocas: TrocaProfessor[]
  alunosMap: Map<number, ProfessorAlunoKms>
}) {
  const [expandido, setExpandido] = useState(false)
  const visiveis = expandido ? trocas : trocas.slice(0, 5)

  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-[11px] text-ink-muted">Trocas de professor ({trocas.length})</p>
      <ul className="space-y-1.5">
        {visiveis.map((t, i) => {
          const aluno = alunosMap.get(t.aluno_id)
          return (
            <li key={i} className="flex items-center justify-between gap-2 text-[12px] flex-wrap">
              <span className="text-ink-secondary inline-flex items-center gap-1.5 flex-wrap">
                {aluno?.primeiro_nome ?? `Aluno #${t.aluno_id}`}
                {t.motivo && <span className="text-ink-muted">· {t.motivo}</span>}
                {t.status && (
                  <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium', statusTrocaCls[t.status] ?? 'bg-surface-subtle text-ink-muted')}>
                    {t.status}
                  </span>
                )}
              </span>
              <span className="text-ink-subtle tabular-nums flex-shrink-0">
                {new Date(t.data).toLocaleDateString('pt-BR')}
              </span>
            </li>
          )
        })}
      </ul>
      {trocas.length > 5 && (
        <button
          onClick={() => setExpandido(v => !v)}
          className="btn-press text-[11px] text-accentBlue font-medium"
        >
          {expandido ? 'Ver menos' : `+ ${trocas.length - 5} mais`}
        </button>
      )}
    </div>
  )
}

// ─── Alunos vinculados (KMS) ───────────────────────────────────────────────────

function AlunosKmsSection({ alunos }: { alunos: ProfessorAlunoKms[] }) {
  const [expandido, setExpandido] = useState(false)

  const porStatus = new Map<string, number>()
  for (const a of alunos) {
    const chave = a.status_vinculo ?? 'Outro'
    porStatus.set(chave, (porStatus.get(chave) ?? 0) + 1)
  }
  const ordenados = [...alunos].sort((a, b) => (a.primeiro_nome ?? '').localeCompare(b.primeiro_nome ?? ''))
  const visiveis = expandido ? ordenados : ordenados.slice(0, 16)

  return (
    <section className="card-surface p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <h2 className="label-micro">Alunos (KMS)</h2>
        <p className="text-[11px] text-ink-muted">
          {[...porStatus.entries()].map(([status, qtd]) => `${qtd} ${status}`).join(' · ')}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visiveis.map(a => (
          <span
            key={a.aluno_id}
            title={[
              a.status_vinculo,
              a.data_adicao ? `adicionado em ${new Date(a.data_adicao).toLocaleDateString('pt-BR')}` : null,
            ].filter(Boolean).join(' · ') || undefined}
            className="inline-flex items-center rounded-full bg-surface-subtle text-ink-secondary px-2 py-0.5 text-[11px] cursor-help"
          >
            {a.primeiro_nome ?? `Aluno #${a.aluno_id}`}
          </span>
        ))}
      </div>
      {ordenados.length > 16 && (
        <button
          onClick={() => setExpandido(v => !v)}
          className="btn-press text-[12px] text-accentBlue font-medium"
        >
          {expandido ? 'Ver menos' : `+ ${ordenados.length - 16} mais`}
        </button>
      )}
    </section>
  )
}

function ScoreHistoricoChart({ historico }: { historico: ProfessorScoreHistoricoRow[] }) {
  const W = 560, H = 100, padL = 24, padB = 16, padT = 8, padR = 8
  const maxY = Math.max(...historico.map(h => h.score), 1)
  const minY = Math.min(...historico.map(h => h.score), 0)
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const x = (i: number) => padL + (historico.length === 1 ? innerW / 2 : (i / (historico.length - 1)) * innerW)
  const y = (v: number) => padT + innerH - ((v - minY) / Math.max(maxY - minY, 1)) * innerH
  const points = historico.map((h, i) => `${x(i)},${y(h.score)}`).join(' ')

  return (
    <div className="pt-1">
      <p className="text-[11px] text-ink-muted mb-1">Evolução do score</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-ink-muted" role="img" aria-label="Evolução do score">
        <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="currentColor" strokeWidth="1" opacity="0.2" />
        <polyline points={points} fill="none" stroke="var(--accent-blue)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {historico.map((h, i) => (
          <g key={h.ano_mes}>
            <circle cx={x(i)} cy={y(h.score)} r="2.5" fill="var(--accent-blue)" />
            <text x={x(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="currentColor">
              {String(h.ano_mes).slice(4)}/{String(h.ano_mes).slice(2, 4)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ─── Ocorrências (King Nexus) ──────────────────────────────────────────────────

function NexusSection({
  incidentes, tracking, alertas,
}: {
  incidentes: NexusIncidente[]
  tracking: NexusTracking | null
  alertas: NexusAlerta[]
}) {
  const [expandido, setExpandido] = useState(false)
  const abertas = incidentes.filter(i => !i.resolved).length
  const visiveis = expandido ? incidentes : incidentes.slice(0, 5)

  return (
    <section className="card-surface p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="label-micro">Ocorrências (King Nexus)</h2>
        {abertas > 0 && (
          <span className="text-[11px] text-urg-highFg font-medium">{abertas} em aberto</span>
        )}
      </div>

      {(tracking || alertas.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {tracking && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-ink-muted">Escalonamento</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', statusEscalonamento(tracking).cls)}>
                  {statusEscalonamento(tracking).label}
                </span>
                {tracking.recurrence_count > 0 && (
                  <span className="text-[11px] text-ink-muted">{tracking.recurrence_count} reincidência(s)</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] pt-0.5">
                {[
                  { sent: tracking.first_message_sent, label: '1ª mensagem' },
                  { sent: tracking.second_message_sent, label: '2ª mensagem' },
                  { sent: tracking.third_message_sent, label: '3ª mensagem' },
                ].map(e => (
                  <span key={e.label} className={cn('inline-flex items-center gap-1', e.sent ? 'text-ink' : 'text-ink-subtle')}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', e.sent ? 'bg-accentBlue' : 'bg-line')} />
                    {e.label}
                  </span>
                ))}
              </div>
              {tracking.next_message_due && !tracking.problem_resolved && (
                <p className="text-[11px] text-ink-muted">
                  Próxima mensagem: {new Date(tracking.next_message_due).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          )}

          {alertas.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-ink-muted">Alertas de mês de análise</p>
              <div className="flex flex-wrap gap-1.5">
                {alertas.map(a => (
                  <span key={a.id} className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', nivelChip[a.level] ?? 'bg-surface-subtle text-ink-secondary')}>
                    {nivelLabel[a.level] ?? a.level} · {a.total_count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {incidentes.length === 0 ? (
        <p className="text-[13px] text-ink-muted">Nenhuma ocorrência registrada no Nexus.</p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {visiveis.map(i => (
              <li
                key={i.id}
                className={cn('card-surface p-3.5 space-y-1.5 border-l-2', urgenciaBorda[i.urgency] ?? 'border-line')}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className={cn('inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium', urgenciaChip[i.urgency] ?? 'bg-surface-subtle text-ink-secondary')}>
                      {i.urgency}
                    </span>
                    <span className="text-[12px] text-ink font-medium">{i.problem_type}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    {i.resolved
                      ? <span className="text-urg-lowFg font-medium">Resolvida</span>
                      : <span className="text-urg-highFg font-medium">Em aberto</span>}
                    <span className="text-ink-subtle tabular-nums">
                      {new Date(i.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
                <p className="text-[13px] text-ink-secondary leading-relaxed">{i.description}</p>
                {i.solution && (
                  <p className="text-[12px] text-ink-muted leading-relaxed">
                    <span className="text-ink-subtle">Solução: </span>{i.solution}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {incidentes.length > 5 && (
            <button
              onClick={() => setExpandido(v => !v)}
              className="btn-press text-[12px] text-accentBlue font-medium"
            >
              {expandido ? 'Ver menos' : `+ ${incidentes.length - 5} mais`}
            </button>
          )}
        </>
      )}
    </section>
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
