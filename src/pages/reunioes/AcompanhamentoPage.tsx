import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useCoordenadores, useAgendaDia, type CoordenadorPerfil, type ReuniaoAgenda } from '@/hooks/useAcompanhamento'
import { useAuth } from '@/contexts/AuthContext'

// ─── Status helpers ───────────────────────────────────────────────────────────

type MeetingStatus = 'done' | 'cancelled' | 'late' | 'now' | 'soon' | 'upcoming'

function getMeetingStatus(r: ReuniaoAgenda): MeetingStatus {
  if (r.status === 'concluida') return 'done'
  if (r.status === 'cancelada') return 'cancelled'
  const now     = new Date()
  const t       = new Date(r.data)
  const diffMin = (t.getTime() - now.getTime()) / 60_000
  if (diffMin < -20) return 'late'
  if (diffMin < 5)   return 'now'
  if (diffMin <= 20) return 'soon'
  return 'upcoming'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour:   '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function formatRelative(iso: string): string {
  const diffMin = (new Date(iso).getTime() - Date.now()) / 60_000
  if (diffMin < -60)  return `há ${Math.round(-diffMin / 60)}h`
  if (diffMin < -1)   return `há ${Math.round(-diffMin)}min`
  if (diffMin < 1)    return 'agora'
  if (diffMin < 60)   return `em ${Math.round(diffMin)}min`
  return `em ${Math.round(diffMin / 60)}h`
}

const statusConfig: Record<MeetingStatus, {
  dot: string; badge: string; label: string; pulse?: boolean
}> = {
  done:      { dot: 'bg-urg-lowFg',  badge: 'bg-urg-lowBg text-urg-lowFg',   label: 'Concluída' },
  cancelled: { dot: 'bg-line',        badge: 'bg-surface-subtle text-ink-muted line-through', label: 'Cancelada' },
  late:      { dot: 'bg-urg-highFg', badge: 'bg-urg-highBg text-urg-highFg', label: 'Atrasada' },
  now:       { dot: 'bg-accentBlue', badge: 'bg-accentBlue-soft text-accentBlue', label: 'Acontecendo', pulse: true },
  soon:      { dot: 'bg-accentBlue', badge: 'bg-accentBlue-soft text-accentBlue', label: 'Em breve',    pulse: true },
  upcoming:  { dot: 'bg-line-strong', badge: 'bg-surface-subtle text-ink-secondary', label: 'Agendada' },
}

// ─── Meeting card ─────────────────────────────────────────────────────────────

