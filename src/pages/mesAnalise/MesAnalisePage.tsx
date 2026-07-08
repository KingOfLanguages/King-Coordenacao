import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  useMesAnaliseIncidentes, useMesAnaliseSugestoes, useAlunosKmsPorProfessores, useReabrirMesAnalise,
  MES_ANALISE_TRIGGER_TYPES,
  type MesAnaliseIncidente, type MesAnaliseSugestao,
} from '@/hooks/useMesAnalise'
import { ColocarEmMesAnaliseDialog } from '@/components/mesAnalise/ColocarEmMesAnaliseDialog'
import { ResolverMesAnaliseDialog } from '@/components/mesAnalise/ResolverMesAnaliseDialog'
import { nivelLabel, nivelChip } from '@/lib/nexusLabels'
import { cn } from '@/lib/utils'

type Aba = 'pendentes' | 'concluidos' | 'sugestoes'

function diasDesde(dataIso: string): number {
  return Math.floor((Date.now() - new Date(dataIso).getTime()) / 86_400_000)
}

function statusPrazo(dataIso: string): { label: string; cls: string; vencido: boolean } {
  const dias = diasDesde(dataIso)
  if (dias >= 30) return { label: `Vencido (${dias}d)`, cls: 'bg-urg-highBg text-urg-highFg', vencido: true }
  return { label: `${30 - dias}d restantes`, cls: 'bg-urg-medBg text-urg-medFg', vencido: false }
}

