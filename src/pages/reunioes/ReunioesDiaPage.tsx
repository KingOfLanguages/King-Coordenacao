import { useState } from 'react'
import {
  Video, Check, X, Link2, Mail, Sparkles, Zap, ZapOff,
  Loader2, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useCoordenadores } from '@/hooks/useAcompanhamento'
import {
  useReunioesDoDia, useDadosVinculo, useVincularProfessor, useConfirmarParticipacao,
  useCriarReuniaoManual, sugerirVinculos, type ReuniaoCard, type ParticipanteCard, type CandidatoVinculo,
} from '@/hooks/useReunioesDia'
import { useGoogleAutomation, useDesativarAutomacao } from '@/hooks/useGoogleAutomation'
import { useSendLembretesGeral } from '@/hooks/useSendLembrete'
import { solicitarCodigoGoogle } from '@/lib/googleCalendar'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { cn, tempoDeCasaLabel } from '@/lib/utils'
import { toast } from 'sonner'

type DadosVinculo = ReturnType<typeof useDadosVinculo>['data']

export function ReunioesDiaPage() {
  const { profile } = useAuth()
  const canSeeAll = profile?.role === 'admin'
    || profile?.role === 'suporte'
    || profile?.role === 'suporte_aluno'

  const { data: coordenadores = [] } = useCoordenadores()
  const [sel, setSel] = useState<string>('')
  const [novaOpen, setNovaOpen] = useState(false)
  const coordId = canSeeAll ? (sel || coordenadores[0]?.id || '') : (profile?.id ?? '')

  const { data: reunioes, isLoading } = useReunioesDoDia(coordId || null)
  const { data: dados } = useDadosVinculo()

  const lista = reunioes ?? []

  return (
    <div className="px-6 py-6 space-y-6 max-w-[900px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Reuniões do Dia</h1>
          <p className="text-[13px] text-ink-muted">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}{lista.length} reuniã{lista.length === 1 ? 'o' : 'es'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canSeeAll && coordenadores.length > 0 && (
            <Select value={coordId} onValueChange={setSel}>
              <SelectTrigger className="h-9 w-[200px] text-[12px] bg-surface-canvas border-line text-ink">
                <SelectValue placeholder="Selecione um coordenador" />
              </SelectTrigger>
              <SelectContent className="bg-surface-canvas border-line text-ink">
                {coordenadores.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-[12px]">{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setNovaOpen(true)}
            className="btn-press h-9 gap-1.5 border-line text-ink-secondary text-[12px]"
          >
            <Plus className="h-3.5 w-3.5" />Nova reunião
          </Button>
        </div>
      </header>

      <Toolbar />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="card-surface h-28 animate-pulse" />)}
        </div>
      ) : lista.length === 0 ? (
        <div className="card-surface p-10 text-center">
          <p className="text-[14px] font-medium text-ink">Nenhuma reunião hoje</p>
          <p className="text-[13px] text-ink-muted mt-1">A agenda deste coordenador está livre.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map(r => <ReuniaoCardView key={r.id} reuniao={r} dados={dados} />)}
        </div>
      )}

      {novaOpen && (
        <NovaReuniaoDialog profs={dados?.profs ?? []} onClose={() => setNovaOpen(false)} />
      )}
    </div>
  )
}

// ─── Toolbar — automação + lembretes ──────────────────────────────────────────