function MeetingCard({ reuniao }: { reuniao: ReuniaoAgenda }) {
  const s   = getMeetingStatus(reuniao)
  const cfg = statusConfig[s]
  const professor = Array.isArray(reuniao.professores)
    ? (reuniao.professores as ReuniaoAgenda['professores'][])[0]
    : reuniao.professores

  return (
    <div className={cn(
      'group flex items-start gap-4 py-4 px-4 rounded-2xl transition-all duration-200 ease-spring',
      s === 'cancelled' ? 'opacity-50' : 'hover:bg-surface-subtle/60',
    )}>

      {/* Time column */}
      <div className="flex-shrink-0 w-[52px] text-right">
        <span className={cn(
          'text-[13px] font-semibold tabular-nums',
          s === 'done'      ? 'text-urg-lowFg'    :
          s === 'late'      ? 'text-urg-highFg'   :
          s === 'now' || s === 'soon' ? 'text-accentBlue' :
          s === 'cancelled' ? 'text-ink-muted'    :
          'text-ink-secondary'
        )}>
          {formatTime(reuniao.data)}
        </span>
        <p className={cn(
          'text-[10.5px] mt-0.5 leading-none',
          s === 'done'      ? 'text-urg-lowFg/70'  :
          s === 'late'      ? 'text-urg-highFg/70' :
          s === 'now' || s === 'soon' ? 'text-accentBlue/70' :
          'text-ink-muted'
        )}>
          {formatRelative(reuniao.data)}
        </p>
      </div>

      {/* Status dot */}
      <div className="flex-shrink-0 mt-[5px] flex flex-col items-center">
        <div className="relative flex items-center justify-center">
          {cfg.pulse && (
            <span className={cn(
              'absolute h-3 w-3 rounded-full animate-ping opacity-30',
              cfg.dot,
            )} />
          )}
          <span className={cn('h-2.5 w-2.5 rounded-full', cfg.dot)} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cn(
              'text-[13.5px] font-semibold leading-snug',
              s === 'cancelled' ? 'text-ink-muted line-through' : 'text-ink'
            )}>
              {professor?.nome ?? reuniao.titulo ?? 'Reunião sem professor'}
            </p>
            {reuniao.titulo && professor?.nome && (
              <p className="text-[11.5px] text-ink-muted mt-0.5 truncate">
                {reuniao.titulo}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Monitoramento badge */}
            {professor?.monitoramento && s !== 'cancelled' && (
              <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-urg-highFg" title="Monitoramento ativo" />
            )}

            {/* Status badge */}
            <span className={cn(
              'text-[10.5px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap',
              cfg.badge,
            )}>
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Meet link */}
        {reuniao.meet_link && s !== 'cancelled' && s !== 'done' && (
          <a
            href={reuniao.meet_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className={cn(
              'inline-flex items-center gap-1.5 text-[11.5px] font-medium',
              'px-2.5 py-1 rounded-full',
              'transition-all duration-200 ease-spring',
              s === 'now' || s === 'soon'
                ? 'bg-accentBlue text-white hover:bg-accentBlue/90 shadow-[0_1px_6px_rgba(42,92,255,0.35)]'
                : 'bg-surface-subtle text-ink-secondary hover:bg-surface-muted hover:text-ink',
            )}
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V8M10 2h4v4M14 2l-6 6" />
            </svg>
            Entrar na reunião
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Coordinator agenda panel ─────────────────────────────────────────────────

function AgendaPanel({ coordId }: { coordId: string | null }) {
  const { data: reunioes, isLoading, dataUpdatedAt } = useAgendaDia(coordId)

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-start gap-4 py-4 px-4">
            <div className="w-[52px] h-8 rounded-lg bg-surface-subtle animate-pulse" />
            <div className="w-2.5 h-2.5 mt-1 rounded-full bg-surface-subtle animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 rounded-lg bg-surface-subtle animate-pulse w-2/3" />
              <div className="h-3 rounded-lg bg-surface-subtle animate-pulse w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const list = reunioes ?? []

  if (!list.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="h-12 w-12 rounded-2xl bg-surface-subtle flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </div>
        <p className="text-[14px] font-medium text-ink-secondary">Nenhuma reunião hoje</p>
        <p className="text-[12.5px] text-ink-muted mt-1">A agenda deste coordenador está livre.</p>
      </div>
    )
  }

  const done     = list.filter(r => r.status === 'concluida').length
  const total    = list.length
  const atrasadas = list.filter(r => getMeetingStatus(r) === 'late').length
  const pct      = total > 0 ? Math.round((done / total) * 100) : 0

  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="space-y-4">

      {/* Summary strip */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-subtle border border-line-soft">
          <span className="text-[12px] font-medium text-ink-secondary tabular-nums">
            {done}<span className="text-ink-muted font-normal">/{total}</span>
          </span>
          <span className="text-[11px] text-ink-muted">concluídas</span>
        </div>

        {atrasadas > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-urg-highBg border border-urg-highFg/20">
            <span className="h-1.5 w-1.5 rounded-full bg-urg-highFg flex-shrink-0" />
            <span className="text-[11.5px] font-medium text-urg-highFg tabular-nums">
              {atrasadas} atrasada{atrasadas > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {total > 0 && (
          <div className="flex items-center gap-2 flex-1 min-w-[120px]">
            <div className="flex-1 h-1 rounded-full bg-surface-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-urg-lowFg transition-all duration-700 ease-spring"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] text-ink-muted tabular-nums flex-shrink-0">{pct}%</span>
          </div>
        )}

        {updatedStr && (
          <span className="ml-auto text-[11px] text-ink-muted flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-urg-lowFg/60 animate-pulse flex-shrink-0" />
            Atualizado {updatedStr}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-line-soft" />

      {/* Meeting list */}
      <div className="divide-y divide-line-soft/50">
        {list.map(r => (
          <MeetingCard key={r.id} reuniao={r} />
        ))}
      </div>
    </div>
  )
}

// ─── Overview (Geral) tab ─────────────────────────────────────────────────────

function CoordOverviewCard({
  coord,
  isActive,
  onClick,
}: {
  coord: CoordenadorPerfil
  isActive: boolean
  onClick: () => void
}) {
  const { data: reunioes, isLoading } = useAgendaDia(coord.id)
  const list      = reunioes ?? []
  const total     = list.length
  const done      = list.filter(r => r.status === 'concluida').length
  const atrasadas = list.filter(r => getMeetingStatus(r) === 'late').length
  const happening = list.filter(r => {
    const s = getMeetingStatus(r)
    return s === 'now' || s === 'soon'
  }).length
  const pct = total > 0 ? (done / total) * 100 : 0

  const initials = coord.nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  return (
    <button
      onClick={onClick}
      className={cn(
        'btn-press w-full text-left',
        'rounded-[1.5rem] p-[1.5px] transition-all duration-300 ease-spring',
        isActive
          ? 'bg-gradient-to-b from-accentBlue/30 to-accentBlue/10 shadow-[0_0_0_1px_rgba(42,92,255,0.25)]'
          : 'bg-surface-subtle border border-line-soft hover:border-line-strong',
      )}
    >
      <div className={cn(
        'rounded-[calc(1.5rem-1.5px)] px-5 py-5 space-y-4',
        isActive ? 'bg-surface-canvas' : 'bg-surface-canvas',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
      )}>

        {/* Header row */}
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px]
                           bg-accentBlue-soft text-accentBlue text-[12px] font-semibold
                           ring-1 ring-accentBlue/15">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-ink truncate">{coord.nome}</p>
            <p className="text-[11px] text-ink-muted capitalize">{coord.role === 'admin' ? 'Admin' : 'Coordenação'}</p>
          </div>
          {atrasadas > 0 && (
            <span className="flex-shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-urg-highBg text-urg-highFg">
              {atrasadas}↑
            </span>
          )}
          {happening > 0 && atrasadas === 0 && (
            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-accentBlue animate-pulse" />
          )}
        </div>

        {/* Stats row */}
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-surface-subtle animate-pulse" />
            <div className="h-3 w-16 rounded-lg bg-surface-subtle animate-pulse" />
          </div>
        ) : total === 0 ? (
          <p className="text-[12px] text-ink-muted">Sem reuniões hoje</p>
        ) : (
          <div className="space-y-2">
            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-spring"
                style={{
                  width: `${pct}%`,
                  background: pct === 100
                    ? 'var(--urg-low-fg)'
                    : atrasadas > 0
                    ? 'var(--urg-high-fg)'
                    : 'var(--accent-blue)',
                }}
              />
            </div>
            {/* Count */}
            <p className="text-[12px] text-ink-secondary tabular-nums">
              <span className="font-semibold text-ink">{done}</span>
              <span className="text-ink-muted">/{total}</span>
              {' '}reuniões concluídas
            </p>
          </div>
        )}
      </div>
    </button>
  )
}

function GeralTab({
  coordenadores,
  onSelectCoord,
}: {
  coordenadores: CoordenadorPerfil[]
  onSelectCoord: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-ink-muted">
        Visão geral das agendas de hoje. Clique num coordenador para ver os detalhes.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {coordenadores.map(c => (
          <CoordOverviewCard
            key={c.id}
            coord={c}
            isActive={false}
            onClick={() => onSelectCoord(c.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Live clock ───────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
  )
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'America/Sao_Paulo',
      }))
    }, 1_000)
    return () => clearInterval(id)
  }, [])
  return <span className="tabular-nums">{time}</span>
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AcompanhamentoPage() {
  const { profile }                         = useAuth()
  const { data: coordenadores, isLoading }  = useCoordenadores()
  const [activeTab, setActiveTab]           = useState<string>('geral')

  const canSeeAll = profile?.role === 'admin'
    || profile?.role === 'suporte'
    || profile?.role === 'suporte_aluno'

  // Non-admin coordinators jump straight to their own tab
  const effectiveTab = !canSeeAll && profile?.id ? profile.id : activeTab

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    timeZone: 'America/Sao_Paulo',
  })
  // Capitalize first letter
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1)

  function handleSelectCoord(id: string) {
    setActiveTab(id)
  }

  const activeCoord = coordenadores?.find(c => c.id === effectiveTab)

  return (
    <div className="min-h-[100dvh] px-4 sm:px-6 lg:px-8 pb-16">
      <div className="max-w-4xl mx-auto space-y-6 pt-6">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="animate-[float-up_700ms_cubic-bezier(0.32,0.72,0,1)_both]">
          {/* Eyebrow */}
          <span className="eyebrow-tag mb-4 inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-accentBlue animate-pulse" />
            Ao vivo
          </span>

          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-[2rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                Acompanhamento
              </h1>
              <p className="text-[14px] text-ink-muted mt-1">{todayLabel}</p>
            </div>

            {/* Live clock */}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-surface-subtle border border-line-soft
                            text-[13px] font-medium text-ink-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-accentBlue animate-pulse flex-shrink-0" />
              <LiveClock />
            </div>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-9 w-24 rounded-full bg-surface-subtle animate-pulse" />
            ))}
          </div>
        ) : coordenadores && coordenadores.length > 0 && (
          <div
            className="flex items-center gap-1.5 flex-wrap animate-[float-up_700ms_cubic-bezier(0.32,0.72,0,1)_60ms_both]"
          >
            {/* Geral tab (only for admin/suporte with multiple coordinators) */}
            {canSeeAll && coordenadores.length > 1 && (
              <button
                onClick={() => setActiveTab('geral')}
                className={cn(
                  'btn-press px-4 py-2 rounded-full text-[12.5px] font-medium transition-all duration-200 ease-spring',
                  effectiveTab === 'geral'
                    ? 'bg-ink text-white shadow-[0_1px_4px_rgba(0,0,0,0.2)]'
                    : 'text-ink-secondary hover:text-ink hover:bg-surface-subtle',
                )}
              >
                Geral
              </button>
            )}

            {/* One tab per coordinator */}
            {coordenadores.map(c => {
              const isActive = effectiveTab === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveTab(c.id)}
                  className={cn(
                    'btn-press px-4 py-2 rounded-full text-[12.5px] font-medium transition-all duration-200 ease-spring',
                    isActive
                      ? 'bg-ink text-white shadow-[0_1px_4px_rgba(0,0,0,0.2)]'
                      : 'text-ink-secondary hover:text-ink hover:bg-surface-subtle',
                  )}
                >
                  {/* Shorten name to first word */}
                  {c.nome.split(' ')[0]}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div
          className="animate-[float-up_700ms_cubic-bezier(0.32,0.72,0,1)_120ms_both]"
        >
          {/* Outer bezel shell */}
          <div className="rounded-[1.625rem] p-[1.5px]
                          bg-surface-subtle border border-line-soft
                          shadow-[0_8px_32px_-8px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.9)]
                          dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.40),inset_0_1px_0_rgba(255,255,255,0.04)]">
            {/* Inner core */}
            <div className="rounded-[1.5rem] bg-surface-canvas px-5 py-5
                            shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]
                            dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">

              {/* Section heading */}
              {effectiveTab !== 'geral' && activeCoord && (
                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-line-soft">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[9px]
                                   bg-accentBlue-soft text-accentBlue text-[11px] font-semibold
                                   ring-1 ring-accentBlue/15 flex-shrink-0">
                    {activeCoord.nome.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-ink">{activeCoord.nome}</p>
                    <p className="text-[11px] text-ink-muted capitalize">
                      {activeCoord.role === 'admin' ? 'Admin' : 'Coordenação'}
                    </p>
                  </div>
                </div>
              )}

              {/* Tab content */}
              {effectiveTab === 'geral' && canSeeAll && coordenadores && coordenadores.length > 1 ? (
                <GeralTab
                  coordenadores={coordenadores}
                  onSelectCoord={handleSelectCoord}
                />
              ) : (
                <AgendaPanel coordId={effectiveTab !== 'geral' ? effectiveTab : null} />
              )}
            </div>
          </div>
        </div>

        {/* ── Footer note ─────────────────────────────────────────────── */}
        <p className="text-center text-[12px] text-ink-muted
                      animate-[float-up_700ms_cubic-bezier(0.32,0.72,0,1)_200ms_both]">
          Atualiza automaticamente a cada 2 minutos · horário de Brasília
        </p>
      </div>
    </div>
  )
}
