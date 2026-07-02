import { useState } from 'react'
import { CalendarClock, Users, Check, X, CircleUserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgendaDisponivel as AgendaDisponivelType, HorarioDisponivel } from '@/hooks/useTeacherLookup'

const TZ = 'America/Sao_Paulo'

// ─── Formatação (fuso America/Sao_Paulo, igual às telas internas) ─────────────

/** Chave estável do dia (YYYY-MM-DD) para agrupar horários. */
function diaKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}

function horaLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
}

function partesDoDia(iso: string) {
  const d = new Date(iso)
  return {
    semana: d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: TZ }).replace('.', ''),
    numero: d.toLocaleDateString('pt-BR', { day: '2-digit', timeZone: TZ }),
    mes:    d.toLocaleDateString('pt-BR', { month: 'short', timeZone: TZ }).replace('.', ''),
  }
}

/** Rótulo curto e completo pro resumo da confirmação. Ex.: "Qua, 07 de jul". */
function diaResumo(iso: string): string {
  const { semana, numero, mes } = partesDoDia(iso)
  const semanaCap = semana.charAt(0).toUpperCase() + semana.slice(1)
  return `${semanaCap}, ${numero} de ${mes}`
}

/** Agrupa os horários por dia e ordena dias e horários cronologicamente. */
function agruparPorDia(horarios: HorarioDisponivel[]): [string, HorarioDisponivel[]][] {
  const mapa = new Map<string, HorarioDisponivel[]>()
  for (const h of horarios) {
    const k = diaKey(h.data_hora)
    const arr = mapa.get(k) ?? []
    arr.push(h)
    mapa.set(k, arr)
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, arr]) => [k, arr.sort((x, y) => x.data_hora.localeCompare(y.data_hora))] as [string, HorarioDisponivel[]])
}

type Selecao = { agenda: AgendaDisponivelType; horario: HorarioDisponivel }

// ─── Página ───────────────────────────────────────────────────────────────────

