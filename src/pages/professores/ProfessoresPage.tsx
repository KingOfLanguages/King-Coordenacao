import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, AlertCircle, CalendarDays } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useProfessoresAtivos } from '@/hooks/useProfessores'
import { PrioridadeBadge } from '@/components/professores/PrioridadeBadge'
import type { Professor } from '@/types'
import { cn } from '@/lib/utils'

export function ProfessoresPage() {
  const { data: professores, isLoading } = useProfessoresAtivos()
  const [busca, setBusca] = useState('')
  const navigate = useNavigate()

  const filtrados = useMemo(() => (professores ?? []).filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase())
  ), [professores, busca])

  const emMonitoramento = filtrados.filter(p => p.monitoramento)
  const demais          = filtrados.filter(p => !p.monitoramento)

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Professores</h1>
          <p className="text-[13px] text-ink-muted">
            <span className="tabular-nums text-ink-secondary font-medium">{filtrados.length}</span> ativos
            {emMonitoramento.length > 0 && (
              <> · <span className="text-urg-highFg font-medium">{emMonitoramento.length} em monitoramento</span></>
            )}
          </p>
        </div>

        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <Input
            placeholder="Buscar professor…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-9 bg-surface-canvas border-line"
          />
        </div>
      </header>

      {isLoading ? (
        <SkeletonGrid />
      ) : filtrados.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {emMonitoramento.length > 0 && (
            <Section
              label="Monitoramento"
              icon={<AlertCircle className="h-3.5 w-3.5 text-urg-highFg" />}
              tone="danger"
            >
              {emMonitoramento.map(p => (
                <CardProfessor key={p.id} professor={p} onClick={() => navigate(`/professores/${p.id}`)} emphasis />
              ))}
            </Section>
          )}

          <Section label="Todos">
            {demais.map(p => (
              <CardProfessor key={p.id} professor={p} onClick={() => navigate(`/professores/${p.id}`)} />
            ))}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({
  label, icon, tone, children,
}: { label: string; icon?: React.ReactNode; tone?: 'danger'; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className={cn('label-micro', tone === 'danger' && 'text-urg-highFg')}>{label}</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </section>
  )
}

function CardProfessor({
  professor, onClick, emphasis,
}: { professor: Professor; onClick: () => void; emphasis?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'btn-press text-left card-surface p-4 space-y-2',
        'hover:border-line-strong hover:shadow-card transition-all',
        emphasis && 'border-urg-highFg/20 bg-urg-highBg/10',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-[14px] text-ink leading-tight truncate flex-1">{professor.nome}</p>
        <PrioridadeBadge professor={professor} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
        {professor.tempo_na_king && <span>{professor.tempo_na_king}</span>}
        {professor.data_ultima_reuniao && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {new Date(professor.data_ultima_reuniao).toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>
    </button>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card-surface p-4 space-y-2 animate-pulse">
          <div className="h-4 w-2/3 bg-surface-subtle rounded" />
          <div className="h-3 w-1/3 bg-surface-subtle rounded" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card-surface p-12 text-center space-y-2">
      <div className="mx-auto h-10 w-10 rounded-full bg-surface-subtle text-ink-muted flex items-center justify-center">
        <Search className="h-4 w-4" />
      </div>
      <p className="text-[14px] font-medium text-ink">Nenhum professor encontrado</p>
      <p className="text-[13px] text-ink-muted">Ajuste a busca ou cadastre um novo professor.</p>
    </div>
  )
}
