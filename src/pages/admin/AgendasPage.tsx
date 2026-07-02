import { useState } from 'react'
import {
  CalendarPlus, Users, Plus, Trash2, Power, Pencil, Link2, Copy, Check, ExternalLink, X, Video,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  useAgendas, useCriarAgenda, useAlternarAgenda, useEditarAgenda, useExcluirAgenda,
  useAdicionarRecorrencia, useEditarRecorrencia, useAlternarRecorrencia, useExcluirRecorrencia,
  type AgendaComRecorrencias, type RecorrenciaComReservas, type NovaRecorrencia,
} from '@/hooks/useAgendas'
import { useGrupos } from '@/hooks/useGrupos'
import { useCoordenadores } from '@/hooks/useAcompanhamento'
import { useAuth } from '@/contexts/AuthContext'
import { MeusLinksAgendamentoCard } from '@/pages/admin/MeusLinksAgendamentoCard'
import { cn } from '@/lib/utils'

const NONE = 'none'
const TODOS = 'todos'
const CAPACIDADE_PADRAO = 10

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DIAS_PLENO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

function tituloAgenda(nomeCoordenador: string | null | undefined): string {
  return `Reunião de Feedback — Coord. ${nomeCoordenador?.trim() || '—'}`
}

/** Base pública do portal de agendamento.
 *  Fixada no domínio de produção (sobrescritível por VITE_PUBLIC_BASE_URL) pra que
 *  o link copiado nunca herde a URL onde o admin está navegando — evita compartilhar
 *  com os professores uma URL de preview da Vercel (protegida por login e congelada
 *  num build antigo). */
const PORTAL_BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL || 'https://projeto-king-coord.vercel.app'

function linkPublico(): string {
  return `${PORTAL_BASE_URL}/agendar`
}

// ─────────────────────────────────────────────────────────────────────────────

export function AgendasPage() {
  const { data: agendas, isLoading } = useAgendas()

  return (
    <div className="px-6 py-6 max-w-[1100px] mx-auto space-y-6 animate-fade-up">
      <header className="space-y-1">
        <span className="label-micro flex items-center gap-1.5 text-accentBlue">
          <span className="h-1.5 w-1.5 rounded-full bg-accentBlue" />
          Portal de agendamento
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Agendas</h1>
        <p className="text-[13px] text-ink-muted">
          Reuniões de feedback recorrentes que professores reservam sozinhos, sem login.
        </p>
      </header>

      <LinkPublicoCard />

      <MeusLinksAgendamentoCard />

      <NovaAgendaCard />

      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accentBlue-soft text-accentBlue">
            <CalendarPlus className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-[15px] font-semibold text-ink">Agendas criadas</h2>
        </div>

        {isLoading ? (
          <div className="card-surface p-10 text-center text-[13px] text-ink-muted">Carregando…</div>
        ) : !agendas?.length ? (
          <div className="card-surface p-10 text-center space-y-2">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-subtle text-ink-muted">
              <CalendarPlus className="h-5 w-5" />
            </span>
            <p className="text-[13px] text-ink-muted">Nenhuma agenda criada ainda.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {agendas.map((a, i) => <AgendaCard key={a.id} agenda={a} indice={i} />)}
          </ul>
        )}
      </section>
    </div>
  )
}

// ─── Link público em destaque ───────────────────────────────────────────────

