import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  RefreshCw, Plus, Send, Trash2, Search, X, MessageCircle,
  ArrowRight, CalendarClock,
} from 'lucide-react'
import {
  useConvocacoes, useCriarConvocacao, useMoverEtapaConvocacao,
  useMarcarMensagemConvocacao, useExcluirConvocacao,
  ETAPAS_CONVOCACAO, ORIGEM_LABEL,
  type Convocacao, type EtapaConvocacao, type OrigemConvocacao,
} from '@/hooks/useConvocacoes'
import { useCoordenadores } from '@/hooks/useAcompanhamento'
import { useDadosVinculo } from '@/hooks/useReunioesDia'
import { useIncidentes } from '@/hooks/useIncidentes'
import { statusPrazo } from '@/lib/incidentePrazo'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn, whatsappLink } from '@/lib/utils'
import { TarefasBoard } from '@/components/tarefas/TarefasBoard'
import { AgendaIncidentesTab } from '@/components/tarefas/AgendaIncidentesTab'
import { MensagensDoDiaBoard } from '@/components/tarefas/MensagensDoDiaBoard'
import { useTarefas } from '@/hooks/useTarefas'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function iniciais(nome: string): string {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—'
}
function tempoAguardando(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'agora'
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
function fmtData(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'
}
function mensagemConvocacao(nome: string): string {
  return `Olá, ${nome}! Tudo bem?

Precisamos agendar uma reunião com você. Qual seria o melhor dia e horário nos próximos dias?

Ficamos no aguardo. Obrigado!`
}

function Avatar({ nome }: { nome: string }) {
  return (
    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accentBlue-soft text-accentBlue text-[11px] font-semibold ring-1 ring-accentBlue/15">
      {iniciais(nome)}
    </span>
  )
}

function WhatsAppBtn({ tel }: { tel: string | null }) {
  const link = whatsappLink(tel)
  if (!link) return null
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir WhatsApp"
      className="btn-press inline-flex items-center gap-1.5 rounded-md bg-[#25D366]/12 px-2.5 py-1.5 text-[11.5px] font-medium text-[#128C4B] hover:bg-[#25D366]/20 transition-colors"
    >
      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
    </a>
  )
}

type Aba = 'tarefas' | 'reunioes' | 'convocacoes' | 'agenda'