function Toolbar() {
  const automation  = useGoogleAutomation()
  const desativar   = useDesativarAutomacao()
  const sendGeral   = useSendLembretesGeral()
  const queryClient = useQueryClient()
  const [ativando, setAtivando] = useState(false)

  async function handleAtivar() {
    try {
      setAtivando(true)
      const code = await solicitarCodigoGoogle()
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('exchange-google-token', {
        body:    { code },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Erro desconhecido.')
      toast.success('Importação automática ativada. Reuniões serão importadas todo dia às 8h.')
      queryClient.invalidateQueries({ queryKey: ['google', 'automation'] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.toLowerCase().includes('popup_closed') && !msg.toLowerCase().includes('access_denied')) {
        toast.error(`Erro ao ativar: ${msg}`)
      }
    } finally {
      setAtivando(false)
    }
  }

  async function handleDesativar() {
    try {
      await desativar.mutateAsync()
      toast.success('Importação automática desativada.')
    } catch {
      toast.error('Erro ao desativar.')
    }
  }

  async function handleLembretes() {
    try {
      const result = await sendGeral.mutateAsync()
      if (result.sent > 0) {
        toast.success(`${result.sent} lembrete(s) enviado(s).${result.skipped > 0 ? ` ${result.skipped} sem email.` : ''}`)
      } else {
        toast.warning('Nenhum lembrete enviado — verifique se há reuniões pendentes com e-mail.')
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar lembretes.')
    }
  }

  if (automation.isLoading) return null

  return (
    <div className={cn(
      'flex items-center justify-between gap-4 rounded-xl border px-4 py-3',
      automation.data ? 'border-urg-lowFg/25 bg-urg-lowBg' : 'border-line bg-surface-subtle/60',
    )}>
      <div className="flex items-center gap-2.5 min-w-0">
        {automation.data
          ? <Zap className="h-4 w-4 text-urg-lowFg flex-shrink-0" />
          : <ZapOff className="h-4 w-4 text-ink-muted flex-shrink-0" />}
        <div className="min-w-0">
          <p className={cn('text-[13px] font-medium', automation.data ? 'text-urg-lowFg' : 'text-ink')}>
            Importação automática {automation.data
              ? <span className="font-semibold">ativa</span>
              : <span className="text-ink-muted font-normal">inativa</span>}
          </p>
          <p className="text-[11px] text-ink-muted mt-0.5">
            {automation.data
              ? 'Importa os eventos do Calendar todo dia de semana às 8:00.'
              : 'Ative para importar reuniões automaticamente do Google Calendar.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          variant="outline"
          disabled={sendGeral.isPending}
          onClick={handleLembretes}
          className="btn-press h-7 text-[11px] gap-1.5 border-line text-ink-secondary"
        >
          {sendGeral.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
          Lembretes
        </Button>

        {automation.data ? (
          <Button
            size="sm"
            variant="outline"
            disabled={desativar.isPending}
            onClick={handleDesativar}
            className="btn-press h-7 text-[11px] border-urg-highFg/25 text-urg-highFg hover:bg-urg-highBg"
          >
            {desativar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Desativar'}
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={ativando}
            onClick={handleAtivar}
            className="btn-press h-7 text-[11px] bg-accentBlue hover:bg-accentBlue-hov text-white gap-1.5"
          >
            {ativando ? <><Loader2 className="h-3 w-3 animate-spin" />Aguardando…</> : <><Zap className="h-3 w-3" />Ativar</>}
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Nova reunião (manual) ─────────────────────────────────────────────────────

function NovaReuniaoDialog({ profs, onClose }: { profs: { id: string; nome: string }[]; onClose: () => void }) {
  const criar = useCriarReuniaoManual()
  const [professorId, setProfessorId] = useState('')
  const [data, setData]               = useState('')
  const [hora, setHora]               = useState('08:00')
  const [titulo, setTitulo]           = useState('')

  async function handleSalvar() {
    if (!data) { toast.error('Selecione uma data.'); return }
    try {
      await criar.mutateAsync({
        professorId: professorId || null,
        data:        new Date(`${data}T${hora}:00`).toISOString(),
        titulo:      titulo || undefined,
      })
      toast.success('Reunião criada.')
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar reunião.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-canvas border border-line rounded-xl shadow-elevated w-full max-w-md mx-4 p-6 space-y-5 animate-fade-up">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-ink">Nova reunião</h2>
          <button onClick={onClose} className="btn-press text-ink-subtle hover:text-ink-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="label-micro">Professor</Label>
            <Select value={professorId} onValueChange={setProfessorId}>
              <SelectTrigger className="h-9 bg-surface-canvas border-line text-ink text-[13px]">
                <SelectValue placeholder="— Sem vínculo —" />
              </SelectTrigger>
              <SelectContent className="bg-surface-canvas border-line text-ink max-h-64">
                {profs.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-[13px]">{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="label-micro">Data <span className="text-brand">*</span></Label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} className="h-9 bg-surface-canvas border-line" />
            </div>
            <div className="space-y-1.5">
              <Label className="label-micro">Horário</Label>
              <Input type="time" value={hora} onChange={e => setHora(e.target.value)} className="h-9 bg-surface-canvas border-line" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Título (opcional)</Label>
            <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: 1:1 com teacher" className="h-9 bg-surface-canvas border-line" />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-ink-secondary">Cancelar</Button>
          <Button
            size="sm"
            onClick={handleSalvar}
            disabled={criar.isPending}
            className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white"
          >
            {criar.isPending ? 'Salvando…' : 'Criar reunião'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ReuniaoCardView({ reuniao, dados }: { reuniao: ReuniaoCard; dados: DadosVinculo }) {
  const hora = new Date(reuniao.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="card-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ink tabular-nums">{hora}</span>
            {reuniao.professor_email && (
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                <Mail className="h-3 w-3" />{reuniao.professor_email}
              </span>
            )}
          </div>
          {reuniao.titulo && <p className="text-[12px] text-ink-muted truncate mt-0.5">{reuniao.titulo}</p>}
        </div>

        {reuniao.meet_link && (
          <a
            href={reuniao.meet_link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-press inline-flex items-center gap-1.5 rounded-full bg-accentBlue px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accentBlue-hov flex-shrink-0"
          >
            <Video className="h-3.5 w-3.5" />Entrar
          </a>
        )}
      </div>

      <div className="border-t border-line-soft pt-3 space-y-3">
        {reuniao.participantes.length === 0 ? (
          <VincularBlock reuniao={reuniao} participanteId={null} dados={dados} />
        ) : (
          reuniao.participantes.map(part =>
            part.professor
              ? <ParticipanteRow key={part.id} part={part} />
              : <VincularBlock key={part.id} reuniao={reuniao} participanteId={part.id} dados={dados} />
          )
        )}
      </div>
    </div>
  )
}

// ─── Participante vinculado ─────────────────────────────────────────────────────

function ParticipanteRow({ part }: { part: ParticipanteCard }) {
  const confirmar = useConfirmarParticipacao()
  const [obs, setObs] = useState(part.observacao ?? '')
  const prof = part.professor!
  const tempo = tempoDeCasaLabel(prof.data_inicio)

  function confirmarReuniao(aconteceu: boolean) {
    confirmar.mutate(
      { participanteId: part.id, professorId: prof.id, aconteceu, observacao: obs },
      {
        onSuccess: () => toast.success(aconteceu ? 'Reunião confirmada.' : 'Marcada como não realizada.'),
        onError:   () => toast.error('Erro ao confirmar.'),
      },
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium text-ink truncate">{prof.nome}</span>
          {prof.monitoramento && (
            <span className="h-1.5 w-1.5 rounded-full bg-urg-highFg flex-shrink-0" title="Monitoramento ativo" />
          )}
          {tempo && <span className="text-[11px] text-ink-muted">· {tempo}</span>}
        </div>

        {part.status === 'realizada' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-urg-lowBg px-2 py-0.5 text-[11px] font-medium text-urg-lowFg flex-shrink-0">
            <Check className="h-3 w-3" />{part.numero ? `${part.numero}º monit.` : 'Realizada'}
          </span>
        )}
        {part.status === 'cancelada' && (
          <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-ink-muted flex-shrink-0">
            Não realizada
          </span>
        )}
      </div>

      {part.status === 'pendente' ? (
        <div className="space-y-2">
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="Observações da reunião…"
            className="w-full min-h-[64px] resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-accentBlue"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={confirmar.isPending}
              onClick={() => confirmarReuniao(true)}
              className="btn-press h-8 text-[12px] gap-1.5 bg-urg-lowFg text-white hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" />Realizada
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={confirmar.isPending}
              onClick={() => confirmarReuniao(false)}
              className="btn-press h-8 text-[12px] gap-1.5 border-line text-ink-secondary"
            >
              <X className="h-3.5 w-3.5" />Não aconteceu
            </Button>
          </div>
        </div>
      ) : (
        part.observacao && <p className="text-[12px] text-ink-secondary leading-relaxed">{part.observacao}</p>
      )}
    </div>
  )
}

// ─── Vincular (sugestões + manual) ──────────────────────────────────────────────

function VincularBlock({ reuniao, participanteId, dados }: {
  reuniao: ReuniaoCard
  participanteId: string | null
  dados: DadosVinculo
}) {
  const vincular = useVincularProfessor()
  const sugestoes = dados ? sugerirVinculos(reuniao, dados.profs, dados.emails) : []

  function link(professorId: string, motivo: 'email' | 'nome' | 'manual') {
    vincular.mutate(
      {
        reuniaoId: reuniao.id,
        participanteId,
        professorId,
        // Aprende o e-mail do Calendar quando o vínculo não veio do próprio e-mail.
        emailParaAprender: motivo === 'email' ? null : reuniao.professor_email,
      },
      {
        onSuccess: () => toast.success('Professor vinculado.'),
        onError:   () => toast.error('Erro ao vincular.'),
      },
    )
  }

  return (
    <div className="rounded-lg border border-dashed border-line bg-surface-subtle/40 p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-secondary">
        <Link2 className="h-3.5 w-3.5" />Professor não vinculado
      </div>

      {sugestoes.length > 0 && (
        <div className="space-y-1.5">
          {sugestoes.map(c => <Sugestao key={c.professor.id} c={c} pending={vincular.isPending} onLink={() => link(c.professor.id, c.motivo)} />)}
        </div>
      )}

      {/* Manual */}
      <Select onValueChange={v => link(v, 'manual')} disabled={vincular.isPending}>
        <SelectTrigger className="h-8 text-[12px] bg-surface-canvas border-line text-ink">
          <SelectValue placeholder="Vincular manualmente…" />
        </SelectTrigger>
        <SelectContent className="bg-surface-canvas border-line text-ink max-h-64">
          {(dados?.profs ?? []).map(p => (
            <SelectItem key={p.id} value={p.id} className="text-[12px]">{p.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function Sugestao({ c, pending, onLink }: { c: CandidatoVinculo; pending: boolean; onLink: () => void }) {
  const isEmail = c.motivo === 'email'
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-surface-canvas border border-line-soft px-2.5 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        {isEmail
          ? <Mail className="h-3.5 w-3.5 text-urg-lowFg flex-shrink-0" />
          : <Sparkles className="h-3.5 w-3.5 text-accentBlue flex-shrink-0" />}
        <span className="text-[13px] text-ink truncate">{c.professor.nome}</span>
        <span className={cn(
          'text-[10.5px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0',
          isEmail ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-accentBlue-soft text-accentBlue',
        )}>
          {isEmail ? 'e-mail' : `${c.confianca}%`}
        </span>
      </div>
      <Button
        size="sm"
        disabled={pending}
        onClick={onLink}
        className={cn(
          'btn-press h-7 text-[11px] flex-shrink-0',
          isEmail ? 'bg-urg-lowFg text-white hover:opacity-90' : 'bg-accentBlue text-white hover:bg-accentBlue-hov',
        )}
      >
        {isEmail ? 'Vincular' : 'Aprovar'}
      </Button>
    </div>
  )
}