function LinkPublicoCard() {
  const [copiado, setCopiado] = useState(false)
  const link = linkPublico()

  async function copiar() {
    await navigator.clipboard.writeText(link)
    setCopiado(true)
    toast.success('Link copiado.')
    setTimeout(() => setCopiado(false), 1800)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-soft/60 via-surface-canvas to-surface-canvas p-5">
      <div aria-hidden className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-brand/10 blur-2xl" />
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand/12">
            <Link2 className="h-4 w-4 text-brand" />
          </span>
          <div className="space-y-0.5">
            <p className="text-[12px] font-medium uppercase tracking-wide text-brand-strong">Link público de agendamento</p>
            <p className="font-mono text-[14px] text-ink">{link}</p>
            <p className="text-[12px] text-ink-muted">Compartilhe com os professores — eles veem os horários disponíveis informando o e-mail cadastrado.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button onClick={copiar} className="btn-press h-9 text-[13px] gap-2 bg-brand text-white hover:bg-brand-strong">
            {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiado ? 'Copiado' : 'Copiar link'}
          </Button>
          <Button asChild variant="outline" className="btn-press h-9 text-[13px] gap-2 border-line">
            <a href={link} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Seletor de dia da semana (chips) ───────────────────────────────────────

function DiaSemanaPicker({ value, onChange }: { value: number; onChange: (dia: number) => void }) {
  return (
    <div className="flex gap-1">
      {DIAS.map((d, i) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(i)}
          className={cn(
            'h-8 w-9 rounded-lg text-[11.5px] font-medium transition-colors',
            i === value
              ? 'bg-brand text-white'
              : 'bg-surface-subtle text-ink-secondary hover:bg-surface-subtle/70 border border-line-soft',
          )}
        >
          {d}
        </button>
      ))}
    </div>
  )
}

// ─── Card de agenda ──────────────────────────────────────────────────────────

