import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search, ShieldAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useAcompanhamentoAlunos, type AlunoAgregado } from '@/hooks/useAcompanhamentoAlunos'
import { cn } from '@/lib/utils'

// Barra de urgência por ocorrência — mesmos tokens da tela de Incidentes.
const URG_BAR: Record<string, string> = {
  Baixa: 'bg-urg-lowFg', Média: 'bg-urg-medFg', Alta: 'bg-urg-highFg', Crítico: 'bg-urg-critFg',
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function AlunosPage() {
  const { data: alunos = [], isLoading } = useAcompanhamentoAlunos()

  const [busca, setBusca] = useState('')
  const [soRecorrentes, setSoRecorrentes] = useState(false)
  const [expandido, setExpandido] = useState<Set<string>>(new Set())

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return alunos.filter(a =>
      (!soRecorrentes || a.total >= 2) &&
      (termo === '' || a.nome.toLowerCase().includes(termo) || a.professores.some(p => p.toLowerCase().includes(termo)))
    )
  }, [alunos, busca, soRecorrentes])

  const resumo = useMemo(() => ({
    alunos: alunos.length,
    ocorrencias: alunos.reduce((s, a) => s + a.total, 0),
    recorrentes: alunos.filter(a => a.total >= 2).length,
    abertas: alunos.reduce((s, a) => s + a.abertos, 0),
  }), [alunos])

  function toggle(chave: string) {
    setExpandido(prev => {
      const next = new Set(prev)
      if (next.has(chave)) next.delete(chave)
      else next.add(chave)
      return next
    })
  }

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
  )

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px] mx-auto">
      <header className="space-y-0.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Reclamações por Aluno</h1>
        <p className="text-[13px] text-ink-muted">
          Ocorrências agrupadas pelo aluno citado — para enxergar padrões recorrentes.
        </p>
      </header>

      {/* Aviso LGPD */}
      <div className="flex items-start gap-2 rounded-lg border border-line-soft bg-surface-subtle/50 px-3.5 py-2.5">
        <ShieldAlert className="h-4 w-4 text-ink-muted mt-0.5 flex-shrink-0" />
        <p className="text-[12px] text-ink-secondary">
          Nomes de alunos são dados pessoais. Uso interno restrito ao acompanhamento pedagógico —
          o agrupamento por nome é aproximado (junta grafias parecidas) e pode conter homônimos.
        </p>
      </div>

      {/* Resumo */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Alunos com ocorrência" value={resumo.alunos} />
        <StatCard label="Total de ocorrências" value={resumo.ocorrencias} />
        <StatCard label="Alunos recorrentes (2+)" value={resumo.recorrentes} tone={resumo.recorrentes > 0 ? 'warn' : undefined} />
        <StatCard label="Ocorrências em aberto" value={resumo.abertas} tone={resumo.abertas > 0 ? 'warn' : undefined} />
      </section>

      {/* Filtros */}
      <section className="card-surface p-4 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <Input
            placeholder="Buscar aluno ou professor…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-9 bg-surface-canvas border-line"
          />
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-ink-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soRecorrentes}
            onChange={e => setSoRecorrentes(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-line accent-brand"
          />
          Só recorrentes (2+ ocorrências)
        </label>
        <span className="text-[12px] text-ink-muted ml-auto tabular-nums">{filtrados.length} aluno(s)</span>
      </section>

      {/* Tabela */}
      <section className="card-surface p-5 space-y-3">
        {filtrados.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Nenhum aluno encontrado.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11px] text-ink-muted uppercase tracking-wide">
                <th className="px-3 py-2 text-left font-medium w-6"></th>
                <th className="px-3 py-2 text-left font-medium">Aluno</th>
                <th className="px-3 py-2 text-left font-medium">Ocorrências</th>
                <th className="px-3 py-2 text-left font-medium">Abertas</th>
                <th className="px-3 py-2 text-left font-medium">Professores</th>
                <th className="px-3 py-2 text-left font-medium">Última</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(a => {
                const aberto = expandido.has(a.chave)
                return (
                  <Fragment key={a.chave}>
                    <tr
                      onClick={() => toggle(a.chave)}
                      className="border-b border-line-soft cursor-pointer hover:bg-surface-subtle"
                    >
                      <td className="px-3 py-2">{aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                      <td className="px-3 py-2 font-medium text-ink">
                        {a.nome}
                        {a.total >= 3 && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-urg-highBg text-urg-highFg px-1.5 py-0.5 text-[10px] font-medium align-middle">
                            recorrente
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{a.total}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {a.abertos > 0 ? <span className="text-urg-medFg font-medium">{a.abertos}</span> : <span className="text-ink-muted">0</span>}
                      </td>
                      <td className="px-3 py-2 text-ink-secondary">
                        <span className="line-clamp-1">{a.professores.join(', ') || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-ink-muted whitespace-nowrap">{fmtData(a.ultimaOcorrencia)}</td>
                    </tr>
                    {aberto && (
                      <tr>
                        <td colSpan={6} className="bg-surface-subtle px-4 py-3">
                          <DetalheAluno aluno={a} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

// ─── Detalhe expandido de um aluno ───────────────────────────────────────────

function DetalheAluno({ aluno }: { aluno: AlunoAgregado }) {
  return (
    <div className="space-y-3">
      {aluno.tiposProblema.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {aluno.tiposProblema.map(t => (
            <span key={t.tipo} className="inline-flex items-center gap-1 rounded-full bg-surface-canvas border border-line-soft px-2 py-0.5 text-[11px] text-ink-secondary">
              {t.tipo} <span className="tabular-nums text-ink-muted">· {t.qtd}</span>
            </span>
          ))}
        </div>
      )}
      <ul className="divide-y divide-line-soft">
        {aluno.incidentes.map(i => (
          <li key={i.id} className="flex items-start gap-3 py-2">
            <span className={cn('mt-1.5 h-2 w-2 rounded-full flex-shrink-0', URG_BAR[i.urgency] ?? 'bg-ink-subtle')} title={`Urgência: ${i.urgency}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap text-[12px]">
                <span className="font-medium text-ink">{i.problem_type}</span>
                <span className="text-ink-muted">· {i.teacher_name}</span>
                <span className="text-ink-subtle">· {fmtData(i.created_at)}</span>
                <span className={cn(
                  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                  i.resolved ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-urg-medBg text-urg-medFg',
                )}>
                  {i.resolved ? 'Concluído' : 'Em aberto'}
                </span>
              </div>
              {i.description && <p className="text-[12px] text-ink-secondary mt-0.5 line-clamp-2">{i.description}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: 'warn' }) {
  return (
    <div className="card-surface p-4 space-y-1">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className={cn('text-xl font-semibold tabular-nums', tone === 'warn' ? 'text-urg-highFg' : 'text-ink')}>{value}</p>
    </div>
  )
}
