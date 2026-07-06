import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, AlertTriangle, CheckCircle, GraduationCap, ArrowDownNarrowWide, ArrowUpNarrowWide, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useIncidentes, useReabrirIncidente,
  CATEGORIAS_PROFESSOR, CATEGORIAS_GERAL, type Incidente,
} from '@/hooks/useIncidentes'
import { NovoIncidenteDialog } from '@/components/incidentes/NovoIncidenteDialog'
import { ResolverIncidenteDialog } from '@/components/incidentes/ResolverIncidenteDialog'
import { ExcluirIncidenteDialog } from '@/components/incidentes/ExcluirIncidenteDialog'
import { urgenciaChip } from '@/lib/nexusLabels'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'

type Aba = 'professor' | 'geral'
type FiltroStatus = 'todos' | 'abertos' | 'resolvidos'
type FiltroUrgencia = 'todas' | 'Baixa' | 'Média' | 'Alta'
type Ordem = 'novo' | 'antigo'

const URG_BAR: Record<string, string> = {
  Baixa: 'bg-urg-lowFg',
  Média: 'bg-urg-medFg',
  Alta:  'bg-urg-highFg',
}

function tempoRelativo(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'há 1 dia'
  return `há ${dias} dias`
}

export function IncidentesPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const podeEditar = canEdit(profile)
  const { data: incidentes = [], isLoading } = useIncidentes()
  const reabrir = useReabrirIncidente()

  const [novoAberto, setNovoAberto] = useState(false)
  const [resolverAlvo, setResolverAlvo] = useState<Incidente | null>(null)
  const [excluirAlvo, setExcluirAlvo] = useState<Incidente | null>(null)
  const [aba, setAba] = useState<Aba>('professor')
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<string>('todas')
  const [status, setStatus] = useState<FiltroStatus>('abertos')
  const [urgenciaFiltro, setUrgenciaFiltro] = useState<FiltroUrgencia>('todas')
  const [professorFiltro, setProfessorFiltro] = useState<string>('todos')
  const [ordem, setOrdem] = useState<Ordem>('novo')

  const porAba = useMemo(
    () => incidentes.filter(i => (aba === 'professor' ? !!i.professor_id : !i.professor_id)),
    [incidentes, aba],
  )

  const categoriasAba = aba === 'professor' ? CATEGORIAS_PROFESSOR : CATEGORIAS_GERAL

  const professoresComIncidente = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const i of porAba) {
      if (i.professor_id) mapa.set(i.professor_id, i.teacher_name)
    }
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [porAba])

  const stats = {
    abertos: porAba.filter(i => !i.resolved).length,
    resolvidos: porAba.filter(i => i.resolved).length,
    urgentes: porAba.filter(i => !i.resolved && i.urgency === 'Alta').length,
    quarto: aba === 'professor'
      ? porAba.filter(i => i.problem_type === 'Reclamação').length
      : porAba.length,
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = porAba.filter(i => {
      if (status === 'abertos' && i.resolved) return false
      if (status === 'resolvidos' && !i.resolved) return false
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
  }, [porAba, busca, categoria, status, urgenciaFiltro, professorFiltro, ordem])

  function trocarAba(novaAba: Aba) {
    setAba(novaAba)
    setCategoria('todas')
    setProfessorFiltro('todos')
  }

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Incidentes</h1>
          <p className="text-[13px] text-ink-muted">
            {aba === 'professor' ? 'Incidentes vinculados a um professor.' : 'Incidentes gerais, de plataforma e questões que não dependem do professor.'}
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
        <button
          onClick={() => trocarAba('professor')}
          className={cn(
            'btn-press px-4 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-200',
            aba === 'professor' ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
          )}
        >
          Professor <span className="text-ink-muted tabular-nums">{incidentes.filter(i => !!i.professor_id).length}</span>
        </button>
        <button
          onClick={() => trocarAba('geral')}
          className={cn(
            'btn-press px-4 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-200',
            aba === 'geral' ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
          )}
        >
          Geral / plataforma <span className="text-ink-muted tabular-nums">{incidentes.filter(i => !i.professor_id).length}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-surface p-4 transition-shadow hover:shadow-sm">
          <p className="text-[11px] text-urg-highFg flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Abertos</p>
          <p className="text-2xl font-semibold text-urg-highFg tabular-nums">{stats.abertos}</p>
        </div>
        <div className="card-surface p-4 transition-shadow hover:shadow-sm">
          <p className="text-[11px] text-urg-lowFg flex items-center gap-1"><CheckCircle className="h-3 w-3" />Resolvidos</p>
          <p className="text-2xl font-semibold text-urg-lowFg tabular-nums">{stats.resolvidos}</p>
        </div>
        <div className="card-surface p-4 transition-shadow hover:shadow-sm">
          <p className="text-[11px] text-ink-muted">Urgentes (abertos)</p>
          <p className="text-2xl font-semibold text-ink tabular-nums">{stats.urgentes}</p>
        </div>
        <div className="card-surface p-4 transition-shadow hover:shadow-sm">
          <p className="text-[11px] text-ink-muted">{aba === 'professor' ? 'Reclamações' : 'Total'}</p>
          <p className="text-2xl font-semibold text-ink tabular-nums">{stats.quarto}</p>
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
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 bg-surface-subtle rounded-full p-1">
          {([['abertos', 'Abertos'], ['resolvidos', 'Resolvidos'], ['todos', 'Todos']] as [FiltroStatus, string][]).map(([value, label]) => (
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
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
      ) : filtrados.length === 0 ? (
        <div className="card-surface p-8 text-center">
          <p className="text-[13px] text-ink-muted">Nenhum incidente encontrado.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtrados.map(i => (
            <div
              key={i.id}
              className="flex gap-3 rounded-xl border border-line bg-surface-canvas px-4 py-3.5 items-start transition-colors hover:bg-surface-subtle/40"
            >
              <div className={cn('w-[3px] self-stretch rounded-full flex-shrink-0', URG_BAR[i.urgency] ?? 'bg-ink-subtle')} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {i.professor_id ? (
                    <button
                      onClick={() => navigate(`/professores/${i.professor_id}`)}
                      className="text-[14px] font-medium text-ink hover:text-accentBlue hover:underline transition-colors"
                    >
                      {i.teacher_name}
                    </button>
                  ) : (
                    <span className="text-[14px] font-medium text-ink-secondary italic">{i.teacher_name}</span>
                  )}
                  {i.aluno_nome && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accentBlue-soft/60 text-accentBlue px-2 py-0.5 text-[11px] font-medium">
                      <GraduationCap className="h-3 w-3" />Aluno: {i.aluno_nome}
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-full bg-surface-subtle text-ink-secondary px-2 py-0.5 text-[11px] font-medium">
                    {i.problem_type}
                  </span>
                </div>
                <p className="text-[13px] text-ink-secondary mt-1.5 truncate" title={i.description}>{i.description}</p>
                <p className="text-[11px] text-ink-muted mt-1.5">{i.coordinator} · {tempoRelativo(i.created_at)}</p>
                {i.image_urls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {i.image_urls.map((url, idx) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block h-12 w-12 overflow-hidden rounded-md border border-line hover:opacity-90"
                      >
                        <img src={url} alt={`Anexo ${idx + 1}`} loading="lazy" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className={cn('inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium', urgenciaChip[i.urgency] ?? 'bg-surface-subtle text-ink-secondary')}>
                  {i.urgency}
                </span>
                {podeEditar && (
                  <div className="flex items-center gap-1.5">
                    {i.resolved ? (
                      <button
                        onClick={() => reabrir.mutate(
                          { id: i.id, professor_id: i.professor_id },
                          { onSuccess: () => toast.success('Incidente reaberto.'), onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao reabrir.') },
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
                        Resolver
                      </button>
                    )}
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
          ))}
        </div>
      )}

      <NovoIncidenteDialog open={novoAberto} onOpenChange={setNovoAberto} />
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
    </div>
  )
}
