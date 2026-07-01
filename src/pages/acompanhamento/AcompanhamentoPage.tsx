import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useProfessoresAcompanhamento, type ProfessorRisco } from '@/hooks/useProfessorAcompanhamento'
import { cn } from '@/lib/utils'

const faixaCls: Record<string, string> = {
  Regular: 'bg-urg-lowBg text-urg-lowFg',
  Atencao: 'bg-urg-medBg text-urg-medFg',
  Critico: 'bg-urg-highBg text-urg-highFg',
}

export function AcompanhamentoPage() {
  const { data: professores, isLoading } = useProfessoresAcompanhamento()
  const [busca, setBusca] = useState('')
  const [apenasRisco, setApenasRisco] = useState(false)
  const navigate = useNavigate()

  const filtrados = useMemo(() => {
    const base = (professores ?? []).filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()))
    if (!apenasRisco) return base
    return base.filter(p => p.alertas_total > 0 || p.score_faixa === 'Critico' || p.score_faixa === 'Atencao')
  }, [professores, busca, apenasRisco])

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

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
            <Input
              placeholder="Buscar professor…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9 h-9 bg-surface-canvas border-line"
            />
          </div>
          <button
            onClick={() => setApenasRisco(v => !v)}
            className={cn(
              'btn-press inline-flex items-center rounded-full px-3 h-9 text-[12px] font-medium border transition-colors',
              apenasRisco
                ? 'bg-urg-highBg text-urg-highFg border-transparent'
                : 'bg-surface-canvas text-ink-secondary border-line hover:text-ink',
            )}
          >
            Só em risco
          </button>
        </div>
      </header>

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
