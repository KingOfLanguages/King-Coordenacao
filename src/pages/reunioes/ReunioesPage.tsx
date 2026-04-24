import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, CalendarPlus, ChevronDown, ChevronUp, User,
  AlertCircle, Loader2, Check, X, Video, ExternalLink,
  CalendarDays, Zap, ZapOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useProfessoresAtivos } from '@/hooks/useProfessores'
import {
  useReunioesHoje,
  useReunioesAtrasadas,
  useCriarReuniao,
  useConcluirReuniao,
  type ReuniaoCompleta,
  type MonitoramentoResultado,
} from '@/hooks/useReunioes'
import {
  obterTokenGoogle,
  solicitarCodigoGoogle,
  buscarEventosDia,
  isReuniaoComProfessor,
  matchProfessor,
  eventStartTime,
  eventEndTime,
  eventStartDate,
  type CalendarEvent,
} from '@/lib/googleCalendar'
import { useGoogleAutomation, useDesativarAutomacao } from '@/hooks/useGoogleAutomation'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type Aba = 'hoje' | 'atrasadas'

type ImportState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'review'; events: CalendarEvent[]; matched: Map<string, string | null> }
  | { phase: 'saving' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTempo(dataInicio: string | null): string {
  if (!dataInicio) return '—'
  const diff   = Date.now() - new Date(dataInicio).getTime()
  const days   = Math.floor(diff / 86_400_000)
  const years  = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const rem    = days % 30
  return `${years} anos, ${months} meses e ${rem} dias`
}

function formatDataReuniao(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function formatHoraReuniao(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  })
}

function horaFim(iso: string, duracaoMin = 30): string {
  return formatHoraReuniao(
    new Date(new Date(iso).getTime() + duracaoMin * 60_000).toISOString(),
  )
}

const MONITORAMENTO_LABELS: Record<MonitoramentoResultado, string> = {
  normal:           'Normal',
  alta_prioridade:  'Alta Prioridade',
  baixa_prioridade: 'Baixa Prioridade',
}

// ─── MeetLinkButton ───────────────────────────────────────────────────────────

function MeetLinkButton({ href, size = 'sm' }: { href: string | null | undefined; size?: 'sm' | 'xs' }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className={cn(
        'btn-press inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
        'bg-accentBlue/10 text-accentBlue border border-accentBlue/25 hover:bg-accentBlue hover:text-white',
        size === 'xs'
          ? 'px-2 py-0.5 text-[11px]'
          : 'px-2.5 py-1 text-[12px]',
      )}
    >
      <Video className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} />
      Entrar
    </a>
  )
}

// ─── AgendaSection ────────────────────────────────────────────────────────────

