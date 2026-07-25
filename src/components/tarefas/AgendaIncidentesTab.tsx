import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useIncidentes, type Incidente } from '@/hooks/useIncidentes'
import { dataInputValue, statusPrazo } from '@/lib/incidentePrazo'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Agenda de incidentes — calendário mensal posicionando cada incidente pelo
// prazo de resolução (fallback: data de criação). Cor por urgência/atraso.
// Clique num item abre o detalhe em /incidentes?incidente=<id> (deep-link já
// suportado pela IncidentesPage).
// ─────────────────────────────────────────────────────────────────────────────

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/** Data usada pra posicionar o incidente na agenda: prazo, senão criação. */
function dataAgenda(i: Incidente): Date {
  return new Date(i.prazo_resolucao ?? i.created_at)
}

/** Cor do marcador: resolvido = discreto, vencido = vermelho, senão urgência. */
function tomIncidente(i: Incidente): string {
  if (i.resolved) return 'bg-urg-lowFg'
  if (statusPrazo(i.prazo_resolucao, i.resolved)?.atrasado) return 'bg-urg-critFg'
  switch (i.urgency) {
    case 'Crítico':
    case 'Crítica':
    case 'Alta':  return 'bg-urg-highFg'
    case 'Média': return 'bg-urg-medFg'
    case 'Baixa': return 'bg-urg-lowFg'
    default:      return 'bg-ink-muted'
  }
}

export function AgendaIncidentesTab() {
  const navigate = useNavigate()
  const { data: incidentes = [], isLoading } = useIncidentes()
  const hoje = new Date()
  const [mesRef, setMesRef] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1))

  const ano = mesRef.getFullYear()
  const mes = mesRef.getMonth()

  // Agrupa por dia local (YYYY-MM-DD) — só o mês visível.
  const porDia = useMemo(() => {
    const mapa = new Map<string, Incidente[]>()
    for (const i of incidentes) {
      const d = dataAgenda(i)
      if (d.getFullYear() !== ano || d.getMonth() !== mes) continue
      const chave = dataInputValue(d)
      const lista = mapa.get(chave) ?? []
      lista.push(i)
      mapa.set(chave, lista)
    }
    return mapa
  }, [incidentes, ano, mes])

  const vencidosNoMes = useMemo(
    () => [...porDia.values()].flat().filter(i => statusPrazo(i.prazo_resolucao, i.resolved)?.atrasado).length,
    [porDia],
  )

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay()
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const chaveHoje = dataInputValue(hoje)

  // Células: brancos de preenchimento + os dias do mês.
  const celulas: (number | null)[] = [
    ...Array.from({ length: primeiroDiaSemana }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ]

  function irMes(delta: number) {
    setMesRef(new Date(ano, mes + delta, 1))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => irMes(-1)}
            className="btn-press flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface-canvas text-ink-secondary hover:text-ink"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-[15px] font-semibold text-ink tabular-nums min-w-[9.5rem] text-center">
            {MESES[mes]} {ano}
          </h2>
          <button
            onClick={() => irMes(1)}
            className="btn-press flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface-canvas text-ink-secondary hover:text-ink"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setMesRef(new Date(hoje.getFullYear(), hoje.getMonth(), 1))}
            className="btn-press ml-1 rounded-full border border-line bg-surface-canvas px-3 py-1.5 text-[12px] font-medium text-ink-secondary hover:text-ink"
          >
            Hoje
          </button>
        </div>
        <p className="text-[12px] text-ink-muted">
          Posicionado pelo prazo de resolução.
          {vencidosNoMes > 0 && (
            <> · <span className="text-urg-critFg font-medium">{vencidosNoMes} vencido{vencidosNoMes > 1 ? 's' : ''}</span></>
          )}
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
      ) : (
        <div className="card-surface overflow-hidden p-0">
          {/* Cabeçalho de dias da semana */}
          <div className="grid grid-cols-7 border-b border-line-soft bg-surface-subtle/50">
            {SEMANA.map(d => (
              <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {d}
              </div>
            ))}
          </div>

          {/* Grade de dias */}
          <div className="grid grid-cols-7">
            {celulas.map((dia, idx) => {
              if (dia === null) {
                return <div key={`b${idx}`} className="min-h-[92px] border-b border-r border-line-soft bg-surface-subtle/20" />
              }
              const chave = dataInputValue(new Date(ano, mes, dia))
              const doDia = porDia.get(chave) ?? []
              const ehHoje = chave === chaveHoje
              return (
                <div
                  key={dia}
                  className={cn(
                    'min-h-[92px] border-b border-r border-line-soft p-1.5 space-y-1',
                    ehHoje && 'bg-accentBlue-soft/30',
                  )}
                >
                  <div className="flex justify-end">
                    <span className={cn(
                      'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums',
                      ehHoje ? 'bg-accentBlue text-white font-semibold' : 'text-ink-muted',
                    )}>
                      {dia}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {doDia.slice(0, 3).map(i => (
                      <button
                        key={i.id}
                        onClick={() => navigate(`/incidentes?incidente=${i.id}`)}
                        title={`${i.teacher_name} · ${i.problem_type}`}
                        className={cn(
                          'btn-press flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[10.5px] font-medium hover:bg-surface-subtle transition-colors',
                          i.resolved && 'opacity-60',
                        )}
                      >
                        <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', tomIncidente(i))} />
                        <span className={cn('truncate', i.resolved ? 'text-ink-muted line-through' : 'text-ink-secondary')}>
                          {i.teacher_name}
                        </span>
                      </button>
                    ))}
                    {doDia.length > 3 && (
                      <button
                        onClick={() => navigate('/incidentes')}
                        className="btn-press w-full px-1.5 text-left text-[10px] text-ink-muted hover:text-ink"
                      >
                        + {doDia.length - 3} mais
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-urg-critFg" />Vencido</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-urg-highFg" />Alta</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-urg-medFg" />Média</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-urg-lowFg" />Baixa / resolvido</span>
        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />clique abre o incidente</span>
      </div>
    </div>
  )
}
