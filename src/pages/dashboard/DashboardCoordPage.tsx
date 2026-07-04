import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Check, Undo2, User, Copy } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCoordenadores } from '@/hooks/useAcompanhamento'
import { useDashboardCoord, type DashboardCoordData } from '@/hooks/useDashboardCoord'
import { useContatosHoje, useMarcarContato, reuniaoUltimaDe, type ContatoDia } from '@/hooks/useContatosDia'
import { getDefaultTemplate } from '@/lib/messageTemplates'
import { mesesDeCasa, cn } from '@/lib/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const DIA = 864e5

export function DashboardCoordPage() {
  const { profile } = useAuth()
  const canSeeAll = profile?.role === 'admin'
    || profile?.role === 'suporte'
    || profile?.role === 'suporte_aluno'
    || profile?.is_admin === true
    || profile?.is_lider === true

  const { data: coordenadores = [] } = useCoordenadores()
  const [sel, setSel] = useState<string>('')
  const coordId   = canSeeAll ? (sel || coordenadores[0]?.id || '') : (profile?.id ?? '')
  const coordNome = canSeeAll ? (coordenadores.find(c => c.id === coordId)?.nome ?? '—') : (profile?.nome ?? '—')

  const { data, isLoading } = useDashboardCoord(coordId || null)
  const m = useMemo(() => computar(data), [data])

  const podeVerContatos = profile?.role === 'admin' || profile?.role === 'coordenacao'

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Dashboard da Coordenação</h1>
          <p className="text-[13px] text-ink-muted">
            Acompanhamento de reuniões de <span className="text-ink-secondary font-medium">{coordNome}</span>
          </p>
        </div>
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
      </header>

      {podeVerContatos && <MensagensDoDia coordId={coordId || null} coordNome={coordNome} />}

      {/* Reuniões realizadas */}
      <section className="space-y-3">
        <h2 className="label-micro">Reuniões realizadas</h2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Hoje"             value={m.dia}              loading={isLoading} />
          <Kpi label="Semana (7d)"      value={m.semana}          loading={isLoading} />
          <Kpi label="Mês (30d)"        value={m.mes}             loading={isLoading} />
          <Kpi label="Mês vigente"      value={m.mesVigente}      loading={isLoading} />
          <Kpi label="Trimestre (90d)"  value={m.trimestre}       loading={isLoading} />
          <Kpi label="Trim. vigente"    value={m.trimestreVigente} loading={isLoading} />
        </div>
      </section>

      {/* Médias vs metas */}
      <section className="space-y-3">
        <h2 className="label-micro">Médias vs metas</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <MediaCard titulo="Por dia"    valor={m.mediaDia}    meta={8}  />
          <MediaCard titulo="Por semana" valor={m.mediaSemana} meta={40} />
          <MediaCard titulo="Por mês"    valor={m.mediaMes}              />
        </div>
      </section>

      {/* Metas mensal e trimestral */}
      <section className="grid gap-3 sm:grid-cols-2">
        <MetaCard
          titulo="Meta mensal"
          feito={m.mesVigente}
          meta={m.metaMensal}
          detalhe={`${m.admissoesMes} admissões + ${m.profs2a3} de 2–3m + 33,3% de ${m.profs4} (>4m)`}
        />
        <MetaCard
          titulo="Meta trimestral — cobrir o grupo"
          feito={m.cobertos}
          meta={m.metaTrimestral}
          detalhe={`${m.cobertos} de ${m.metaTrimestral} professores com reunião no trimestre`}
        />
      </section>

      {/* Gráfico de linha — semana a semana no trimestre */}
      <section className="card-surface p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="label-micro">Evolução semanal no trimestre</h2>
          <span className="text-[11px] text-ink-muted">meta 40/semana</span>
        </div>
        <LineChart weeks={m.weeks} meta={40} />
      </section>
    </div>
  )
}

// ─── Cálculos ──────────────────────────────────────────────────────────────────

type Metricas = ReturnType<typeof computar>

