import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useIncidentes } from '@/hooks/useIncidentes'
import { LABEL_GRANULARIDADE, type Granularidade } from '@/hooks/useDashboardGeral'
import {
  recortarIncidentes, dentroDosUltimosDias, contarPorNatureza,
  topProfessores, porTipo, porPeriodo, type ProfessorCitacoes,
} from '@/lib/dashboardIncidentes'

const COR_INCIDENTE = '#f97316'          // desafio = problema a resolver
const COR_INFORME = 'var(--accent-blue)' // informe = sinal/registro

interface Props {
  /** null = todas as coordenações. */
  grupoId: string | null
  /** professor_id → grupo_id, montado a partir dos professores ativos do dashboard. */
  professorGrupo: Map<string, string | null>
  dataInicial: string
  dataFinal: string
}

export function IncidentesDashboardSection({ grupoId, professorGrupo, dataInicial, dataFinal }: Props) {
  const { data: incidentes = [], isLoading } = useIncidentes()
  const [gran, setGran] = useState<Granularidade>('mes')

  // Recorte principal: coordenação + intervalo de datas.
  const recorte = useMemo(
    () => recortarIncidentes(incidentes, grupoId, professorGrupo, dataInicial, dataFinal),
    [incidentes, grupoId, professorGrupo, dataInicial, dataFinal],
  )

  // Top professores usa janelas móveis (7/30 dias) → só recorta por coordenação,
  // ignorando o intervalo de datas de propósito.
  const soCoordenacao = useMemo(
    () => recortarIncidentes(incidentes, grupoId, professorGrupo, '', ''),
    [incidentes, grupoId, professorGrupo],
  )
  const top7 = useMemo(
    () => topProfessores(soCoordenacao.filter(i => dentroDosUltimosDias(i.created_at, 7))),
    [soCoordenacao],
  )
  const top30 = useMemo(
    () => topProfessores(soCoordenacao.filter(i => dentroDosUltimosDias(i.created_at, 30))),
    [soCoordenacao],
  )

  const contador = useMemo(() => contarPorNatureza(recorte), [recorte])
  const tipos = useMemo(() => porTipo(recorte), [recorte])
  const serie = useMemo(() => porPeriodo(recorte, gran), [recorte, gran])

  const pctInformes = contador.total ? Math.round((contador.informes / contador.total) * 100) : 0
  const donut = [
    { name: 'Incidentes', value: contador.desafios },
    { name: 'Informes', value: contador.informes },
  ]

  const recorteLabel = dataInicial || dataFinal
    ? `${fmtBr(dataInicial) || '…'} até ${fmtBr(dataFinal) || '…'}`
    : 'todo o histórico'

  return (
    <section className="card-surface p-5 space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="label-micro">Incidentes &amp; Informes</h2>
        <span className="text-[11px] text-ink-subtle">
          {grupoId ? 'coordenação selecionada' : 'todas as coordenações'} · {recorteLabel}
        </span>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
      ) : contador.total === 0 ? (
        <p className="text-[13px] text-ink-muted">Nenhum incidente ou informe no recorte selecionado.</p>
      ) : (
        <>
          {/* ── Contador incidentes × informes ── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MiniStat label="Registros" value={contador.total} />
              <MiniStat label="Incidentes" value={contador.desafios} dot={COR_INCIDENTE} />
              <MiniStat label="Informes" value={contador.informes} dot={COR_INFORME} />
              <MiniStat label="% de informes" value={`${pctInformes}%`} />
            </div>
            <div className="flex items-center justify-center min-h-[160px]">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={donut} dataKey="value" nameKey="name"
                    innerRadius={44} outerRadius={64} paddingAngle={2} isAnimationActive={false}
                    label={({ name, percent }: { name?: string; percent?: number }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    <Cell fill={COR_INCIDENTE} />
                    <Cell fill={COR_INFORME} />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Top professores mais citados (7 × 30 dias) ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <TopProfessoresCard titulo="Mais citados — últimos 7 dias" lista={top7} />
            <TopProfessoresCard titulo="Mais citados — últimos 30 dias" lista={top30} />
          </div>

          {/* ── Registros por tipo ── */}
          <div className="space-y-3">
            <h3 className="text-[12px] font-medium text-ink-secondary">Registros por tipo</h3>
            {tipos.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Sem registros no recorte.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, tipos.length * 34)}>
                <BarChart data={tipos} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="tipo" tick={{ fontSize: 10 }} width={200} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="incidentes" name="Incidentes" stackId="a" fill={COR_INCIDENTE} radius={[0, 0, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="informes" name="Informes" stackId="a" fill={COR_INFORME} radius={[0, 3, 3, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Evolução por período ── */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[12px] font-medium text-ink-secondary">Evolução por período</h3>
              <Select value={gran} onValueChange={v => setGran(v as Granularidade)}>
                <SelectTrigger className="h-8 w-[130px] text-[12px] bg-surface-canvas border-line text-ink">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-canvas border-line text-ink">
                  {(['semana', 'mes', 'trimestre', 'ano'] as Granularidade[]).map(g => (
                    <SelectItem key={g} value={g} className="text-[12px]">{LABEL_GRANULARIDADE[g]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {serie.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Sem registros no recorte.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="incidentes" name="Incidentes" stackId="a" fill={COR_INCIDENTE} isAnimationActive={false} />
                  <Bar dataKey="informes" name="Informes" stackId="a" fill={COR_INFORME} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function MiniStat({ label, value, dot }: { label: string; value: number | string; dot?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-canvas p-3 space-y-1">
      <p className="text-[11px] text-ink-muted flex items-center gap-1.5">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  )
}

function TopProfessoresCard({ titulo, lista }: { titulo: string; lista: ProfessorCitacoes[] }) {
  const max = lista.length ? lista[0].total : 0
  return (
    <div className="rounded-lg border border-line bg-surface-canvas p-4 space-y-3">
      <h3 className="text-[12px] font-medium text-ink-secondary">{titulo}</h3>
      {lista.length === 0 ? (
        <p className="text-[13px] text-ink-muted">Nenhum professor citado no período.</p>
      ) : (
        <ul className="space-y-2.5">
          {lista.map((p, idx) => (
            <li key={p.professor_id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="truncate text-ink">
                  <span className="text-ink-subtle tabular-nums mr-1.5">{idx + 1}.</span>{p.nome}
                </span>
                <span className="flex-shrink-0 tabular-nums text-ink-muted">
                  <span className="font-semibold text-ink">{p.total}</span>
                  <span className="text-[10.5px] text-ink-subtle"> ({p.desafios} inc · {p.informes} inf)</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden flex">
                <div className="h-full" style={{ width: `${max ? (p.desafios / max) * 100 : 0}%`, background: COR_INCIDENTE }} />
                <div className="h-full" style={{ width: `${max ? (p.informes / max) * 100 : 0}%`, background: COR_INFORME }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── util ────────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' → 'DD/MM/AAAA' (vazio devolve ''). */
function fmtBr(iso: string): string {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  return d && m && a ? `${d}/${m}/${a}` : iso
}