export function MesAnalisePage() {
  const navigate = useNavigate()
  const { data: incidentes = [], isLoading } = useMesAnaliseIncidentes()
  const { data: sugestoesData, isLoading: carregandoSugestoes } = useMesAnaliseSugestoes()

  const [aba, setAba]     = useState<Aba>('pendentes')
  const [busca, setBusca] = useState('')

  const [colocarAberto, setColocarAberto]   = useState(false)
  const [colocarPreset, setColocarPreset]   = useState<{
    professorFixo?: { id: string; nome: string }
    descricaoInicial?: string
    urgenciaInicial?: string
  }>({})
  const [resolverAlvo, setResolverAlvo] = useState<MesAnaliseIncidente | null>(null)
  const [reabrirAlvo, setReabrirAlvo]   = useState<MesAnaliseIncidente | null>(null)

  const pendentes  = useMemo(() => incidentes.filter(i => !i.resolved), [incidentes])
  const concluidos = useMemo(() => incidentes.filter(i => i.resolved), [incidentes])

  const stats = {
    total:      incidentes.length,
    pendentes:  pendentes.length,
    vencidos:   pendentes.filter(i => diasDesde(i.created_at) >= 30).length,
    resolvidos: concluidos.length,
  }
  const progresso = stats.total > 0 ? Math.round((stats.resolvidos / stats.total) * 100) : 0

  const listaBase = aba === 'pendentes' ? pendentes : aba === 'concluidos' ? concluidos : []
  const termo = busca.trim().toLowerCase()
  const listaFiltrada = termo
    ? listaBase.filter(i =>
        i.teacher_name.toLowerCase().includes(termo) ||
        i.coordinator.toLowerCase().includes(termo) ||
        i.description.toLowerCase().includes(termo))
    : listaBase

  const idsVisiveisLista = listaFiltrada.map(i => i.professor_id).filter((v): v is string => !!v)
  const idsVisiveisSugestoes = (sugestoesData?.sugestoes ?? []).map(s => s.professor_id)
  const idsAlunos = aba === 'sugestoes' ? idsVisiveisSugestoes : idsVisiveisLista
  const { data: alunosKms = [] } = useAlunosKmsPorProfessores(idsAlunos)

  const alunosPorProfessor = useMemo(() => {
    const m = new Map<string, { total: number; nomes: string[] }>()
    for (const a of alunosKms) {
      const entry = m.get(a.professor_id) ?? { total: 0, nomes: [] }
      entry.total += 1
      if (a.primeiro_nome) entry.nomes.push(a.primeiro_nome)
      m.set(a.professor_id, entry)
    }
    return m
  }, [alunosKms])

  // Quantas vezes cada professor já passou por Mês de Análise (todos os registros, pendentes + concluídos).
  const recorrenciaPorProfessor = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of incidentes) {
      if (i.professor_id) m.set(i.professor_id, (m.get(i.professor_id) ?? 0) + 1)
    }
    return m
  }, [incidentes])

  function abrirColocarManual() {
    setColocarPreset({})
    setColocarAberto(true)
  }

  function abrirColocarDeSugestao(s: MesAnaliseSugestao) {
    const breakdown = s.porTipo.map(t => `${t.tipo} ×${t.quantidade}`).join(', ')
    setColocarPreset({
      professorFixo: { id: s.professor_id, nome: s.professor_nome },
      descricaoInicial: `Marcado a partir da sugestão de Mês de Análise. Total de ${s.totalCount} incidente(s) negativo(s): ${breakdown}.`,
      urgenciaInicial: s.nivel === 'critico' ? 'Alta' : s.nivel === 'alerta' ? 'Média' : 'Baixa',
    })
    setColocarAberto(true)
  }

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Mês de Análise</h1>
          <p className="text-[13px] text-ink-muted">Acompanhamento de 30 dias, integrado ao King Nexus.</p>
        </div>
        <Button
          size="sm"
          className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white gap-1.5"
          onClick={abrirColocarManual}
        >
          <Plus className="h-3.5 w-3.5" />Colocar em Mês de Análise
        </Button>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-surface p-4">
          <p className="text-[11px] text-ink-muted">Total</p>
          <p className="text-2xl font-semibold text-ink tabular-nums">{stats.total}</p>
        </div>
        <div className="card-surface p-4">
          <p className="text-[11px] text-ink-muted flex items-center gap-1"><Clock className="h-3 w-3" />Pendentes</p>
          <p className="text-2xl font-semibold text-ink tabular-nums">{stats.pendentes}</p>
        </div>
        <div className="card-surface p-4">
          <p className="text-[11px] text-urg-highFg flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Vencidos (30d+)</p>
          <p className="text-2xl font-semibold text-urg-highFg tabular-nums">{stats.vencidos}</p>
        </div>
        <div className="card-surface p-4">
          <p className="text-[11px] text-urg-lowFg flex items-center gap-1"><CheckCircle className="h-3 w-3" />Resolvidos</p>
          <p className="text-2xl font-semibold text-urg-lowFg tabular-nums">{stats.resolvidos}</p>
        </div>
      </div>

      {/* Progresso */}
      {stats.total > 0 && (
        <div className="card-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium text-ink">Progresso de resolução</span>
            <span className="text-[13px] font-semibold text-ink tabular-nums">{progresso}%</span>
          </div>
          <div className="w-full h-2.5 bg-surface-subtle rounded-full overflow-hidden">
            <div className="h-full bg-accentBlue rounded-full transition-all duration-500" style={{ width: `${progresso}%` }} />
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex items-center gap-1 bg-surface-subtle rounded-full p-1 w-fit">
        {([
          ['pendentes', `Pendentes (${pendentes.length})`],
          ['concluidos', `Concluídos (${concluidos.length})`],
          ['sugestoes', `Sugestões (${sugestoesData?.sugestoes.length ?? 0})`],
        ] as [Aba, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setAba(value)}
            className={cn(
              'btn-press px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-colors',
              aba === value ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {aba !== 'sugestoes' && (
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <Input
            placeholder="Buscar por professor, responsável ou descrição…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-9 bg-surface-canvas border-line"
          />
        </div>
      )}

      {/* Conteúdo */}
      {aba === 'sugestoes' ? (
        <SugestoesTab
          isLoading={carregandoSugestoes}
          sugestoes={sugestoesData?.sugestoes ?? []}
          semIdentificacao={sugestoesData?.semIdentificacao ?? 0}
          alunosPorProfessor={alunosPorProfessor}
          onMarcar={abrirColocarDeSugestao}
          onVerProfessor={id => navigate(`/professores/${id}`)}
        />
      ) : isLoading ? (
        <div className="flex h-48 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
      ) : listaFiltrada.length === 0 ? (
        <div className="card-surface p-8 text-center">
          <p className="text-[13px] text-ink-muted">
            {aba === 'pendentes' ? 'Nenhum professor pendente.' : 'Nenhum professor concluído.'}
          </p>
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-ink-muted uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">{aba === 'pendentes' ? 'Status' : 'Data'}</th>
                <th className="px-4 py-2.5 font-medium">Professor</th>
                <th className="px-4 py-2.5 font-medium">Responsável</th>
                <th className="px-4 py-2.5 font-medium">Descrição</th>
                {aba === 'concluidos' && <th className="px-4 py-2.5 font-medium">Resultado</th>}
                <th className="px-4 py-2.5 font-medium text-center">Ação</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map(i => {
                const prazo = statusPrazo(i.created_at)
                const alunos = i.professor_id ? alunosPorProfessor.get(i.professor_id) : undefined
                return (
                  <tr key={i.id} className={cn('border-b border-line-soft last:border-0', prazo.vencido && aba === 'pendentes' && 'bg-urg-highBg/20')}>
                    <td className="px-4 py-2.5">
                      {aba === 'pendentes' ? (
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', prazo.cls)}>
                          {prazo.label}
                        </span>
                      ) : (
                        <span className="text-ink-muted tabular-nums">{new Date(i.created_at).toLocaleDateString('pt-BR')}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {i.professor_id ? (
                        <button onClick={() => navigate(`/professores/${i.professor_id}`)} className="text-ink font-medium hover:text-accentBlue hover:underline">
                          {i.teacher_name}
                        </button>
                      ) : (
                        <span className="text-ink font-medium">{i.teacher_name}</span>
                      )}
                      {alunos && alunos.total > 0 && (
                        <span
                          title={alunos.nomes.join(', ')}
                          className="ml-2 inline-flex items-center rounded-full bg-surface-subtle text-ink-muted px-1.5 py-0.5 text-[10.5px] tabular-nums cursor-help"
                        >
                          {alunos.total} aluno{alunos.total !== 1 ? 's' : ''}
                        </span>
                      )}
                      {i.professor_id && (recorrenciaPorProfessor.get(i.professor_id) ?? 0) > 1 && (
                        <span
                          title={`Passou ${recorrenciaPorProfessor.get(i.professor_id)}x por Mês de Análise`}
                          className="ml-2 inline-flex items-center rounded-full bg-urg-highBg text-urg-highFg px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums cursor-help"
                        >
                          {recorrenciaPorProfessor.get(i.professor_id)}x
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{i.coordinator}</td>
                    <td className="px-4 py-2.5 text-ink-secondary max-w-[280px] truncate" title={i.description}>{i.description}</td>
                    {aba === 'concluidos' && (
                      <td className="px-4 py-2.5 text-ink-secondary max-w-[220px]">
                        <span className="line-clamp-2" title={i.solution}>{i.solution || '—'}</span>
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-center">
                      {aba === 'pendentes' ? (
                        <button
                          onClick={() => setResolverAlvo(i)}
                          className="btn-press px-3 py-1.5 text-[11.5px] font-medium rounded-md bg-urg-lowBg text-urg-lowFg hover:opacity-80 transition-opacity"
                        >
                          Resolver
                        </button>
                      ) : (
                        <button
                          onClick={() => setReabrirAlvo(i)}
                          className="btn-press px-3 py-1.5 text-[11.5px] font-medium rounded-md bg-urg-medBg text-urg-medFg hover:opacity-80 transition-opacity"
                        >
                          Reabrir
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ColocarEmMesAnaliseDialog
        open={colocarAberto}
        onOpenChange={setColocarAberto}
        professorFixo={colocarPreset.professorFixo}
        descricaoInicial={colocarPreset.descricaoInicial}
        urgenciaInicial={colocarPreset.urgenciaInicial}
      />
      <ResolverMesAnaliseDialog
        open={!!resolverAlvo}
        onOpenChange={o => !o && setResolverAlvo(null)}
        incidente={resolverAlvo}
      />
      <ReabrirConfirmDialog
        incidente={reabrirAlvo}
        onOpenChange={o => !o && setReabrirAlvo(null)}
      />
    </div>
  )
}

// ─── Reabrir — confirmação extra (grava em produção de outro sistema) ─────────

function ReabrirConfirmDialog({
  incidente, onOpenChange,
}: {
  incidente: MesAnaliseIncidente | null
  onOpenChange: (v: boolean) => void
}) {
  const reabrir = useReabrirMesAnalise()

  async function handleConfirmar() {
    if (!incidente) return
    try {
      await reabrir.mutateAsync({ incident_id: incidente.id, professor_id: incidente.professor_id ?? undefined })
      toast.success(`Mês de Análise de ${incidente.teacher_name} reaberto.`)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gravar no Nexus.')
    }
  }

  return (
    <Dialog open={!!incidente} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-canvas border-line text-ink max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-ink font-semibold">Reabrir Mês de Análise?</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-ink-secondary">
          Isso volta <strong className="text-ink">{incidente?.teacher_name}</strong> para "pendente" — a mudança é
          gravada no King Nexus e visível pra quem usa o Nexus também.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-ink-secondary">
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={reabrir.isPending}
            className="btn-press bg-urg-medBg text-urg-medFg hover:opacity-80"
          >
            {reabrir.isPending ? 'Gravando…' : 'Reabrir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Sugestões ─────────────────────────────────────────────────────────────────

function SugestoesTab({
  isLoading, sugestoes, semIdentificacao, alunosPorProfessor, onMarcar, onVerProfessor,
}: {
  isLoading: boolean
  sugestoes: MesAnaliseSugestao[]
  semIdentificacao: number
  alunosPorProfessor: Map<string, { total: number; nomes: string[] }>
  onMarcar: (s: MesAnaliseSugestao) => void
  onVerProfessor: (id: string) => void
}) {
  const contagem = { critico: 0, alerta: 0, observacao: 0 }
  for (const s of sugestoes) contagem[s.nivel]++

  if (isLoading) {
    return <div className="flex h-48 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
  }

  return (
    <div className="space-y-4">
      <div className="card-surface p-4 space-y-3">
        <h3 className="label-micro">Sobre esta sugestão</h3>
        <p className="text-[12.5px] text-ink-muted leading-relaxed">
          Professores que concentram incidentes que podem indicar necessidade de Mês de Análise. Contam só os
          tipos <span className="text-ink font-medium">{MES_ANALISE_TRIGGER_TYPES.join(', ')}</span>.{' '}
          <span className="text-ink">No-Show e Reclamação contam em dobro</span> no cálculo do score. Professores
          já em Mês de Análise não aparecem aqui.
          {semIdentificacao > 0 && (
            <> Existem <strong className="text-ink">{semIdentificacao}</strong> ocorrência(s) desse tipo sem professor
            identificado no King Nexus — não entram na sugestão.</>
          )}
        </p>
        <div className="grid grid-cols-3 gap-2 text-[12px]">
          <div className="rounded-md bg-urg-highBg/40 px-3 py-2 text-center">
            <div className="text-urg-highFg font-bold text-lg tabular-nums">{contagem.critico}</div>
            <div className="text-ink-muted">Crítico (5+)</div>
          </div>
          <div className="rounded-md bg-urg-medBg/40 px-3 py-2 text-center">
            <div className="text-urg-medFg font-bold text-lg tabular-nums">{contagem.alerta}</div>
            <div className="text-ink-muted">Alerta (3–4)</div>
          </div>
          <div className="rounded-md bg-urg-lowBg/40 px-3 py-2 text-center">
            <div className="text-urg-lowFg font-bold text-lg tabular-nums">{contagem.observacao}</div>
            <div className="text-ink-muted">Observação (2)</div>
          </div>
        </div>
      </div>

      {sugestoes.length === 0 ? (
        <div className="card-surface p-8 text-center">
          <p className="text-[13px] text-ink-muted">Nenhum professor atinge o critério mínimo agora.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sugestoes.map(s => {
            const alunos = alunosPorProfessor.get(s.professor_id)
            return (
              <div key={s.professor_id} className="card-surface p-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', nivelChip[s.nivel])}>
                        {nivelLabel[s.nivel]}
                      </span>
                      <button onClick={() => onVerProfessor(s.professor_id)} className="font-semibold text-ink hover:text-accentBlue hover:underline">
                        {s.professor_nome}
                      </button>
                      <span className="text-[12px] text-ink-muted tabular-nums">
                        · {s.totalCount} incidente(s){s.score !== s.totalCount ? ` · score ${s.score}` : ''}
                      </span>
                      {alunos && alunos.total > 0 && (
                        <span title={alunos.nomes.join(', ')} className="inline-flex items-center rounded-full bg-surface-subtle text-ink-muted px-1.5 py-0.5 text-[10.5px] tabular-nums cursor-help">
                          {alunos.total} aluno{alunos.total !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-ink-muted">
                      {s.porTipo.map(t => `${t.tipo} ×${t.quantidade}`).join(' · ')}
                    </p>
                    <p className="text-[11px] text-ink-subtle tabular-nums">
                      Último em {new Date(s.ultimoIncidenteEm).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <button
                    onClick={() => onMarcar(s)}
                    className="btn-press flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium rounded-md bg-urg-highBg text-urg-highFg hover:opacity-80 transition-opacity flex-shrink-0"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Colocar em Mês de Análise
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
