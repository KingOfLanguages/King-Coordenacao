import { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useProfessoresAcompanhamento, faixaCls, type ProfessorRisco } from '@/hooks/useProfessorAcompanhamento'
import { useProblemasAbertos, type ProfessorComProblema } from '@/hooks/useObservacoes'
import { cn } from '@/lib/utils'

// ─── Pastas inteligentes ────────────────────────────────────────────────────
// Substituem o conceito de pasta manual do King Nexus (grupo curado à mão):
// aqui o critério roda direto sobre o dado real do KMS, sem manutenção manual.

type PastaId = 'todos' | 'critico' | 'atencao' | 'alertas' | 'pendencias' | 'nao_elegivel'

const PASTAS: { id: PastaId; label: string; filtro: (p: ProfessorRisco) => boolean }[] = [
  { id: 'todos',        label: 'Todos',                        filtro: () => true },
  { id: 'critico',      label: 'Score crítico',                filtro: p => p.score_faixa === 'Critico' },
  { id: 'atencao',      label: 'Score em atenção',             filtro: p => p.score_faixa === 'Atencao' },
  { id: 'alertas',      label: 'Com alertas ativos',           filtro: p => p.alertas_total > 0 },
  { id: 'pendencias',   label: 'Com aulas pendentes',          filtro: p => p.aulas_pendentes_qtd > 0 },
  { id: 'nao_elegivel', label: 'Não elegível para alocação',   filtro: p => p.elegivel_alocacao === false },
]

export function AcompanhamentoPage() {
  const { data: professores, isLoading } = useProfessoresAcompanhamento()
  const [busca, setBusca] = useState('')
  const [pasta, setPasta] = useState<PastaId>('todos')
  const navigate = useNavigate()

  const pastaAtiva = PASTAS.find(f => f.id === pasta) ?? PASTAS[0]

  const filtrados = useMemo(() => {
    const base = (professores ?? []).filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()))
    return base.filter(pastaAtiva.filtro)
  }, [professores, busca, pastaAtiva])

  const emRisco = (professores ?? []).filter(p => p.alertas_total > 0 || p.score_faixa === 'Critico').length

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Acompanhamento</h1>
          <p className="text-[13px] text-ink-muted">
            <span className="tabular-nums text-ink-secondary font-medium">{professores?.length ?? 0}</span> professores
            {emRisco > 0 && (
              <> · <span className="text-urg-highFg font-medium">{emRisco} em risco</span></>
            )}
          </p>
        </div>

        <div className="relative w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <Input
            placeholder="Buscar professor…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-9 bg-surface-canvas border-line"
          />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4 min-w-0">
          {/* Pastas inteligentes — critério automático sobre o dado do KMS */}
          <div className="flex flex-wrap gap-2">
            {PASTAS.map(f => {
              const count = (professores ?? []).filter(f.filtro).length
              return (
                <button
                  key={f.id}
                  onClick={() => setPasta(f.id)}
                  className={cn(
                    'btn-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                    pasta === f.id
                      ? 'bg-accentBlue text-white'
                      : 'bg-surface-subtle text-ink-secondary hover:bg-surface-canvas hover:border-line border border-transparent',
                  )}
                >
                  {f.label}
                  <span className={cn('tabular-nums', pasta === f.id ? 'text-white/70' : 'text-ink-muted')}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {isLoading ? (
            <div className="flex h-64 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
          ) : filtrados.length === 0 ? (
            <div className="card-surface p-8 text-center">
              <p className="text-[13px] text-ink-muted">Nenhum professor encontrado.</p>
            </div>
          ) : (
            <div className="card-surface overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] text-ink-muted uppercase tracking-wide">
                    <th className="px-4 py-2.5 font-medium">Professor</th>
                    <th className="px-4 py-2.5 font-medium">Grupo</th>
                    <th className="px-4 py-2.5 font-medium">Coordenador</th>
                    <th className="px-4 py-2.5 font-medium">Score</th>
                    <th className="px-4 py-2.5 font-medium">Reunião</th>
                    <th className="px-4 py-2.5 font-medium">Alertas</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(p => <ProfessorRiscoRow key={p.professor_id} professor={p} onClick={() => navigate(`/professores/${p.professor_id}`)} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <ProblemasAbertosPanel />
      </div>
    </div>
  )
}

// ─── Problemas abertos (substitui delegação — visibilidade em vez de fila) ───

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
            <button
              onClick={() => setExpandido(v => !v)}
              className="btn-press text-[11px] text-accentBlue font-medium"
            >
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
      <Link
        to={`/professores/${professor.professor_id}`}
        className="text-[12.5px] text-ink font-medium hover:text-accentBlue transition-colors"
      >
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

function ProfessorRiscoRow({ professor, onClick }: { professor: ProfessorRisco; onClick: () => void }) {
  return (
    <tr onClick={onClick} className="border-b border-line-soft last:border-0 hover:bg-surface-subtle cursor-pointer transition-colors">
      <td className="px-4 py-2.5 text-ink font-medium">{professor.nome}</td>
      <td className="px-4 py-2.5 text-ink-muted">{professor.grupo_nome ?? '—'}</td>
      <td className="px-4 py-2.5 text-ink-muted">{professor.coordenador_nome ?? '—'}</td>
      <td className="px-4 py-2.5">
        {professor.score_atual != null ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="tabular-nums text-ink">{professor.score_atual}</span>
            {professor.score_faixa && (
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', faixaCls[professor.score_faixa] ?? 'bg-surface-subtle text-ink-secondary')}>
                {professor.score_faixa}
              </span>
            )}
          </span>
        ) : <span className="text-ink-muted">—</span>}
      </td>
      <td className="px-4 py-2.5 text-ink-muted capitalize">{professor.reuniao_status?.replace(/_/g, ' ') ?? '—'}</td>
      <td className="px-4 py-2.5">
        {professor.alertas_total > 0 ? (
          <span className="inline-flex items-center rounded-full bg-urg-medBg text-urg-medFg px-2 py-0.5 text-[11px] font-medium tabular-nums">
            {professor.alertas_total}
          </span>
        ) : <span className="text-ink-muted">—</span>}
      </td>
    </tr>
  )
}