function computar(data: DashboardCoordData | undefined) {
  const realizadas = data?.realizadas ?? []
  const profs      = data?.profs ?? []
  const ts = realizadas.map(r => r.ts)

  const now = Date.now()
  const d   = new Date()
  const startToday   = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const startMonth   = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  const startQuarter = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime()
  const since = (from: number) => ts.filter(t => t >= from).length

  const trimestre = since(now - 90 * DIA)

  // Metas dependentes dos professores do grupo
  const tenure = (di: string | null) => mesesDeCasa(di)
  const admissoesMes = profs.filter(p => p.data_inicio && new Date(p.data_inicio).getTime() >= startMonth).length
  const profs2a3 = profs.filter(p => { const t = tenure(p.data_inicio); return t !== null && t >= 2 && t <= 3 }).length
  const profs4   = profs.filter(p => { const t = tenure(p.data_inicio); return t !== null && t > 4 }).length
  const metaMensal = admissoesMes + profs2a3 + Math.round(0.333 * profs4)

  const cobertos = new Set(
    realizadas.filter(r => r.ts >= startQuarter && r.professor_id).map(r => r.professor_id),
  ).size

  // Gráfico: janelas de 7 dias do início do trimestre até hoje
  const weeks: { label: string; count: number }[] = []
  let cursor = startQuarter
  let wi = 1
  while (cursor <= now) {
    const end = cursor + 7 * DIA
    weeks.push({ label: `S${wi}`, count: ts.filter(t => t >= cursor && t < end).length })
    cursor = end
    wi++
  }

  return {
    dia:              since(startToday),
    semana:           since(now - 7 * DIA),
    mes:              since(now - 30 * DIA),
    mesVigente:       since(startMonth),
    trimestre,
    trimestreVigente: since(startQuarter),
    mediaDia:    trimestre / (90 * 5 / 7),
    mediaSemana: trimestre / (90 / 7),
    mediaMes:    trimestre / 3,
    admissoesMes, profs2a3, profs4, metaMensal,
    metaTrimestral: profs.length,
    cobertos,
    weeks,
  }
}

// ─── Componentes ───────────────────────────────────────────────────────────────

function Kpi({ label, value, loading }: { label: string; value: number; loading?: boolean }) {
  return (
    <div className="card-surface p-4">
      <span className="label-micro">{label}</span>
      {loading
        ? <div className="h-7 w-10 rounded bg-surface-subtle animate-pulse mt-1.5" />
        : <p className="text-[26px] font-semibold tabular-nums leading-none mt-1.5 text-ink">{value}</p>}
    </div>
  )
}

