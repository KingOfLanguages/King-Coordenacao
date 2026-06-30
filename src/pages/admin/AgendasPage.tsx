import { useState } from 'react'
import { CalendarPlus, Users, Plus, Trash2, Link2, Power } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAgendas, useCriarAgenda, useAlternarAgenda, type NovoHorario, type AgendaComContagem } from '@/hooks/useAgendas'
import { useGrupos } from '@/hooks/useGrupos'
import { useCoordenadores } from '@/hooks/useAcompanhamento'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const NONE = 'none'
const TODOS = 'todos'

export function AgendasPage() {
  const { data: agendas, isLoading } = useAgendas()

  return (
    <div className="px-6 py-6 max-w-[1100px] mx-auto space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Agendas</h1>
          <p className="text-[13px] text-ink-muted">
            Reuniões coletivas que professores podem reservar em <span className="font-mono">/agendar</span>, sem login.
          </p>
        </div>
      </header>

      <NovaAgendaCard />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-ink-secondary" />
          <h2 className="text-[15px] font-semibold text-ink">Agendas criadas</h2>
        </div>

        {isLoading ? (
          <div className="card-surface p-10 text-center text-[13px] text-ink-muted">Carregando…</div>
        ) : !agendas?.length ? (
          <div className="card-surface p-10 text-center text-[13px] text-ink-muted">Nenhuma agenda criada ainda.</div>
        ) : (
          <ul className="space-y-3">
            {agendas.map(a => <AgendaRow key={a.id} agenda={a} />)}
          </ul>
        )}
      </section>
    </div>
  )
}

// ─── Linha de agenda existente ──────────────────────────────────────────────

function AgendaRow({ agenda }: { agenda: AgendaComContagem }) {
  const alternar = useAlternarAgenda()

  async function toggle() {
    try {
      await alternar.mutateAsync({ id: agenda.id, ativo: !agenda.ativo })
      toast.success(agenda.ativo ? 'Agenda desativada.' : 'Agenda ativada.')
    } catch {
      toast.error('Erro ao atualizar agenda.')
    }
  }

  return (
    <li className="card-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-ink">{agenda.titulo}</p>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              agenda.ativo ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-surface-subtle text-ink-muted',
            )}>
              {agenda.ativo ? 'Ativa' : 'Inativa'}
            </span>
          </div>
          {agenda.descricao && <p className="text-[12.5px] text-ink-muted">{agenda.descricao}</p>}
          <p className="text-[12px] text-ink-muted">
            Coordenador: {agenda.coordenador?.nome ?? '—'} ·
            {' '}{agenda.grupos_autorizados?.length ? `${agenda.grupos_autorizados.length} grupo(s) autorizado(s)` : 'todos os grupos'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={toggle} disabled={alternar.isPending} className="btn-press h-7 text-[11px] gap-1.5 border-line">
          <Power className="h-3 w-3" />
          {agenda.ativo ? 'Desativar' : 'Ativar'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {agenda.horarios.map(h => (
          <span key={h.id} className="flex items-center gap-1.5 rounded-lg border border-line-soft bg-surface-subtle px-2.5 py-1.5 text-[11.5px] text-ink-secondary">
            {new Date(h.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
            <span className="flex items-center gap-0.5 text-ink-muted">
              <Users className="h-3 w-3" />
              {h.inscritos}/{h.capacidade}
            </span>
          </span>
        ))}
      </div>
    </li>
  )
}

// ─── Form de criação ────────────────────────────────────────────────────────

function NovaAgendaCard() {
  const { profile } = useAuth()
  const { data: grupos = [] } = useGrupos()
  const { data: coordenadores = [] } = useCoordenadores()
  const criar = useCriarAgenda()

  const [aberto, setAberto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [coordId, setCoordId] = useState<string>(profile?.id ?? NONE)
  const [meetLink, setMeetLink] = useState('')
  const [publico, setPublico] = useState<string>(TODOS)
  const [horarios, setHorarios] = useState<NovoHorario[]>([{ data_hora: '', capacidade: 1 }])

  function addHorario() {
    setHorarios(h => [...h, { data_hora: '', capacidade: 1 }])
  }
  function removeHorario(i: number) {
    setHorarios(h => h.filter((_, idx) => idx !== i))
  }
  function updateHorario(i: number, patch: Partial<NovoHorario>) {
    setHorarios(h => h.map((x, idx) => idx === i ? { ...x, ...patch } : x))
  }

  function reset() {
    setTitulo('')
    setDescricao('')
    setCoordId(profile?.id ?? NONE)
    setMeetLink('')
    setPublico(TODOS)
    setHorarios([{ data_hora: '', capacidade: 1 }])
    setAberto(false)
  }

  async function salvar() {
    if (!titulo.trim()) { toast.error('Informe o título da agenda.'); return }
    const validos = horarios.filter(h => h.data_hora)
    if (!validos.length) { toast.error('Adicione pelo menos um horário.'); return }

    try {
      await criar.mutateAsync({
        titulo: titulo.trim(),
        descricao,
        coordenador_id: coordId === NONE ? null : coordId,
        meet_link: meetLink,
        grupos_autorizados: publico === TODOS ? null : [publico],
        horarios: validos.map(h => ({ data_hora: new Date(h.data_hora).toISOString(), capacidade: h.capacidade })),
      })
      toast.success('Agenda criada.')
      reset()
    } catch {
      toast.error('Erro ao criar agenda.')
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
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[12px] text-ink-secondary font-medium">Título</Label>
          <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Feedback Coletivo"
            className="h-9 text-[13px] bg-surface-canvas border-line" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px] text-ink-secondary font-medium">Link do Google Meet</Label>
          <div className="relative">
            <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
            <Input value={meetLink} onChange={e => setMeetLink(e.target.value)} placeholder="https://meet.google.com/..."
              className="h-9 text-[13px] bg-surface-canvas border-line pl-8" />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[12px] text-ink-secondary font-medium">Descrição (opcional)</Label>
        <Input value={descricao} onChange={e => setDescricao(e.target.value)}
          className="h-9 text-[13px] bg-surface-canvas border-line" />
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
        <Label className="text-[12px] text-ink-secondary font-medium">Horários disponíveis</Label>
        {horarios.map((h, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              type="datetime-local"
              value={h.data_hora}
              onChange={e => updateHorario(i, { data_hora: e.target.value })}
              className="h-9 text-[13px] bg-surface-canvas border-line flex-1"
            />
            <Input
              type="number"
              min={1}
              value={h.capacidade}
              onChange={e => updateHorario(i, { capacidade: Math.max(1, Number(e.target.value) || 1) })}
              className="h-9 text-[13px] bg-surface-canvas border-line w-20"
            />
            <Button size="icon-sm" variant="ghost" onClick={() => removeHorario(i)} disabled={horarios.length === 1}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={addHorario} className="btn-press h-7 text-[11px] gap-1.5 border-line">
          <Plus className="h-3 w-3" />
          Adicionar horário
        </Button>
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