function AgendaCard({ agenda, indice }: { agenda: AgendaComRecorrencias; indice: number }) {
  const alternar = useAlternarAgenda()
  const editar = useEditarAgenda()
  const excluir = useExcluirAgenda()
  const adicionarRecorrencia = useAdicionarRecorrencia()
  const { data: grupos = [] } = useGrupos()
  const { data: coordenadores = [] } = useCoordenadores()

  const [editando, setEditando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [adicionandoHorario, setAdicionandoHorario] = useState(false)
  const [coordId, setCoordId] = useState(agenda.coordenador?.id ?? NONE)
  const [publico, setPublico] = useState<string>(agenda.grupos_autorizados?.[0] ?? TODOS)
  const [novoHorario, setNovoHorario] = useState<NovaRecorrencia>({ dia_semana: 1, hora: '09:00', capacidade: CAPACIDADE_PADRAO, meet_link: '' })

  async function toggle() {
    try {
      await alternar.mutateAsync({ id: agenda.id, ativo: !agenda.ativo })
      toast.success(agenda.ativo ? 'Agenda pausada.' : 'Agenda reativada.')
    } catch {
      toast.error('Erro ao atualizar agenda.')
    }
  }

  async function salvarEdicao() {
    const nomeCoord = coordenadores.find(c => c.id === coordId)?.nome ?? null
    try {
      await editar.mutateAsync({
        id: agenda.id,
        titulo: tituloAgenda(nomeCoord),
        coordenador_id: coordId === NONE ? null : coordId,
        grupos_autorizados: publico === TODOS ? null : [publico],
      })
      toast.success('Agenda atualizada.')
      setEditando(false)
    } catch {
      toast.error('Erro ao salvar agenda.')
    }
  }

  async function excluirAgenda() {
    try {
      await excluir.mutateAsync(agenda.id)
      toast.success('Agenda excluída.')
    } catch {
      toast.error('Erro ao excluir agenda.')
    }
  }

  async function salvarNovoHorario() {
    try {
      await adicionarRecorrencia.mutateAsync({ agendaId: agenda.id, recorrencia: novoHorario })
      toast.success('Horário adicionado.')
      setNovoHorario({ dia_semana: 1, hora: '09:00', capacidade: CAPACIDADE_PADRAO, meet_link: '' })
      setAdicionandoHorario(false)
    } catch {
      toast.error('Erro ao adicionar horário.')
    }
  }

  return (
    <li
      className="card-surface p-4 space-y-3.5 animate-fade-up"
      style={{ animationDelay: `${indice * 60}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <Users className="h-4 w-4" />
          </span>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[14px] font-semibold text-ink">{agenda.titulo}</p>
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0',
                agenda.ativo ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-surface-subtle text-ink-muted',
              )}>
                {agenda.ativo && <span className="h-1.5 w-1.5 rounded-full bg-urg-lowFg" />}
                {agenda.ativo ? 'Ativa' : 'Pausada'}
              </span>
            </div>
            <p className="text-[12px] text-ink-muted">
              {agenda.grupos_autorizados?.length ? `${agenda.grupos_autorizados.length} grupo(s) autorizado(s)` : 'Todos os grupos'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button size="icon-sm" variant="ghost" onClick={() => setEditando(v => !v)} title="Editar">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={toggle} disabled={alternar.isPending} title={agenda.ativo ? 'Pausar' : 'Reativar'}>
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setConfirmandoExclusao(true)} title="Excluir" className="hover:text-brand-strong">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {editando && (
        <div className="grid sm:grid-cols-2 gap-3 rounded-xl border border-line-soft bg-surface-subtle/50 p-3.5">
          <div className="space-y-1.5">
            <Label className="text-[11.5px] text-ink-secondary font-medium">Coordenador responsável</Label>
            <Select value={coordId} onValueChange={setCoordId}>
              <SelectTrigger className="h-8 text-[12px] bg-surface-canvas border-line text-ink w-full">
                <SelectValue placeholder="Sem coordenador" />
              </SelectTrigger>
              <SelectContent className="bg-surface-canvas border-line text-ink">
                <SelectItem value={NONE} className="text-[12px] text-ink-muted">Sem coordenador</SelectItem>
                {coordenadores.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-[12px]">{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11.5px] text-ink-secondary font-medium">Público autorizado</Label>
            <Select value={publico} onValueChange={setPublico}>
              <SelectTrigger className="h-8 text-[12px] bg-surface-canvas border-line text-ink w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-surface-canvas border-line text-ink">
                <SelectItem value={TODOS} className="text-[12px]">Todos os grupos</SelectItem>
                {grupos.map(g => (
                  <SelectItem key={g.id} value={g.id} className="text-[12px]">Somente {g.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="sm:col-span-2 text-[11px] text-ink-muted">
            O título é gerado automaticamente a partir do coordenador: <span className="font-medium text-ink-secondary">{tituloAgenda(coordenadores.find(c => c.id === coordId)?.nome)}</span>
          </p>
          <div className="sm:col-span-2 flex items-center gap-2">
            <Button size="sm" onClick={salvarEdicao} disabled={editar.isPending} className="btn-press h-7 text-[11px] bg-brand text-white hover:bg-brand-strong">
              Salvar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditando(false)} className="btn-press h-7 text-[11px] border-line">
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {agenda.recorrencias.map(r => (
          <RecorrenciaRow key={r.id} recorrencia={r} />
        ))}

        {adicionandoHorario ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-2.5">
            <DiaSemanaPicker value={novoHorario.dia_semana} onChange={d => setNovoHorario(h => ({ ...h, dia_semana: d }))} />
            <Input
              type="time"
              value={novoHorario.hora}
              onChange={e => setNovoHorario(h => ({ ...h, hora: e.target.value }))}
              className="h-8 w-28 text-[12px] bg-surface-canvas border-line"
            />
            <Input
              type="number"
              min={1}
              value={novoHorario.capacidade}
              onChange={e => setNovoHorario(h => ({ ...h, capacidade: Math.max(1, Number(e.target.value) || 1) }))}
              title="Capacidade"
              className="h-8 w-16 text-[12px] bg-surface-canvas border-line"
            />
            <Input
              type="url"
              placeholder="Link da reunião (opcional)"
              value={novoHorario.meet_link ?? ''}
              onChange={e => setNovoHorario(h => ({ ...h, meet_link: e.target.value }))}
              className="h-8 flex-1 min-w-[180px] text-[12px] bg-surface-canvas border-line"
            />
            <Button size="sm" onClick={salvarNovoHorario} disabled={adicionarRecorrencia.isPending} className="btn-press h-7 text-[11px] bg-brand text-white hover:bg-brand-strong">
              Adicionar
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setAdicionandoHorario(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdicionandoHorario(true)} className="btn-press h-7 text-[11px] gap-1.5 border-line">
            <Plus className="h-3 w-3" />
            Adicionar horário
          </Button>
        )}
      </div>

      <ConfirmarExclusao
        aberto={confirmandoExclusao}
        onOpenChange={setConfirmandoExclusao}
        titulo="Excluir esta agenda?"
        descricao="Todos os horários recorrentes e o histórico de reservas futuras serão removidos. Esta ação não pode ser desfeita."
        onConfirmar={excluirAgenda}
        pending={excluir.isPending}
      />
    </li>
  )
}

// ─── Linha de recorrência (horário semanal) ─────────────────────────────────

function RecorrenciaRow({ recorrencia }: { recorrencia: RecorrenciaComReservas }) {
  const editar = useEditarRecorrencia()
  const alternar = useAlternarRecorrencia()
  const excluir = useExcluirRecorrencia()

  const [editando, setEditando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [diaSemana, setDiaSemana] = useState(recorrencia.dia_semana)
  const [hora, setHora] = useState(recorrencia.hora.slice(0, 5))
  const [capacidade, setCapacidade] = useState(recorrencia.capacidade)
  const [meetLink, setMeetLink] = useState(recorrencia.meet_link ?? '')

  async function salvar() {
    try {
      await editar.mutateAsync({ id: recorrencia.id, dia_semana: diaSemana, hora: `${hora}:00`, capacidade, meet_link: meetLink.trim() || null })
      toast.success('Horário atualizado.')
      setEditando(false)
    } catch {
      toast.error('Erro ao salvar horário.')
    }
  }

  async function toggle() {
    try {
      await alternar.mutateAsync({ id: recorrencia.id, ativo: !recorrencia.ativo })
      toast.success(recorrencia.ativo ? 'Horário pausado.' : 'Horário reativado.')
    } catch {
      toast.error('Erro ao atualizar horário.')
    }
  }

  async function excluirHorario() {
    try {
      await excluir.mutateAsync(recorrencia.id)
      toast.success('Horário excluído.')
    } catch {
      toast.error('Erro ao excluir horário.')
    }
  }

  if (editando) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accentBlue/30 bg-accentBlue-soft/20 p-2.5">
        <DiaSemanaPicker value={diaSemana} onChange={setDiaSemana} />
        <Input type="time" value={hora} onChange={e => setHora(e.target.value)} className="h-8 w-28 text-[12px] bg-surface-canvas border-line" />
        <Input
          type="number" min={1} value={capacidade}
          onChange={e => setCapacidade(Math.max(1, Number(e.target.value) || 1))}
          title="Capacidade" className="h-8 w-16 text-[12px] bg-surface-canvas border-line"
        />
        <Input
          type="url"
          placeholder="Link da reunião (opcional)"
          value={meetLink}
          onChange={e => setMeetLink(e.target.value)}
          className="h-8 flex-1 min-w-[180px] text-[12px] bg-surface-canvas border-line"
        />
        <Button size="sm" onClick={salvar} disabled={editar.isPending} className="btn-press h-7 text-[11px] bg-brand text-white hover:bg-brand-strong">
          Salvar
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={() => setEditando(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  const ocorrenciasComSala = recorrencia.proximas_ocorrencias.filter(o => o.meet_link)

  return (
    <div className={cn(
      'rounded-xl border px-3.5 py-2.5 space-y-2',
      recorrencia.ativo ? 'border-line-soft bg-surface-subtle/60' : 'border-line-soft bg-surface-subtle/20 opacity-60',
    )}>
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn(
            'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-[12px] font-bold uppercase tracking-wide',
            recorrencia.ativo ? 'bg-accentBlue-soft text-accentBlue' : 'bg-surface-subtle text-ink-muted',
          )}>
            {DIAS[recorrencia.dia_semana]}
          </span>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-semibold tabular-nums text-ink">{recorrencia.hora.slice(0, 5)}</span>
              <span className="text-[12px] text-ink-muted capitalize">toda {DIAS_PLENO[recorrencia.dia_semana]}</span>
              {!recorrencia.ativo && (
                <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] font-medium text-ink-muted">Pausado</span>
              )}
            </div>
            <span className="flex items-center gap-1 text-[11.5px] text-ink-muted">
              <Users className="h-3 w-3" />
              até {recorrencia.capacidade} vaga{recorrencia.capacidade === 1 ? '' : 's'} · {recorrencia.proximas_reservas} reservada{recorrencia.proximas_reservas === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button size="icon-sm" variant="ghost" onClick={() => setEditando(true)} title="Editar">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={toggle} disabled={alternar.isPending} title={recorrencia.ativo ? 'Pausar' : 'Reativar'}>
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setConfirmandoExclusao(true)} title="Excluir" className="hover:text-brand-strong">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {recorrencia.meet_link ? (
        <a
          href={recorrencia.meet_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 w-fit rounded-lg border border-accentBlue/25 bg-accentBlue-soft/30 px-2.5 py-1 text-[11px] text-accentBlue hover:bg-accentBlue-soft/50"
        >
          <Video className="h-3 w-3 flex-shrink-0" />
          <span className="truncate max-w-[260px]">{recorrencia.meet_link}</span>
        </a>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-subtle italic">
          <Video className="h-3 w-3 flex-shrink-0" />
          Sem link fixo — gerado automaticamente na 1ª reserva de cada semana
        </p>
      )}

      {ocorrenciasComSala.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {ocorrenciasComSala.map(o => (
            <a
              key={o.id}
              href={o.meet_link!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-accentBlue/25 bg-accentBlue-soft/30 px-2.5 py-1 text-[11px] text-accentBlue hover:bg-accentBlue-soft/50"
            >
              <Video className="h-3 w-3" />
              {new Date(o.data_hora).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {o.inscritos}/{recorrencia.capacidade}
            </a>
          ))}
        </div>
      )}

      <ConfirmarExclusao
        aberto={confirmandoExclusao}
        onOpenChange={setConfirmandoExclusao}
        titulo="Excluir este horário?"
        descricao="Ele deixa de aparecer em /agendar imediatamente. Reservas futuras já feitas neste horário serão removidas."
        onConfirmar={excluirHorario}
        pending={excluir.isPending}
      />
    </div>
  )
}

// ─── Diálogo de confirmação de exclusão ─────────────────────────────────────

function ConfirmarExclusao({ aberto, onOpenChange, titulo, descricao, onConfirmar, pending }: {
  aberto: boolean
  onOpenChange: (v: boolean) => void
  titulo: string
  descricao: string
  onConfirmar: () => void
  pending: boolean
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button
            onClick={() => { onConfirmar(); onOpenChange(false) }}
            disabled={pending}
            className="bg-brand text-white hover:bg-brand-strong"
          >
            {pending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Form de criação ────────────────────────────────────────────────────────

function NovaAgendaCard() {
  const { profile } = useAuth()
  const { data: grupos = [] } = useGrupos()
  const { data: coordenadores = [] } = useCoordenadores()
  const criar = useCriarAgenda()

  const [aberto, setAberto] = useState(false)
  const [coordId, setCoordId] = useState<string>(profile?.id ?? NONE)
  const [publico, setPublico] = useState<string>(TODOS)
  const [horarios, setHorarios] = useState<NovaRecorrencia[]>([{ dia_semana: 1, hora: '09:00', capacidade: CAPACIDADE_PADRAO, meet_link: '' }])

  const nomeCoordSelecionado = coordId === NONE
    ? (profile?.nome ?? null)
    : coordenadores.find(c => c.id === coordId)?.nome ?? null

  function addHorario() {
    setHorarios(h => [...h, { dia_semana: 1, hora: '09:00', capacidade: CAPACIDADE_PADRAO, meet_link: '' }])
  }
  function removeHorario(i: number) {
    setHorarios(h => h.filter((_, idx) => idx !== i))
  }
  function updateHorario(i: number, patch: Partial<NovaRecorrencia>) {
    setHorarios(h => h.map((x, idx) => idx === i ? { ...x, ...patch } : x))
  }

  function reset() {
    setCoordId(profile?.id ?? NONE)
    setPublico(TODOS)
    setHorarios([{ dia_semana: 1, hora: '09:00', capacidade: CAPACIDADE_PADRAO, meet_link: '' }])
    setAberto(false)
  }

  async function salvar() {
    try {
      await criar.mutateAsync({
        titulo: tituloAgenda(nomeCoordSelecionado),
        coordenador_id: coordId === NONE ? null : coordId,
        grupos_autorizados: publico === TODOS ? null : [publico],
        recorrencias: horarios.map(h => ({ ...h, meet_link: h.meet_link?.trim() || null })),
      })
      toast.success('Agenda criada.')
      reset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar agenda.')
    }
  }

  if (!aberto) {
    return (
      <Button onClick={() => setAberto(true)} className="btn-press h-9 text-[13px] gap-2 bg-brand text-white hover:bg-brand-strong">
        <Plus className="h-4 w-4" />
        Nova agenda
      </Button>
    )
  }

  return (
    <div className="card-surface p-5 space-y-4">
      <div>
        <p className="text-[15px] font-semibold text-ink">{tituloAgenda(nomeCoordSelecionado)}</p>
        <p className="text-[12px] text-ink-muted">O título é gerado automaticamente a partir do coordenador escolhido.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[12px] text-ink-secondary font-medium">Coordenador responsável</Label>
          <Select value={coordId} onValueChange={setCoordId}>
            <SelectTrigger className="h-9 text-[12px] bg-surface-canvas border-line text-ink w-full">
              <SelectValue placeholder="Sem coordenador" />
            </SelectTrigger>
            <SelectContent className="bg-surface-canvas border-line text-ink">
              <SelectItem value={NONE} className="text-[12px] text-ink-muted">Sem coordenador</SelectItem>
              {coordenadores.map(c => (
                <SelectItem key={c.id} value={c.id} className="text-[12px]">{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px] text-ink-secondary font-medium">Público autorizado</Label>
          <Select value={publico} onValueChange={setPublico}>
            <SelectTrigger className="h-9 text-[12px] bg-surface-canvas border-line text-ink w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-surface-canvas border-line text-ink">
              <SelectItem value={TODOS} className="text-[12px]">Todos os grupos</SelectItem>
              {grupos.map(g => (
                <SelectItem key={g.id} value={g.id} className="text-[12px]">Somente {g.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[12px] text-ink-secondary font-medium">Horários recorrentes</Label>
        <p className="text-[11.5px] text-ink-muted">
          Escolha o dia da semana e o horário. A reunião se repete toda semana, com até {CAPACIDADE_PADRAO} professores por vez, até você pausar ou excluir.
        </p>
        {horarios.map((h, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <DiaSemanaPicker value={h.dia_semana} onChange={d => updateHorario(i, { dia_semana: d })} />
            <Input
              type="time"
              value={h.hora}
              onChange={e => updateHorario(i, { hora: e.target.value })}
              className="h-9 w-28 text-[13px] bg-surface-canvas border-line"
            />
            <Input
              type="number"
              min={1}
              value={h.capacidade}
              onChange={e => updateHorario(i, { capacidade: Math.max(1, Number(e.target.value) || 1) })}
              title="Capacidade (convidados, sem contar o coordenador)"
              className="h-9 w-20 text-[13px] bg-surface-canvas border-line"
            />
            <Input
              type="url"
              placeholder="Link da reunião (opcional)"
              value={h.meet_link ?? ''}
              onChange={e => updateHorario(i, { meet_link: e.target.value })}
              className="h-9 flex-1 min-w-[180px] text-[13px] bg-surface-canvas border-line"
            />
            <Button size="icon-sm" variant="ghost" onClick={() => removeHorario(i)} disabled={horarios.length === 1}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={addHorario} className="btn-press h-7 text-[11px] gap-1.5 border-line">
          <Plus className="h-3 w-3" />
          Adicionar outro dia/horário
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-line-soft bg-surface-subtle/50 px-3 py-2.5">
        <Video className="h-3.5 w-3.5 text-ink-muted mt-0.5 flex-shrink-0" />
        <p className="text-[11.5px] text-ink-muted leading-relaxed">
          Se você não informar um link, o Google Meet de cada semana é gerado automaticamente na primeira reserva — não é preciso criar a sala manualmente.
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={salvar} disabled={criar.isPending} className="btn-press h-9 text-[13px] bg-brand text-white hover:bg-brand-strong">
          {criar.isPending ? 'Salvando…' : 'Criar agenda'}
        </Button>
        <Button variant="outline" onClick={reset} disabled={criar.isPending} className="btn-press h-9 text-[13px] border-line">
          Cancelar
        </Button>
      </div>
    </div>
  )
}