function AgendaSection({ reunioes, label }: { reunioes: ReuniaoCompleta[]; label: string }) {
  if (!reunioes.length) return null

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">
        <CalendarDays className="h-3.5 w-3.5" />
        {label}
      </div>

      <div className="card-surface overflow-hidden divide-y divide-line-soft">
        {reunioes.map(r => {
          const prof     = r.professores
          const hasMatch = !!prof
          const meetHref = r.meet_link ?? undefined

          return (
            <div
              key={r.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              {/* Horário */}
              <div className="w-24 flex-shrink-0 text-[12px] font-medium text-ink tabular-nums">
                {formatHoraReuniao(r.data)}
                <span className="text-ink-muted font-normal"> — {horaFim(r.data)}</span>
              </div>

              {/* Título + professor */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-ink truncate leading-snug">
                  {r.titulo ?? (prof ? `1:1 com teacher (${prof.nome})` : 'Reunião')}
                </p>
                <p className={cn(
                  'text-[11px] mt-0.5',
                  hasMatch ? 'text-ink-muted' : 'text-urg-medFg',
                )}>
                  {hasMatch ? prof!.nome : 'Sem vínculo com professor'}
                </p>
              </div>

              {/* Status */}
              {r.status === 'concluida' && (
                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-urg-lowBg text-urg-lowFg text-[11px] font-medium">
                  <Check className="h-3 w-3" /> Concluída
                </span>
              )}

              {/* Link */}
              <MeetLinkButton href={meetHref} size="xs" />
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── MeetingCard ──────────────────────────────────────────────────────────────

function MeetingCard({ reuniao }: { reuniao: ReuniaoCompleta }) {
  const [expanded,  setExpanded]  = useState(true)
  const [hist,      setHist]      = useState(false)
  const [monit,     setMonit]     = useState<MonitoramentoResultado>('normal')
  const [aconteceu, setAconteceu] = useState<'sim' | 'nao' | ''>('')
  const [obs,       setObs]       = useState('')

  const concluir = useConcluirReuniao()
  const navigate = useNavigate()

  const prof    = reuniao.professores
  const ultiObs = reuniao.ultima_observacao
  const isPend  = reuniao.status === 'pendente'
  const isConc  = reuniao.status === 'concluida'
  const isCan   = reuniao.status === 'cancelada'

  async function handleSalvar() {
    if (!aconteceu)            { toast.error('Selecione se a reunião aconteceu.'); return }
    if (!obs.trim())           { toast.error('A observação é obrigatória.'); return }
    if (!reuniao.professor_id) { toast.error('Reunião sem professor vinculado.'); return }

    try {
      await concluir.mutateAsync({
        reuniaoId:              reuniao.id,
        professorId:            reuniao.professor_id,
        aconteceu:              aconteceu === 'sim',
        monitoramentoResultado: monit,
        observacao:             obs.trim(),
      })
      toast.success('Reunião concluída.')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar.')
    }
  }

  // Status badge
  const statusBadge = isConc ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-urg-lowBg text-urg-lowFg text-[11px] font-medium">
      <Check className="h-3 w-3" /> Concluída
    </span>
  ) : isCan ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-muted text-ink-muted text-[11px] font-medium">
      <X className="h-3 w-3" /> Cancelada
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accentBlue-soft text-accentBlue text-[11px] font-medium">
      Pendente
    </span>
  )

  return (
    <div className="card-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-line-soft">
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold text-ink">
            {prof?.nome ?? 'Professor não vinculado'}
          </h3>
          <p className="text-[12px] text-ink-muted tabular-nums">
            {formatDataReuniao(reuniao.data)} &bull; {formatHoraReuniao(reuniao.data)}
            {' '}— {horaFim(reuniao.data)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MeetLinkButton href={reuniao.meet_link} />
          {statusBadge}
          <button
            onClick={() => setExpanded(e => !e)}
            className="btn-press h-7 w-7 flex items-center justify-center rounded-md hover:bg-surface-subtle text-ink-muted"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 py-4 space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Reunião */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-muted uppercase">Reunião</p>
              <div className="space-y-1 text-[12px] text-ink-secondary">
                <p>
                  <span className="text-ink font-medium">Título:</span>{' '}
                  {reuniao.titulo ?? `1:1 com teacher (${prof?.nome ?? '—'})`}
                </p>
                <p>
                  <span className="text-ink font-medium">Coordenador:</span>{' '}
                  {reuniao.coordenador?.nome ?? '—'}
                </p>
              </div>
            </div>

            {/* Professor */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-muted uppercase">Professor</p>
              <div className="space-y-1 text-[12px] text-ink-secondary">
                <p>
                  <span className="text-ink font-medium">Início:</span>{' '}
                  {prof?.data_inicio ? new Date(prof.data_inicio).toLocaleDateString('pt-BR') : '—'}
                </p>
                <p>
                  <span className="text-ink font-medium">Tempo:</span>{' '}
                  {calcTempo(prof?.data_inicio ?? null)}
                </p>
                {prof?.monitoramento && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-urg-medBg text-urg-medFg text-[11px] font-medium">
                    ● Alta Prioridade
                  </span>
                )}
              </div>
            </div>

            {/* Última observação */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-muted uppercase">Última observação</p>
              {ultiObs ? (
                <div className="rounded-lg border border-line bg-surface-subtle p-2.5 space-y-1.5 text-[12px]">
                  <span className={cn(
                    'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium',
                    ultiObs.tipo === 'reuniao'            ? 'bg-accentBlue-soft text-accentBlue' :
                    ultiObs.tipo === 'feedback_positivo'  ? 'bg-urg-lowBg text-urg-lowFg' :
                    ultiObs.tipo === 'feedback_negativo'  ? 'bg-urg-highBg text-urg-highFg' :
                                                            'bg-urg-medBg text-urg-medFg',
                  )}>
                    {ultiObs.tipo === 'reuniao'           ? 'Reunião' :
                     ultiObs.tipo === 'feedback_positivo' ? 'Feedback positivo' :
                     ultiObs.tipo === 'feedback_negativo' ? 'Feedback negativo' :
                     'Ocorrência'}
                  </span>
                  <p className="text-ink-secondary leading-relaxed line-clamp-3">{ultiObs.texto}</p>
                  <p className="text-ink-muted tabular-nums">
                    {new Date(ultiObs.created_at).toLocaleDateString('pt-BR')}
                    {ultiObs.profiles?.nome && ` · ${ultiObs.profiles.nome}`}
                  </p>
                </div>
              ) : (
                <p className="text-[12px] text-ink-muted italic">Sem observações.</p>
              )}
            </div>
          </div>

          {/* Formulário de conclusão */}
          {isPend && (
            <div className="border-t border-line-soft pt-4 space-y-3">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted uppercase">
                Concluir reunião
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="label-micro">Monitoramento</Label>
                  <Select value={monit} onValueChange={v => setMonit(v as MonitoramentoResultado)}>
                    <SelectTrigger className="h-9 bg-surface-canvas border-line text-ink text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-canvas border-line text-ink">
                      {(Object.entries(MONITORAMENTO_LABELS) as [MonitoramentoResultado, string][]).map(
                        ([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="label-micro">A reunião aconteceu?</Label>
                  <Select value={aconteceu} onValueChange={v => setAconteceu(v as 'sim' | 'nao')}>
                    <SelectTrigger className="h-9 bg-surface-canvas border-line text-ink text-[13px]">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-canvas border-line text-ink">
                      <SelectItem value="sim">Sim</SelectItem>
                      <SelectItem value="nao">Não</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="label-micro">
                  Observação <span className="text-brand">*</span>
                </Label>
                <textarea
                  rows={3}
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  placeholder="Obrigatória…"
                  className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={handleSalvar}
                  disabled={concluir.isPending}
                  className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white gap-1.5"
                >
                  {concluir.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Salvando…</>
                    : 'Salvar reunião'}
                </Button>

                {prof?.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/professores/${prof.id}`)}
                    className="btn-press border-line text-ink-secondary gap-1.5"
                  >
                    <User className="h-3.5 w-3.5" />Ver perfil
                  </Button>
                )}

                <button
                  onClick={() => setHist(h => !h)}
                  className="btn-press text-[12px] text-ink-muted hover:text-ink flex items-center gap-1 ml-auto"
                >
                  Histórico{' '}
                  {hist ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )}

          {/* Histórico */}
          {hist && ultiObs && (
            <div className="border-t border-line-soft pt-3 space-y-2">
              <p className="label-micro">Histórico de observações</p>
              <div className="rounded-lg border border-line bg-surface-subtle p-3 text-[12px] text-ink-secondary">
                {ultiObs.texto}
                <p className="text-ink-muted mt-1 tabular-nums">
                  {new Date(ultiObs.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ReunioesPage ─────────────────────────────────────────────────────────────

export function ReunioesPage() {
  const { profile } = useAuth()
  const [aba,         setAba]         = useState<Aba>('hoje')
  const [importState, setImportState] = useState<ImportState>({ phase: 'idle' })
  const [ativando,    setAtivando]    = useState(false)

  const { data: hoje      = [], isLoading: loadHoje,      isError: errHoje,      refetch: refetchHoje      } = useReunioesHoje()
  const { data: atrasadas = [], isLoading: loadAtrasadas, isError: errAtrasadas, refetch: refetchAtrasadas } = useReunioesAtrasadas()
  const { data: professores = [] } = useProfessoresAtivos()
  const criarReuniao   = useCriarReuniao()
  const automation     = useGoogleAutomation()
  const desativar      = useDesativarAutomacao()
  const queryClient    = useQueryClient()

  // Split today's meetings: agenda (all) vs launch (professor-linked only)
  const agendaHoje   = hoje
  const paraLancar   = hoje.filter(r => !!r.professor_id)

  const reunioes  = aba === 'hoje' ? paraLancar : atrasadas
  const isLoading = aba === 'hoje' ? loadHoje   : loadAtrasadas
  const isError   = aba === 'hoje' ? errHoje    : errAtrasadas

  // ── Handlers ──

  function handleRefresh() {
    refetchHoje()
    refetchAtrasadas()
    toast.success('Atualizado.')
  }

  async function handleAtivarAutomacao() {
    try {
      setAtivando(true)
      const code = await solicitarCodigoGoogle()

      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('exchange-google-token', {
        body:    { code },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })

      if (error || data?.error) {
        throw new Error(data?.error ?? error?.message ?? 'Erro desconhecido.')
      }

      toast.success('Importação automática ativada. Reuniões serão importadas todo dia às 8h.')
      queryClient.invalidateQueries({ queryKey: ['google', 'automation'] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Se o usuário fechou o popup, não mostra erro
      if (!msg.toLowerCase().includes('popup_closed') && !msg.toLowerCase().includes('access_denied')) {
        toast.error(`Erro ao ativar: ${msg}`)
      }
    } finally {
      setAtivando(false)
    }
  }

  async function handleDesativarAutomacao() {
    try {
      await desativar.mutateAsync()
      toast.success('Importação automática desativada.')
    } catch {
      toast.error('Erro ao desativar.')
    }
  }

  async function handleImportar() {
    try {
      setImportState({ phase: 'loading' })

      const token     = await obterTokenGoogle()
      const rawEvents = await buscarEventosDia(token)

      // Only filter genuine meetings — still keep ALL of them for agenda
      const events = rawEvents.filter(isReuniaoComProfessor)

      if (!events.length) {
        toast.info('Nenhuma reunião encontrada no calendário de hoje.')
        setImportState({ phase: 'idle' })
        return
      }

      const matched = new Map<string, string | null>()
      events.forEach(ev => {
        const prof = matchProfessor(ev, professores)
        matched.set(ev.id, prof?.id ?? null)
      })

      setImportState({ phase: 'review', events, matched })
    } catch (err) {
      console.error(err)
      toast.error('Erro ao importar do Google Calendar.')
      setImportState({ phase: 'idle' })
    }
  }

  async function handleConfirmarImporte() {
    if (importState.phase !== 'review') return

    const { events, matched } = importState
    setImportState({ phase: 'saving' })

    let saved    = 0
    let skipped  = 0
    let needsMig = false   // professor_id NOT NULL still in DB
    let firstErr = ''

    function parseErr(e: unknown): string {
      if (e && typeof e === 'object') {
        if ('message' in e) return String((e as { message: unknown }).message)
      }
      return e instanceof Error ? e.message : String(e)
    }

    for (const ev of events) {
      const profId   = matched.get(ev.id) ?? null
      const meetHref = ev.hangoutLink ?? ev.htmlLink ?? null

      // Build payload: omit nullable fields when they're null so we don't
      // fail on columns that may not exist in the DB yet (meet_link)
      const base = {
        coordenador_id:  profile!.id,
        data:            eventStartDate(ev).toISOString(),
        titulo:          ev.summary,
        google_event_id: ev.id,
      }
      const payload = {
        ...base,
        ...(profId   ? { professor_id: profId }   : {}),
        ...(meetHref ? { meet_link:    meetHref }  : {}),
      }

      try {
        await criarReuniao.mutateAsync(payload)
        saved++
      } catch (err1: unknown) {
        const msg1 = parseErr(err1)
        console.warn(`[import] "${ev.summary}" — tentativa 1:`, msg1)

        // Fallback 1: meet_link column may not exist yet → retry without it
        if (meetHref && /meet_link|column/.test(msg1)) {
          try {
            await criarReuniao.mutateAsync({ ...base, ...(profId ? { professor_id: profId } : {}) })
            saved++
            continue
          } catch (err2: unknown) {
            const msg2 = parseErr(err2)
            console.warn(`[import] "${ev.summary}" — tentativa 2 (sem meet_link):`, msg2)
            // If professor_id is still NOT NULL, skip silently and flag migration
            if (/not.null|professor_id/.test(msg2.toLowerCase())) {
              needsMig = true; skipped++; continue
            }
            if (!firstErr) firstErr = msg2
            skipped++
          }
          continue
        }

        // professor_id column is still NOT NULL → migration not applied
        if (/not.null|professor_id/.test(msg1.toLowerCase())) {
          needsMig = true; skipped++; continue
        }

        if (!firstErr) firstErr = msg1
        skipped++
      }
    }

    // ── Toast summary ──
    if (saved === 0) {
      if (needsMig) {
        toast.error(
          'Nenhum evento importado. Execute a migration no Supabase (SQL Editor):\n' +
          'ALTER TABLE reunioes ALTER COLUMN professor_id DROP NOT NULL;\n' +
          'ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS meet_link TEXT;',
          { duration: 10000 }
        )
      } else {
        toast.error(`Erro ao importar: ${firstErr || 'desconhecido'}`, { duration: 8000 })
      }
    } else {
      const nMatched   = [...matched.values()].filter(Boolean).length
      const nUnmatched = saved - nMatched

      if (nMatched > 0 && nUnmatched > 0) {
        toast.success(`${nMatched} vinculada(s), ${nUnmatched} na agenda.`)
      } else if (nMatched > 0) {
        toast.success(`${saved} reunião(ões) importada(s).`)
      } else {
        toast.info(`${saved} evento(s) adicionado(s) à agenda.`)
      }

      if (skipped > 0 && needsMig) {
        toast.warning(
          `${skipped} evento(s) sem vínculo não foram salvos — execute a migration no Supabase para habilitar a agenda completa.`,
          { duration: 8000 }
        )
      }
    }

    setImportState({ phase: 'idle' })
    refetchHoje()
    refetchAtrasadas()
  }

  const hoje_label = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const isBusy = importState.phase === 'loading' || importState.phase === 'saving'

  // ── Render ──

  return (
    <div className="px-6 py-6 max-w-[820px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            Painel —{' '}
            <span className="text-ink-secondary font-normal">
              {profile?.nome?.split(' ')[0]}
            </span>
          </h1>
          <p className="text-[12px] text-ink-muted mt-0.5">agenda operacional.</p>
        </div>

        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            className="btn-press border-line text-ink-secondary gap-1.5 text-[12px]"
          >
            <RefreshCw className="h-3.5 w-3.5" />Recarregar
          </Button>

          <Button
            size="sm"
            onClick={handleImportar}
            disabled={isBusy}
            className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white gap-1.5 text-[12px]"
          >
            {importState.phase === 'loading'
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Importando…</>
              : <><CalendarPlus className="h-3.5 w-3.5" />Importar reuniões</>}
          </Button>
        </div>
      </div>

      {/* ── Automação ── */}
      {!automation.isLoading && (
        <div className={cn(
          'flex items-center justify-between gap-4 rounded-xl border px-4 py-3',
          automation.data
            ? 'border-urg-lowFg/25 bg-urg-lowBg'
            : 'border-line bg-surface-subtle/60',
        )}>
          <div className="flex items-center gap-2.5 min-w-0">
            {automation.data
              ? <Zap    className="h-4 w-4 text-urg-lowFg flex-shrink-0" />
              : <ZapOff className="h-4 w-4 text-ink-muted flex-shrink-0" />
            }
            <div className="min-w-0">
              <p className={cn('text-[13px] font-medium', automation.data ? 'text-urg-lowFg' : 'text-ink')}>
                Importação automática{' '}
                {automation.data
                  ? <span className="font-semibold">ativa</span>
                  : <span className="text-ink-muted font-normal">inativa</span>
                }
              </p>
              <p className="text-[11px] text-ink-muted mt-0.5">
                {automation.data
                  ? `Configurada em ${new Date(automation.data.updated_at).toLocaleDateString('pt-BR')} · importa todo dia de semana às 8:00`
                  : 'Ative para importar reuniões automaticamente às 8:00 de cada dia de semana.'
                }
              </p>
            </div>
          </div>

          {automation.data ? (
            <Button
              size="sm"
              variant="outline"
              disabled={desativar.isPending}
              onClick={handleDesativarAutomacao}
              className="btn-press shrink-0 h-7 text-[11px] border-urg-highFg/25 text-urg-highFg hover:bg-urg-highBg"
            >
              {desativar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Desativar'}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={ativando}
              onClick={handleAtivarAutomacao}
              className="btn-press shrink-0 h-7 text-[11px] bg-accentBlue hover:bg-accentBlue-hov text-white gap-1.5"
            >
              {ativando
                ? <><Loader2 className="h-3 w-3 animate-spin" />Aguardando…</>
                : <><Zap className="h-3 w-3" />Ativar</>
              }
            </Button>
          )}
        </div>
      )}

      {/* ── Painel de revisão ── */}
      {importState.phase === 'review' && (
        <div className="card-surface border border-accentBlue/25 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-ink">
                {importState.events.length} evento(s) encontrado(s) no Google Calendar
              </p>
              <p className="text-[11px] text-ink-muted mt-0.5">
                {professores.length > 0
                  ? <>{professores.length} professores disponíveis · <span className="text-urg-lowFg font-medium">{[...importState.matched.values()].filter(Boolean).length} vinculado(s)</span> · {[...importState.matched.values()].filter(v => !v).length} para agenda</>
                  : <span className="text-urg-highFg font-medium">⚠ Nenhum professor carregado — todos irão para a agenda sem vínculo</span>
                }
              </p>
            </div>
            <button onClick={() => setImportState({ phase: 'idle' })} className="text-ink-muted hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {importState.events.map(ev => {
              const profId   = importState.matched.get(ev.id) ?? null
              const profNome = professores.find(p => p.id === profId)?.nome ?? null
              const hasMeet  = !!(ev.hangoutLink ?? ev.htmlLink)
              return (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-surface-subtle px-3 py-2 text-[12px]"
                >
                  <span className="tabular-nums text-ink-muted shrink-0">
                    {eventStartTime(ev)} — {eventEndTime(ev)}
                  </span>
                  <span className="flex-1 truncate text-ink">{ev.summary}</span>
                  {hasMeet && (
                    <Video className="h-3 w-3 text-accentBlue shrink-0" />
                  )}
                  {profNome ? (
                    <span className="shrink-0 px-2 py-0.5 rounded bg-urg-lowBg text-urg-lowFg text-[11px] font-medium">
                      → {profNome}
                    </span>
                  ) : (
                    <span className="shrink-0 px-2 py-0.5 rounded bg-surface-muted text-ink-muted text-[11px]">
                      Agenda
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-ink-muted">
            Todos os eventos serão importados. Vinculados aparecem em &ldquo;Lançamentos&rdquo;; demais ficam na agenda pessoal do dia.
          </p>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleConfirmarImporte}
              disabled={isBusy}
              className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
            >
              {isBusy
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Salvando…</>
                : 'Confirmar importação'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImportState({ phase: 'idle' })}
              disabled={isBusy}
              className="btn-press border-line text-ink-secondary"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ── Agenda do dia ── */}
      {agendaHoje.length > 0 && (
        <AgendaSection
          reunioes={agendaHoje}
          label={`Agenda do dia — ${hoje_label}`}
        />
      )}

      {/* ── Tabs de lançamento ── */}
      <div className="flex items-center gap-2">
        {([
          { key: 'hoje',      label: 'Lançamentos hoje', count: paraLancar.length },
          { key: 'atrasadas', label: 'Atrasadas',        count: atrasadas.length  },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={cn(
              'btn-press inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-medium border',
              aba === key
                ? 'bg-ink text-surface-canvas border-ink'
                : 'bg-surface-canvas text-ink-secondary border-line hover:border-line-strong hover:text-ink',
            )}
          >
            {label}
            {count > 0 && (
              <span className={cn(
                'inline-flex items-center justify-center h-4 min-w-[16px] rounded-full text-[10px] font-semibold',
                aba === key
                  ? 'bg-surface-canvas/20 text-surface-canvas'
                  : key === 'atrasadas'
                  ? 'bg-urg-highBg text-urg-highFg'
                  : 'bg-surface-subtle text-ink-muted',
              )}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex h-32 items-center justify-center text-ink-muted text-[13px]">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />Carregando…
        </div>
      )}

      {/* Error */}
      {!isLoading && isError && (
        <div className="flex items-start gap-3 rounded-xl border border-urg-highFg/20 bg-urg-highBg p-4">
          <AlertCircle className="h-4 w-4 text-urg-highFg mt-0.5 shrink-0" />
          <div className="text-[12px] space-y-1">
            <p className="font-medium text-ink">Erro ao carregar reuniões</p>
            <p className="text-ink-secondary">
              Verifique a conexão com o banco e as permissões RLS da tabela{' '}
              <code className="rounded bg-surface-subtle px-1 font-mono text-[11px]">reunioes</code>.
            </p>
            <button
              onClick={() => { refetchHoje(); refetchAtrasadas() }}
              className="text-urg-highFg underline underline-offset-2"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && reunioes.length === 0 && (
        <div className="card-surface p-10 text-center space-y-2">
          {aba === 'hoje' ? (
            <>
              <p className="text-[15px] font-medium text-ink">Nenhuma reunião vinculada para hoje</p>
              <p className="text-[13px] text-ink-muted">
                Clique em &ldquo;Importar reuniões&rdquo; para buscar eventos do Google Calendar.
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium text-ink">Sem reuniões atrasadas</p>
              <p className="text-[13px] text-ink-muted">
                Todas as reuniões anteriores foram concluídas.
              </p>
            </>
          )}
        </div>
      )}

      {/* Aviso VITE_GOOGLE_CLIENT_ID ausente */}
      {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
        <div className="flex items-start gap-3 rounded-xl border border-urg-medFg/20 bg-urg-medBg p-4">
          <AlertCircle className="h-4 w-4 text-urg-medFg mt-0.5 shrink-0" />
          <div className="text-[12px] text-ink-secondary space-y-1">
            <p className="font-medium text-ink">Google Calendar não configurado</p>
            <p>
              Adicione{' '}
              <code className="rounded bg-surface-subtle px-1 py-0.5 font-mono text-[11px]">VITE_GOOGLE_CLIENT_ID</code>
              {' '}ao arquivo{' '}
              <code className="rounded bg-surface-subtle px-1 py-0.5 font-mono text-[11px]">.env.local</code>
              {' '}para ativar a importação automática.
            </p>
          </div>
        </div>
      )}

      {/* Cards de lançamento */}
      {!isLoading && !isError && reunioes.length > 0 && (
        <div className="space-y-4">
          {reunioes.map(r => <MeetingCard key={r.id} reuniao={r} />)}
        </div>
      )}

      {/* Link Google Calendar para o dia todo */}
      <div className="flex justify-center pt-2">
        <a
          href={`https://calendar.google.com/calendar/r/day`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-accentBlue transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Abrir Google Calendar
        </a>
      </div>
    </div>
  )
}