export function CentralConvocacoesPage() {
  const { data: convocacoes = [], isLoading: loadingConv, isFetching: fetchingConv, refetch: refetchConv } = useConvocacoes()
  const { data: incidentes = [] } = useIncidentes()
  const { data: coordenadores = [] } = useCoordenadores()
  const { data: tarefas = [] } = useTarefas()

  const [params] = useSearchParams()
  const abaParam = params.get('aba')
  const [aba, setAba] = useState<Aba>(
    abaParam === 'reunioes' || abaParam === 'convocacoes' || abaParam === 'agenda' ? abaParam : 'tarefas',
  )
  const [nova, setNova] = useState(false)

  const coordNome = useMemo(() => {
    const m = new Map(coordenadores.map(c => [c.id, c.nome]))
    return (id: string | null) => (id ? m.get(id) ?? null : null)
  }, [coordenadores])

  const resumo = useMemo(() => ({
    tarefas: tarefas.filter(t => t.status !== 'concluido').length,
    contato: convocacoes.filter(c => c.etapa === 'pendente_contato').length,
    resposta: convocacoes.filter(c => c.etapa === 'aguardando_resposta').length,
    agendadas: convocacoes.filter(c => c.etapa === 'agendada').length,
    vencidos: incidentes.filter(i => statusPrazo(i.prazo_resolucao, i.resolved)?.atrasado).length,
  }), [tarefas, convocacoes, incidentes])

  const isFetching = fetchingConv

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Tarefas</h1>
          <p className="text-[13px] text-ink-muted">Tarefas, mensagens do dia, convocações e a agenda de incidentes num só lugar.</p>
        </div>
        <div className="flex items-center gap-2">
          {aba === 'convocacoes' && (
            <Button size="sm" onClick={() => setNova(true)} className="btn-press h-8 gap-1.5 bg-accentBlue hover:bg-accentBlue-hov text-white">
              <Plus className="h-3.5 w-3.5" /> Nova convocação
            </Button>
          )}
          <button
            onClick={() => refetchConv()}
            disabled={isFetching}
            className="btn-press inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-canvas px-3 py-1.5 text-[12.5px] font-medium text-ink-secondary hover:text-ink transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} /> Atualizar
          </button>
        </div>
      </header>

      {/* ── Painel da coordenação (resumo) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard cor="text-ink" bg="bg-surface-subtle" dot="🗒️" n={resumo.tarefas} label="tarefas abertas" />
        <StatCard cor="text-urg-highFg" bg="bg-urg-highBg" dot="🔴" n={resumo.contato}   label="aguardando contato" />
        <StatCard cor="text-urg-medFg"  bg="bg-urg-medBg"  dot="🟡" n={resumo.resposta}  label="aguardando resposta" />
        <StatCard cor="text-urg-lowFg"  bg="bg-urg-lowBg"  dot="🟢" n={resumo.agendadas} label="reuniões agendadas" />
        <StatCard cor="text-urg-critFg" bg="bg-urg-critBg" dot="⏰" n={resumo.vencidos} label="incidentes vencidos" />
      </div>

      {/* ── Toggle de fluxo ── */}
      <div className="flex items-center gap-1 bg-surface-subtle rounded-full p-1 w-fit">
        {([['tarefas', 'Tarefas'], ['reunioes', 'Reuniões'], ['convocacoes', 'Convocações'], ['agenda', 'Agenda']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              'btn-press px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-colors',
              aba === id ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'tarefas'
        ? <TarefasBoard />
        : aba === 'reunioes'
          ? <MensagensDoDiaBoard />
          : aba === 'convocacoes'
            ? <KanbanReunioes convocacoes={convocacoes} loading={loadingConv} coordNome={coordNome} />
            : <AgendaIncidentesTab />}

      {nova && <NovaConvocacaoDialog onClose={() => setNova(false)} />}
    </div>
  )
}

function StatCard({ dot, n, label, cor, bg }: { dot: string; n: number; label: string; cor: string; bg: string }) {
  return (
    <div className="card-surface p-4 flex items-center gap-3">
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-full text-[15px]', bg)}>{dot}</span>
      <div>
        <p className={cn('text-2xl font-semibold tabular-nums leading-none', cor)}>{n}</p>
        <p className="text-[12px] text-ink-muted mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ─── Kanban de reuniões (convocacoes) ─────────────────────────────────────────

function KanbanReunioes({ convocacoes, loading, coordNome }: {
  convocacoes: Convocacao[]; loading: boolean; coordNome: (id: string | null) => string | null
}) {
  if (loading) {
    return <div className="text-[13px] text-ink-muted py-10 text-center">Carregando…</div>
  }
  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid grid-cols-4 gap-3 min-w-[900px]">
        {ETAPAS_CONVOCACAO.map(col => {
          const cards = convocacoes.filter(c => c.etapa === col.id)
          return (
            <div key={col.id} className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[12.5px] font-medium text-ink-secondary">{col.emoji} {col.titulo}</span>
                <span className="tabular-nums text-[11px] text-ink-muted bg-surface-subtle rounded-full px-1.5 py-px">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.map(c => <ConvocacaoCard key={c.id} c={c} coordNome={coordNome(c.coordenador_id)} />)}
                {cards.length === 0 && <div className="rounded-lg border border-dashed border-line-soft py-6 text-center text-[11.5px] text-ink-subtle">vazio</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const PROX_ETAPA: Partial<Record<EtapaConvocacao, { etapa: EtapaConvocacao; label: string }>> = {
  aguardando_resposta: { etapa: 'agendada',  label: 'Marcar agendada' },
  agendada:            { etapa: 'realizada', label: 'Marcar realizada' },
}

function ConvocacaoCard({ c, coordNome }: { c: Convocacao; coordNome: string | null }) {
  const marcar  = useMarcarMensagemConvocacao()
  const mover   = useMoverEtapaConvocacao()
  const excluir = useExcluirConvocacao()

  async function handleEnviar() {
    try {
      await navigator.clipboard.writeText(mensagemConvocacao(c.professor_nome)).catch(() => {})
      await marcar.mutateAsync({ id: c.id, etapaAtual: c.etapa })
      toast.success('Mensagem registrada (texto copiado).')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar.')
    }
  }
  const prox = PROX_ETAPA[c.etapa]

  return (
    <div className="card-surface p-3 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <Avatar nome={c.professor_nome} />
        <div className="min-w-0 flex-1">
          <Link to={`/professores/${c.professor_id}`} className="text-[13px] font-medium text-ink hover:text-accentBlue hover:underline block truncate">
            {c.professor_nome}
          </Link>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-accentBlue-soft px-1.5 py-px text-[10px] font-medium text-accentBlue">
              <CalendarClock className="h-2.5 w-2.5" /> Reunião
            </span>
            <span className="inline-flex items-center rounded-full bg-surface-subtle px-1.5 py-px text-[10px] font-medium text-ink-secondary">
              {ORIGEM_LABEL[c.origem]}
            </span>
            <span className="text-[10.5px] text-ink-muted">{tempoAguardando(c.created_at)}</span>
          </div>
        </div>
        <button onClick={() => excluir.mutate(c.id)} title="Excluir" className="btn-press flex h-6 w-6 items-center justify-center rounded-full text-ink-subtle hover:bg-urg-highBg hover:text-urg-highFg flex-shrink-0">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {c.motivo && <p className="text-[11.5px] text-ink-muted leading-snug line-clamp-2">{c.motivo}</p>}
      <p className="text-[10.5px] text-ink-subtle">
        {coordNome && <>{coordNome} · </>}
        {c.ultima_mensagem_em ? `última msg ${fmtData(c.ultima_mensagem_em)}` : 'sem mensagem'}
      </p>

      {c.etapa !== 'realizada' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {c.etapa === 'pendente_contato' && (
            <button onClick={handleEnviar} disabled={marcar.isPending} className="btn-press inline-flex items-center gap-1.5 rounded-md bg-accentBlue px-2.5 py-1.5 text-[11.5px] font-medium text-white hover:bg-accentBlue-hov disabled:opacity-50">
              <Send className="h-3.5 w-3.5" /> Enviar mensagem
            </button>
          )}
          {prox && (
            <button onClick={() => mover.mutate({ id: c.id, etapa: prox.etapa })} disabled={mover.isPending} className="btn-press inline-flex items-center gap-1.5 rounded-md bg-surface-subtle px-2.5 py-1.5 text-[11.5px] font-medium text-ink-secondary hover:text-ink disabled:opacity-50">
              <ArrowRight className="h-3.5 w-3.5" /> {prox.label}
            </button>
          )}
          <WhatsAppBtn tel={c.professor_telefone} />
        </div>
      )}
    </div>
  )
}

// ─── Nova convocação (manual) ─────────────────────────────────────────────────

const ORIGENS_MANUAIS: OrigemConvocacao[] = ['coordenacao', 'periodica', 'observacao', 'incidente', 'feedback']

function NovaConvocacaoDialog({ onClose }: { onClose: () => void }) {
  const criar = useCriarConvocacao()
  const { data: dados } = useDadosVinculo()

  const [busca, setBusca]   = useState('')
  const [prof, setProf]     = useState<{ id: string; nome: string } | null>(null)
  const [origem, setOrigem] = useState<OrigemConvocacao>('coordenacao')
  const [motivo, setMotivo] = useState('')

  const resultados = useMemo(() => {
    const q = norm(busca)
    if (!q) return []
    return (dados?.profs ?? []).filter(p => norm(p.nome).includes(q)).slice(0, 8)
  }, [busca, dados])

  async function handleSalvar() {
    if (!prof) { toast.error('Selecione o professor.'); return }
    try {
      await criar.mutateAsync({ professor_id: prof.id, origem, motivo })
      toast.success('Convocação criada.')
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      toast.error(/duplicate|unique/i.test(msg) ? 'Já existe uma convocação aberta para este professor.' : (msg || 'Erro ao criar.'))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-canvas border border-line rounded-xl shadow-elevated w-full max-w-md mx-4 p-6 space-y-5 animate-fade-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink"><CalendarClock className="h-4 w-4 text-accentBlue" /> Nova convocação</h2>
          <button onClick={onClose} className="btn-press text-ink-subtle hover:text-ink-secondary"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="label-micro">Professor <span className="text-brand">*</span></Label>
            {prof ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-subtle px-3 py-2">
                <span className="text-[13px] font-medium text-ink truncate">{prof.nome}</span>
                <button onClick={() => { setProf(null); setBusca('') }} className="btn-press text-[11px] text-accentBlue hover:underline flex-shrink-0">trocar</button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
                <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar professor…" className="pl-9 h-9 bg-surface-canvas border-line" />
                {resultados.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto rounded-md border border-line bg-surface-canvas shadow-elevated">
                    {resultados.map(p => (
                      <button key={p.id} onClick={() => setProf({ id: p.id, nome: p.nome })} className="btn-press block w-full text-left px-3 py-2 text-[13px] text-ink hover:bg-surface-subtle">{p.nome}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Origem</Label>
            <Select value={origem} onValueChange={v => setOrigem(v as OrigemConvocacao)}>
              <SelectTrigger className="h-9 bg-surface-canvas border-line text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORIGENS_MANUAIS.map(o => <SelectItem key={o} value={o}>{ORIGEM_LABEL[o]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="label-micro">Motivo (opcional)</Label>
            <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: Reunião pedagógica" className="h-9 bg-surface-canvas border-line" />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-ink-secondary">Cancelar</Button>
          <Button size="sm" onClick={handleSalvar} disabled={criar.isPending} className="btn-press bg-accentBlue hover:bg-accentBlue-hov text-white">
            {criar.isPending ? 'Criando…' : 'Criar convocação'}
          </Button>
        </div>
      </div>
    </div>
  )
}