export function AgendaDisponivel({
  professorNome, agendas, onConfirmar, pending,
}: {
  professorNome: string
  agendas: AgendaDisponivelType[]
  onConfirmar: (horarioId: string) => Promise<void>
  pending: boolean
}) {
  const [selecao, setSelecao] = useState<Selecao | null>(null)

  const hoje   = new Date()
  const amanha = new Date(hoje)
  amanha.setDate(amanha.getDate() + 1)
  const hojeKey   = hoje.toLocaleDateString('en-CA', { timeZone: TZ })
  const amanhaKey = amanha.toLocaleDateString('en-CA', { timeZone: TZ })

  async function confirmar() {
    if (!selecao) return
    await onConfirmar(selecao.horario.id)
    setSelecao(null)
  }

  if (agendas.length === 0) {
    return (
      <div className="w-full max-w-sm space-y-4 text-center animate-fade-up">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle text-ink-muted">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-[1.5rem] font-bold tracking-[-0.03em] text-ink">Olá, {professorNome}!</h1>
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            No momento não há reuniões em grupo disponíveis pra você. Volte mais tarde ou fale com sua coordenação.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-lg flex-col max-h-[calc(100dvh-2.5rem)] animate-fade-up">
      {/* Cabeçalho */}
      <div className="shrink-0 space-y-1.5 pb-5">
        <span className="label-micro flex items-center gap-1.5 text-accentBlue">
          <span className="h-1.5 w-1.5 rounded-full bg-accentBlue" />
          Reuniões em grupo
        </span>
        <h1 className="text-[1.7rem] font-bold tracking-[-0.03em] text-ink leading-none">
          Olá, {professorNome}!
        </h1>
        <p className="text-[14px] text-ink-muted leading-relaxed">
          Escolha o horário que melhor encaixa na sua rotina.
        </p>
      </div>

      {/* Timeline de agendas — rola por dentro se precisar */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 -mr-1">
        <div className="space-y-4 pb-1">
          {agendas.map((agenda, i) => (
            <section
              key={agenda.id}
              className="card-bezel animate-fade-up"
              style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'both' }}
            >
              <div className="space-y-4 p-5 sm:p-6">
                {/* Cabeçalho da agenda */}
                <div className="flex items-start gap-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accentBlue-soft text-accentBlue">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[15px] font-semibold leading-tight text-ink">{agenda.titulo}</p>
                    {agenda.coordenador && (
                      <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
                        <CircleUserRound className="h-3.5 w-3.5" />
                        com {agenda.coordenador.nome}
                      </span>
                    )}
                    {agenda.descricao && (
                      <p className="text-[12.5px] leading-relaxed text-ink-muted">{agenda.descricao}</p>
                    )}
                  </div>
                </div>

                {/* Dias + horários */}
                <div className="space-y-3.5 border-t border-line-soft pt-4">
                  {agruparPorDia(agenda.horarios).map(([key, horarios]) => (
                    <div key={key} className="flex gap-3.5">
                      <DiaPill
                        iso={horarios[0].data_hora}
                        relativo={key === hojeKey ? 'hoje' : key === amanhaKey ? 'amanha' : null}
                      />
                      <div className="flex flex-1 flex-wrap gap-2 pt-0.5">
                        {horarios.map(h => (
                          <SlotButton
                            key={h.id}
                            horario={h}
                            selecionado={selecao?.horario.id === h.id}
                            onSelecionar={() => setSelecao({ agenda, horario: h })}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Barra de confirmação — sobe com spring ao selecionar */}
      {selecao && (
        <div className="shrink-0 pt-4">
          <div className="glass-pill flex items-center gap-3 rounded-2xl p-2.5 pl-4 animate-spring-in">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] text-ink-muted">{selecao.agenda.titulo}</p>
              <p className="truncate text-[14px] font-semibold text-ink">
                {diaResumo(selecao.horario.data_hora)} · <span className="tabular-nums">{horaLabel(selecao.horario.data_hora)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelecao(null)}
              disabled={pending}
              aria-label="Trocar horário"
              className="btn-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-subtle hover:text-ink-secondary disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={pending}
              className="btn-press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accentBlue px-4 text-[13px] font-medium text-white hover:bg-accentBlue-hov disabled:opacity-60"
            >
              {pending ? 'Confirmando…' : (<><Check className="h-3.5 w-3.5" />Confirmar</>)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Marcador do dia (integrado ao modelo de agenda das telas internas) ────────

function DiaPill({ iso, relativo }: { iso: string; relativo: 'hoje' | 'amanha' | null }) {
  const { semana, numero, mes } = partesDoDia(iso)
  const legenda = relativo === 'hoje' ? 'Hoje' : relativo === 'amanha' ? 'Amanhã' : mes

  return (
    <div className="flex w-11 shrink-0 flex-col items-center">
      <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">{semana}</span>
      <span className={cn(
        'mt-1 flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-semibold tabular-nums',
        relativo === 'hoje' ? 'bg-brand text-white' : 'bg-surface-subtle text-ink',
      )}>
        {numero}
      </span>
      <span className={cn(
        'mt-1 text-[9.5px] font-medium capitalize',
        relativo === 'hoje' ? 'text-brand' : relativo === 'amanha' ? 'text-accentBlue' : 'text-ink-subtle',
      )}>
        {legenda}
      </span>
    </div>
  )
}

// ─── Slot de horário ────────────────────────────────────────────────────────────

function SlotButton({ horario, selecionado, onSelecionar }: {
  horario: HorarioDisponivel
  selecionado: boolean
  onSelecionar: () => void
}) {
  const lotado = horario.ja_inscrito

  return (
    <button
      type="button"
      disabled={lotado}
      onClick={onSelecionar}
      aria-pressed={selecionado}
      className={cn(
        'btn-press relative flex flex-col items-start gap-0.5 rounded-xl border px-3.5 py-2 text-left',
        lotado
          ? 'cursor-not-allowed border-line-soft bg-surface-subtle/50 opacity-70'
          : selecionado
            ? 'border-accentBlue bg-accentBlue-soft/70 shadow-sm ring-2 ring-accentBlue/25'
            : 'border-line-soft bg-surface-canvas hover:border-accentBlue/40 hover:bg-accentBlue-soft/25',
      )}
    >
      <span className={cn(
        'text-[15px] font-semibold tabular-nums',
        selecionado ? 'text-accentBlue-hov' : 'text-ink',
      )}>
        {horaLabel(horario.data_hora)}
      </span>
      <span className="flex items-center gap-1 text-[11px] text-ink-muted">
        {lotado
          ? (<><Check className="h-3 w-3" />Você já está inscrito</>)
          : (<><Users className="h-3 w-3" />{horario.vagas} vaga{horario.vagas === 1 ? '' : 's'}</>)}
      </span>

      {selecionado && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accentBlue text-white shadow-sm">
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  )
}
