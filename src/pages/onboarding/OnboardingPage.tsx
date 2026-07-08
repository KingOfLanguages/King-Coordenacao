import { useMemo, useState } from 'react'
import { Search, UserPlus, Trash2, GraduationCap, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useProfessores } from '@/hooks/useProfessores'
import {
  useOnboarding, useAtualizarDiasOnboarding, useDefinirTelefone,
  useAdicionarOnboarding, useRemoverOnboarding,
  type OnboardingRow, type StatusDia,
} from '@/hooks/useOnboarding'

const DIA_MS = 864e5

// ─── Helpers de data (tudo em data local, sem fuso) ───────────────────────────

function parseISODate(iso: string | null): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function hojeLocal(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

/** Nº do dia de onboarding (Dia 1 = primeiro dia de casa). null se sem data. */
function diaOnboarding(iso: string | null): number | null {
  const inicio = parseISODate(iso)
  if (!inicio) return null
  return Math.round((hojeLocal().getTime() - inicio.getTime()) / DIA_MS) + 1
}

function fmtData(iso: string | null): string {
  const d = parseISODate(iso)
  return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// ─── Estado do acompanhamento (baseado no que foi enviado) ────────────────────

function enviados(dias: StatusDia[]): number {
  return dias.filter(d => d === 2).length
}

/** Concluído = os 7 dias enviados. SÓ então o professor sai da lista ativa. */
function concluido(dias: StatusDia[]): boolean {
  return dias.length === 7 && dias.every(d => d === 2)
}

/** Tem algum dia já vencido (anterior a hoje) que não foi enviado. */
function temAtraso(dias: StatusDia[], dataInicio: string | null): boolean {
  const n = diaOnboarding(dataInicio)
  if (n == null || n < 2) return false
  const vencidos = Math.min(n - 1, 7) // dias 1..(n-1) já deveriam estar enviados
  for (let i = 0; i < vencidos; i++) if (dias[i] !== 2) return true
  return false
}

// ─── Chip de situação do acompanhamento ───────────────────────────────────────

function SituacaoChip({ dias, dataInicio }: { dias: StatusDia[]; dataInicio: string | null }) {
  const env = enviados(dias)
  const n = diaOnboarding(dataInicio)
  let cls: string
  let label: string

  if (concluido(dias)) {
    cls = 'bg-urg-lowBg text-urg-lowFg'; label = 'Concluído'
  } else if (n != null && n <= 0) {
    cls = 'bg-accentBlue-soft text-accentBlue'; label = `Começa em ${1 - n}d`
  } else if (temAtraso(dias, dataInicio)) {
    cls = 'bg-urg-highBg text-urg-highFg'; label = `${env}/7 · atrasado`
  } else {
    cls = 'bg-urg-medBg text-urg-medFg'
    label = n != null && n >= 1 && n <= 7 ? `${env}/7 · Dia ${n}` : `${env}/7 enviados`
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', cls)}>
      {label}
    </span>
  )
}

// ─── Célula de um dia (vazio → Agendado → Enviado) ────────────────────────────

const DIA_CFG: Record<StatusDia, { label: string; cls: string }> = {
  0: { label: '—',        cls: 'bg-surface-subtle text-ink-muted border-line hover:bg-surface-subtle/70' },
  1: { label: 'Agendado', cls: 'bg-urg-medBg text-urg-medFg border-transparent hover:opacity-80' },
  2: { label: 'Enviado',  cls: 'bg-urg-lowBg text-urg-lowFg border-transparent hover:opacity-80' },
}

function DiaCell({ status, atual, onCycle }: { status: StatusDia; atual: boolean; onCycle: () => void }) {
  const cfg = DIA_CFG[status]
  return (
    <button
      type="button"
      onClick={onCycle}
      title="Clique para alternar: vazio → Agendado → Enviado"
      className={cn(
        'btn-press h-7 w-[76px] rounded-md border text-[11px] font-medium transition-colors',
        cfg.cls,
        atual && 'ring-2 ring-accentBlue/50',
      )}
    >
      {cfg.label}
    </button>
  )
}

// ─── Linha ────────────────────────────────────────────────────────────────────

function OnboardingRowView({ row }: { row: OnboardingRow }) {
  const prof = row.professor
  const atualizarDias  = useAtualizarDiasOnboarding()
  const definirTelefone = useDefinirTelefone()
  const remover        = useRemoverOnboarding()

  // Sincroniza o telefone digitado quando o valor do servidor muda (ex.: outro
  // usuário editou) — padrão de ajuste-de-estado-em-render do React, sem effect.
  const telServidor = prof?.telefone ?? ''
  const [tel, setTel] = useState(telServidor)
  const [telAnterior, setTelAnterior] = useState(telServidor)
  if (telServidor !== telAnterior) {
    setTelAnterior(telServidor)
    setTel(telServidor)
  }

  const dataInicio = prof?.data_inicio ?? row.data_inicio
  const n = diaOnboarding(dataInicio)
  const idxAtual = n != null && n >= 1 && n <= 7 ? n - 1 : -1
  const dias: StatusDia[] = row.dias ?? [0, 0, 0, 0, 0, 0, 0]

  const feito      = concluido(dias)
  const atrasado   = !feito && temAtraso(dias, dataInicio)
  const iniciado   = n != null && n >= 1
  const emDestaque = !feito && !atrasado && iniciado // em acompanhamento, no prazo

  function cycle(i: number) {
    const next = [...dias]
    next[i] = ((next[i] + 1) % 3) as StatusDia
    atualizarDias.mutate({ id: row.id, dias: next }, {
      onError: () => toast.error('Não foi possível salvar.'),
    })
  }

  function salvarTel() {
    const novo = tel.trim()
    if (novo === (prof?.telefone ?? '')) return
    definirTelefone.mutate({ professorId: row.professor_id, telefone: novo }, {
      onError: () => toast.error('Não foi possível salvar o telefone.'),
    })
  }

  return (
    <tr className={cn(
      'border-b border-line-soft transition-colors',
      feito
        ? 'opacity-55 hover:opacity-100 hover:bg-surface-subtle/40'
        : atrasado
          ? 'border-l-2 border-l-urg-highFg/60 bg-urg-highBg/10 hover:bg-urg-highBg/20'
          : emDestaque
            ? 'border-l-2 border-l-accentBlue/50 bg-accentBlue-soft/15 hover:bg-accentBlue-soft/25'
            : 'hover:bg-surface-subtle/40',
    )}>
      {/* Nome */}
      <td className="p-2 align-middle">
        <p className="text-[13px] font-medium text-ink whitespace-nowrap">{prof?.nome ?? 'Professor removido'}</p>
      </td>

      {/* Telefone */}
      <td className="p-2 align-middle">
        <Input
          value={tel}
          onChange={e => setTel(e.target.value)}
          onBlur={salvarTel}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="(00) 00000-0000"
          className="h-8 w-[150px] text-[12px] bg-surface-canvas border-line"
        />
      </td>

      {/* Início + situação */}
      <td className="p-2 align-middle">
        <div className="flex flex-col gap-1 min-w-[130px]">
          <span className="text-[12px] text-ink-secondary tabular-nums">{fmtData(dataInicio)}</span>
          <SituacaoChip dias={dias} dataInicio={dataInicio} />
        </div>
      </td>

      {/* Dia 1..7 */}
      {dias.map((s, i) => (
        <td key={i} className="p-2 align-middle text-center">
          <DiaCell status={s} atual={i === idxAtual} onCycle={() => cycle(i)} />
        </td>
      ))}

      {/* Ações */}
      <td className="p-2 align-middle text-right">
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-ink-muted hover:text-urg-highFg"
          title="Remover do acompanhamento"
          onClick={() => {
            if (confirm(`Remover ${prof?.nome ?? 'este professor'} do acompanhamento de onboarding?`)) {
              remover.mutate(row.id, { onError: () => toast.error('Não foi possível remover.') })
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  )
}

// ─── Dialog: adicionar professor manualmente ──────────────────────────────────

function AdicionarProfessorDialog({ idsExistentes }: { idsExistentes: Set<string> }) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const { data: professores = [] } = useProfessores()
  const adicionar = useAdicionarOnboarding()

  const candidatos = useMemo(() => {
    const q = norm(busca)
    return professores
      .filter(p => p.status !== 'desligado' && !idsExistentes.has(p.id))
      .filter(p => q.length === 0 || norm(p.nome).includes(q))
      .slice(0, 30)
  }, [professores, idsExistentes, busca])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="btn-press h-9 gap-1.5 border-line">
          <UserPlus className="h-4 w-4" /> Adicionar professor
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Adicionar ao acompanhamento</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
          <Input
            autoFocus
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar professor pelo nome…"
            className="h-10 pl-9 text-[13px] bg-surface-canvas border-line"
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto -mx-1 px-1">
          {candidatos.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-ink-muted">
              {busca ? 'Nenhum professor encontrado.' : 'Digite para buscar.'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {candidatos.map(p => (
                <li key={p.id}>
                  <button
                    className="btn-press w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-subtle"
                    onClick={() => {
                      adicionar.mutate({ professorId: p.id, dataInicio: p.data_inicio }, {
                        onSuccess: () => { toast.success(`${p.nome} adicionado.`); setOpen(false); setBusca('') },
                        onError:   () => toast.error('Não foi possível adicionar.'),
                      })
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink truncate">{p.nome}</span>
                      <span className="block text-[11px] text-ink-muted">Início: {fmtData(p.data_inicio)}</span>
                    </span>
                    <UserPlus className="h-4 w-4 text-ink-muted flex-shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

type Filtro = 'andamento' | 'concluidos' | 'todos'

// Ordena por urgência: atrasados primeiro, depois em andamento, depois quem ainda
// não começou, e concluídos por último. Empate → começo mais antigo primeiro.
function ordem(r: OnboardingRow): number {
  const dias = r.dias ?? []
  const di = r.professor?.data_inicio ?? r.data_inicio
  if (concluido(dias)) return 3
  if (temAtraso(dias, di)) return 0
  const n = diaOnboarding(di)
  return n != null && n >= 1 ? 1 : 2
}

export function OnboardingPage() {
  const { data: rows = [], isLoading } = useOnboarding()
  const [filtro, setFiltro] = useState<Filtro>('andamento')
  const [busca, setBusca] = useState('')

  const idsExistentes = useMemo(() => new Set(rows.map(r => r.professor_id)), [rows])

  // Um professor só sai de "Em andamento" quando os 7 dias estão enviados.
  function bucketDe(r: OnboardingRow): Exclude<Filtro, 'todos'> {
    return concluido(r.dias ?? []) ? 'concluidos' : 'andamento'
  }

  const contagem = useMemo(() => {
    let andamento = 0, concluidos = 0
    for (const r of rows) {
      if (bucketDe(r) === 'concluidos') concluidos++
      else andamento++
    }
    return { andamento, concluidos, todos: rows.length }
  }, [rows])

  const visiveis = useMemo(() => {
    const q = norm(busca)
    return rows
      .filter(r => filtro === 'todos' || bucketDe(r) === filtro)
      .filter(r => q.length === 0 || norm(r.professor?.nome ?? '').includes(q))
      .sort((a, b) => {
        const oa = ordem(a), ob = ordem(b)
        if (oa !== ob) return oa - ob
        const da = a.professor?.data_inicio ?? a.data_inicio ?? ''
        const db = b.professor?.data_inicio ?? b.data_inicio ?? ''
        return da.localeCompare(db) // começo mais antigo primeiro
      })
  }, [rows, filtro, busca])

  const chips: { id: Filtro; label: string; count: number }[] = [
    { id: 'andamento',  label: 'Em andamento', count: contagem.andamento },
    { id: 'concluidos', label: 'Concluídos',   count: contagem.concluidos },
    { id: 'todos',      label: 'Todos',        count: contagem.todos },
  ]

  return (
    <div className="px-6 py-6 max-w-[1200px] mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-ink-secondary" />
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Onboarding de Professores</h1>
          </div>
          <p className="text-[13px] text-ink-muted">
            Acompanhamento das mensagens de boas-vindas nos 7 primeiros dias de cada professor que entra.
          </p>
        </div>
        <AdicionarProfessorDialog idsExistentes={idsExistentes} />
      </header>

      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {chips.map(c => (
            <button
              key={c.id}
              onClick={() => setFiltro(c.id)}
              className={cn(
                'btn-press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                filtro === c.id
                  ? 'bg-surface-subtle text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                  : 'text-ink-secondary hover:text-ink hover:bg-surface-subtle/60',
              )}
            >
              {c.label}
              <span className={cn(
                'inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] tabular-nums',
                filtro === c.id ? 'bg-accentBlue-soft text-accentBlue' : 'bg-surface-subtle text-ink-muted',
              )}>
                {c.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar professor…"
            className="h-9 w-[240px] pl-9 text-[13px] bg-surface-canvas border-line rounded-xl"
          />
        </div>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">Carregando…</div>
      ) : visiveis.length === 0 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          {rows.length === 0
            ? 'Nenhum professor recém-chegado no acompanhamento ainda. Assim que alguém iniciar (ou estiver perto de iniciar), aparece aqui automaticamente.'
            : busca
              ? `Nenhum professor encontrado para "${busca}".`
              : 'Nada neste filtro.'}
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <div className="relative w-full overflow-x-auto">
            <table className="w-full caption-bottom">
              <thead>
                <tr className="border-b border-line-soft">
                  <th className="h-10 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Professor</th>
                  <th className="h-10 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Telefone</th>
                  <th className="h-10 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Início</th>
                  {[1, 2, 3, 4, 5, 6, 7].map(d => (
                    <th key={d} className="h-10 px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Dia {d}</th>
                  ))}
                  <th className="h-10 px-2" />
                </tr>
              </thead>
              <tbody>
                {visiveis.map(r => <OnboardingRowView key={r.id} row={r} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-urg-lowBg" /> Enviado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-urg-medBg" /> Agendado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-line bg-surface-subtle" /> Não enviado
        </span>
        <span className="text-line-soft">·</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-full bg-accentBlue/60" /> Em acompanhamento
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-full bg-urg-highFg/70" /> Dia atrasado
        </span>
        <span className="text-line-soft">·</span>
        <span className="flex items-center gap-1.5">
          <Check className="h-3 w-3" /> Clique numa célula pra alternar; sai da lista só quando os 7 dias forem enviados
        </span>
      </div>
    </div>
  )
}
