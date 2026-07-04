import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, AlertTriangle, CheckCircle, Layers } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useIncidentes, useReabrirIncidente, CATEGORIAS_INCIDENTE, type Incidente } from '@/hooks/useIncidentes'
import { NovoIncidenteDialog } from '@/components/incidentes/NovoIncidenteDialog'
import { ResolverIncidenteDialog } from '@/components/incidentes/ResolverIncidenteDialog'
import { urgenciaChip } from '@/lib/nexusLabels'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type FiltroStatus = 'todos' | 'abertos' | 'resolvidos'

export function IncidentesPage() {
  const navigate = useNavigate()
  const { data: incidentes = [], isLoading } = useIncidentes()
  const reabrir = useReabrirIncidente()

  const [novoAberto, setNovoAberto] = useState(false)
  const [resolverAlvo, setResolverAlvo] = useState<Incidente | null>(null)
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<string>('todas')
  const [status, setStatus] = useState<FiltroStatus>('abertos')
  const [soDesafios, setSoDesafios] = useState(false)

  const stats = {
    total: incidentes.length,
    abertos: incidentes.filter(i => !i.resolved).length,
    resolvidos: incidentes.filter(i => i.resolved).length,
    desafios: incidentes.filter(i => !i.professor_id).length,
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return incidentes.filter(i => {
      if (status === 'abertos' && i.resolved) return false
      if (status === 'resolvidos' && !i.resolved) return false
      if (categoria !== 'todas' && i.problem_type !== categoria) return false
      if (soDesafios && i.professor_id) return false
      if (termo && !(
        i.teacher_name.toLowerCase().includes(termo) ||
        i.coordinator.toLowerCase().includes(termo) ||
        i.description.toLowerCase().includes(termo)
      )) return false
      return true
    })
  }, [incidentes, busca, categoria, status, soDesafios])

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Incidentes</h1>
          <p className="text-[13px] text-ink-muted">Todos os incidentes registrados — com ou sem professor vinculado.</p>
        </div>
        <Button
          size="sm"
          className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white gap-1.5"
          onClick={() => setNovoAberto(true)}
        >
          <Plus className="h-3.5 w-3.5" />Novo Incidente
        </Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-surface p-4">
          <p className="text-[11px] text-ink-muted">Total</p>
          <p className="text-2xl font-semibold text-ink tabular-nums">{stats.total}</p>
        </div>
        <div className="card-surface p-4">
          <p className="text-[11px] text-urg-highFg flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Abertos</p>
          <p className="text-2xl font-semibold text-urg-highFg tabular-nums">{stats.abertos}</p>
        </div>
        <div className="card-surface p-4">
          <p className="text-[11px] text-urg-lowFg flex items-center gap-1"><CheckCircle className="h-3 w-3" />Resolvidos</p>
          <p className="text-2xl font-semibold text-urg-lowFg tabular-nums">{stats.resolvidos}</p>
        </div>
        <div className="card-surface p-4">
          <p className="text-[11px] text-ink-muted flex items-center gap-1"><Layers className="h-3 w-3" />Desafios (sem professor)</p>
          <p className="text-2xl font-semibold text-ink tabular-nums">{stats.desafios}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <Input
            placeholder="Buscar por professor, responsável ou descrição…"
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
            {CATEGORIAS_INCIDENTE.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
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
          onClick={() => setSoDesafios(v => !v)}
          className={cn(
            'btn-press inline-flex items-center rounded-full px-3 h-9 text-[12px] font-medium border transition-colors',
            soDesafios
              ? 'bg-accentBlue-soft text-accentBlue border-transparent'
              : 'bg-surface-canvas text-ink-secondary border-line hover:text-ink',
          )}
        >
          Só desafios (sem professor)
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
      ) : filtrados.length === 0 ? (
        <div className="card-surface p-8 text-center">
          <p className="text-[13px] text-ink-muted">Nenhum incidente encontrado.</p>
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-ink-muted uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Professor / Referência</th>
                <th className="px-4 py-2.5 font-medium">Categoria</th>
                <th className="px-4 py-2.5 font-medium">Urgência</th>
                <th className="px-4 py-2.5 font-medium">Responsável</th>
                <th className="px-4 py-2.5 font-medium">Descrição</th>
                <th className="px-4 py-2.5 font-medium">Data</th>
                <th className="px-4 py-2.5 font-medium text-center">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(i => (
                <tr key={i.id} className="border-b border-line-soft last:border-0 hover:bg-surface-subtle/60 transition-colors">
                  <td className="px-4 py-2.5">
                    {i.resolved ? (
                      <span className="inline-flex items-center rounded-full bg-urg-lowBg text-urg-lowFg px-2 py-0.5 text-[11px] font-medium">Resolvido</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-urg-highBg text-urg-highFg px-2 py-0.5 text-[11px] font-medium">Aberto</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {i.professor_id ? (
                      <button onClick={() => navigate(`/professores/${i.professor_id}`)} className="text-ink font-medium hover:text-accentBlue hover:underline">
                        {i.teacher_name}
                      </button>
                    ) : (
                      <span className="text-ink-muted italic">{i.teacher_name} (desafio)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-secondary">{i.problem_type}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium', urgenciaChip[i.urgency] ?? 'bg-surface-subtle text-ink-secondary')}>
                      {i.urgency}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{i.coordinator}</td>
                  <td className="px-4 py-2.5 text-ink-secondary max-w-[280px] truncate" title={i.description}>{i.description}</td>
                  <td className="px-4 py-2.5 text-ink-muted tabular-nums">{new Date(i.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-2.5 text-center">
                    {i.resolved ? (
                      <button
                        onClick={() => reabrir.mutate(
                          { id: i.id, professor_id: i.professor_id },
                          { onSuccess: () => toast.success('Incidente reaberto.'), onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao reabrir.') },
                        )}
                        className="btn-press px-3 py-1.5 text-[11.5px] font-medium rounded-md bg-urg-medBg text-urg-medFg hover:opacity-80 transition-opacity"
                      >
                        Reabrir
                      </button>
                    ) : (
                      <button
                        onClick={() => setResolverAlvo(i)}
                        className="btn-press px-3 py-1.5 text-[11.5px] font-medium rounded-md bg-urg-lowBg text-urg-lowFg hover:opacity-80 transition-opacity"
                      >
                        Resolver
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NovoIncidenteDialog open={novoAberto} onOpenChange={setNovoAberto} />
      <ResolverIncidenteDialog
        open={!!resolverAlvo}
        onOpenChange={o => !o && setResolverAlvo(null)}
        incidente={resolverAlvo}
      />
    </div>
  )
}