function MediaCard({ titulo, valor, meta }: { titulo: string; valor: number; meta?: number }) {
  const pct = meta ? Math.min(100, Math.round((valor / meta) * 100)) : null
  const atingiu = meta ? valor >= meta : false
  return (
    <div className="card-surface p-4 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="label-micro">{titulo}</span>
        {meta && <span className="text-[11px] text-ink-muted">meta {meta}</span>}
      </div>
      <p className={cn('text-[24px] font-semibold tabular-nums leading-none', atingiu ? 'text-urg-lowFg' : 'text-ink')}>
        {valor.toFixed(1)}
      </p>
      {pct !== null && (
        <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: atingiu ? 'var(--urg-low-fg)' : 'var(--accent-blue)' }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Mensagens do dia (meta: 20 contatos/dia por coordenador) ────────────────

function MensagensDoDia({ coordId, coordNome }: { coordId: string | null; coordNome: string }) {
  const { data: contatos = [], isLoading } = useContatosHoje(coordId)
  const marcar = useMarcarContato()
  const navigate = useNavigate()
  const [copiadoId, setCopiadoId] = useState<string | null>(null)

  const enviados = contatos.filter(c => c.enviado).length
  const total    = contatos.length
  const pct      = total > 0 ? Math.round((enviados / total) * 100) : 0
  const completo = total > 0 && enviados >= total

  function toggle(c: ContatoDia) {
    marcar.mutate(
      { id: c.id, enviado: !c.enviado },
      { onError: () => toast.error('Erro ao atualizar contato.') },
    )
  }

  async function copiarMensagem(c: ContatoDia) {
    const ultima = reuniaoUltimaDe(c)
    const mensagem = getDefaultTemplate().build({
      professorNome: c.professor?.nome ?? 'professor(a)',
      coordenadorNome: coordNome,
      dataUltimaReuniao: ultima
        ? new Date(ultima).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
        : null,
    })
    await navigator.clipboard.writeText(mensagem)
    setCopiadoId(c.id)
    toast.success('Mensagem copiada.')
    setTimeout(() => setCopiadoId(prev => (prev === c.id ? null : prev)), 1800)
  }

  return (
    <section className="card-surface p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-ink-secondary" />
          <h2 className="text-[15px] font-semibold text-ink">Mensagens de hoje</h2>
        </div>
        <span className="text-[13px] tabular-nums">
          <span className={cn('font-semibold', completo ? 'text-urg-lowFg' : 'text-ink')}>{enviados}</span>
          <span className="text-ink-muted"> / {total || 20}</span>
        </span>
      </div>

      <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: completo ? 'var(--urg-low-fg)' : 'var(--accent-blue)' }}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-9 rounded bg-surface-subtle animate-pulse" />)}
        </div>
      ) : total === 0 ? (
        <p className="text-[13px] text-ink-muted">
          Nenhum professor ativo neste grupo para gerar a lista de hoje.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft max-h-[360px] overflow-y-auto">
          {contatos.map(c => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className={cn('text-[13px] truncate', c.enviado ? 'text-ink-muted line-through' : 'text-ink font-medium')}>
                  {c.professor?.nome ?? 'Professor removido'}
                </p>
                {c.professor?.email && (
                  <p className="text-[11px] text-ink-muted truncate">{c.professor.email}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/professores/${c.professor_id}`)}
                  className="btn-press h-7 w-7 p-0 border-line text-ink-secondary"
                  title="Ver perfil"
                >
                  <User className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copiarMensagem(c)}
                  className="btn-press h-7 text-[11px] gap-1.5 border-line text-ink-secondary"
                >
                  {copiadoId === c.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiadoId === c.id ? 'Copiado' : 'Copiar mensagem'}
                </Button>
                <Button
                  size="sm"
                  variant={c.enviado ? 'outline' : 'default'}
                  disabled={marcar.isPending}
                  onClick={() => toggle(c)}
                  className={cn(
                    'btn-press h-7 text-[11px] gap-1.5',
                    c.enviado
                      ? 'border-line text-ink-secondary'
                      : 'bg-urg-lowFg text-white hover:opacity-90',
                  )}
                >
                  {c.enviado ? <><Undo2 className="h-3 w-3" />Desfazer</> : <><Check className="h-3 w-3" />Marcar enviada</>}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function MetaCard({ titulo, feito, meta, detalhe }: { titulo: string; feito: number; meta: number; detalhe: string }) {
  const pct = meta > 0 ? Math.min(100, Math.round((feito / meta) * 100)) : 0
  const atingiu = meta > 0 && feito >= meta
  return (
    <div className="card-surface p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">{titulo}</h3>
        <span className="text-[13px] tabular-nums">
          <span className={cn('font-semibold', atingiu ? 'text-urg-lowFg' : 'text-ink')}>{feito}</span>
          <span className="text-ink-muted"> / {meta}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: atingiu ? 'var(--urg-low-fg)' : 'var(--accent-blue)' }}
        />
      </div>
      <p className="text-[11px] text-ink-muted">{detalhe}</p>
    </div>
  )
}

function LineChart({ weeks, meta }: { weeks: { label: string; count: number }[]; meta: number }) {
  const W = 680, H = 180, padL = 28, padB = 22, padT = 10, padR = 10
  if (weeks.length === 0) {
    return <p className="text-[13px] text-ink-muted">Sem dados no trimestre.</p>
  }
  const maxY = Math.max(meta, ...weeks.map(w => w.count), 1)
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const x = (i: number) => padL + (weeks.length === 1 ? innerW / 2 : (i / (weeks.length - 1)) * innerW)
  const y = (v: number) => padT + innerH - (v / maxY) * innerH
  const points = weeks.map((w, i) => `${x(i)},${y(w.count)}`).join(' ')
  const metaY = y(meta)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-ink-muted" role="img" aria-label="Evolução semanal de reuniões">
      {/* eixo base */}
      <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="currentColor" strokeWidth="1" opacity="0.2" />
      {/* linha de meta */}
      <line x1={padL} y1={metaY} x2={W - padR} y2={metaY} stroke="var(--urg-low-fg)" strokeWidth="1" strokeDasharray="4 4" opacity="0.7" />
      {/* série */}
      <polyline points={points} fill="none" stroke="var(--accent-blue)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {weeks.map((w, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(w.count)} r="3" fill="var(--accent-blue)" />
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="currentColor">{w.label}</text>
        </g>
      ))}
    </svg>
  )
}

export type { Metricas }
