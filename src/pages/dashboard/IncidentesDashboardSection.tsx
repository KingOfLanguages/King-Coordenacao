import { useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { useIncidentes } from '@/hooks/useIncidentes'
import { type Bucket, type Janela } from '@/hooks/useDashboardGeral'
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
  /** Janela do filtro global de período — vale para todos os números do bloco. */
  janela: Janela
  /** Intervalo da série temporal (os N períodos que o gráfico mostra). */
  serie: { inicio: string; fim: string }
  /** Períodos da série (já na granularidade do filtro global), pra zerar os vazios. */
  serieBuckets: Bucket[]
}

export function IncidentesDashboardSection({ grupoId, professorGrupo, janela, serie: serieRange, serieBuckets }: Props) {
  const { data: incidentes = [], isLoading } = useIncidentes()

  // Recorte principal: coordenação + janela do período.
  const recorte = useMemo(
    () => recortarIncidentes(incidentes, grupoId, professorGrupo, janela.inicio, janela.fim),
    [incidentes, grupoId, professorGrupo, janela],
  )

  // A série cobre mais períodos que a janela, então tem recorte próprio.
  const recorteSerie = useMemo(
    () => recortarIncidentes(incidentes, grupoId, professorGrupo, serieRange.inicio, serieRange.fim),
    [incidentes, grupoId, professorGrupo, serieRange],
  )

  const soCoordenacao = useMemo(
    () => recortarIncidentes(incidentes, grupoId, professorGrupo, '', ''),
    [incidentes, grupoId, professorGrupo],
  )
  // Ranking do período selecionado + a janela móvel de 30 dias (calor recente).
  const topPeriodo = useMemo(() => topProfessores(recorte), [recorte])
  const top30 = useMemo(
    () => topProfessores(soCoordenacao.filter(i => dentroDosUltimosDias(i.created_at, 30))),
    [soCoordenacao],
  )

  const contador = useMemo(() => contarPorNatureza(recorte), [recorte])
  const tipos = useMemo(() => porTipo(recorte), [recorte])
  const serie = useMemo(
    () => porPeriodo(recorteSerie, janela.gran, serieBuckets),
    [recorteSerie, janela.gran, serieBuckets],
  )

  const pctInformes = contador.total ? Math.round((contador.informes / contador.total) * 100) : 0
  const pctDesafios = contador.total ? (contador.desafios / contador.total) * 100 : 0

  return (
    <section className="card-surface p-5 space-y-7">
      <div className="flex justify-end">
        <span className="text-[11px] text-ink-subtle">
          {grupoId ? 'coordenação selecionada' : 'todas as coordenações'} · {fmtBr(janela.inicio)} até {fmtBr(janela.fim)}
        </span>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
      ) : (
        <>
          {contador.total === 0 && (
            <p className="text-[13px] text-ink-muted">
              Nenhum incidente ou informe no período selecionado — a evolução abaixo mostra os períodos vizinhos.
            </p>
          )}
          {contador.total > 0 && <>
          {/* ── Proporção incidentes × informes ── */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <div className="flex items-end gap-8">
                <NumeroChave label="Incidentes" value={contador.desafios} cor={COR_INCIDENTE} />
                <NumeroChave label="Informes" value={contador.informes} cor={COR_INFORME} />
                <NumeroChave label="Total de registros" value={contador.total} />
              </div>
              <span className="text-[12px] text-ink-muted tabular-nums">{pctInformes}% são informes</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-muted" role="img"
              aria-label={`${contador.desafios} incidentes e ${contador.informes} informes`}>
              <div style={{ width: `${pctDesafios}%`, background: COR_INCIDENTE }} />
              <div style={{ width: `${100 - pctDesafios}%`, background: COR_INFORME }} />
            </div>
          </div>

          {/* ── Top professores mais citados: período × janela móvel de 30 dias ── */}
          <div className="grid gap-px overflow-hidden rounded-xl bg-line-soft ring-1 ring-line-soft md:grid-cols-2">
            <TopProfessores titulo="Mais citados — no período" lista={topPeriodo} />
            <TopProfessores titulo="Mais citados — últimos 30 dias" lista={top30} />
          </div>

          {/* ── Registros por tipo ── */}
          <div className="space-y-3">
            <h3 className="text-[13px] font-medium text-ink">Registros por tipo</h3>
            {tipos.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Sem registros no recorte.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, tipos.length * 34)}>
                <BarChart data={tipos} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="tipo" tick={{ fontSize: 10 }} width={200} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="incidentes" name="Incidentes" stackId="a" fill={COR_INCIDENTE} isAnimationActive={false} />
                  <Bar dataKey="informes" name="Informes" stackId="a" fill={COR_INFORME} radius={[0, 3, 3, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          </>}

          {/* ── Evolução por período (na granularidade do filtro global) ── */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-medium text-ink">Evolução por período</h3>
              <span className="text-[11px] text-ink-subtle">
                {serie.length} {serie.length === 1 ? 'período' : 'períodos'} até {janela.label.toLowerCase()}
              </span>
            </div>
            {serie.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Sem registros no recorte.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
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

function NumeroChave({ label, value, cor }: { label: string; value: number; cor?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-ink-muted flex items-center gap-1.5">
        {cor && <span className="h-2 w-2 rounded-full" style={{ background: cor }} />}
        {label}
      </p>
      <p className="text-[26px] font-semibold leading-none tabular-nums text-ink">{value}</p>
    </div>
  )
}

function TopProfessores({ titulo, lista }: { titulo: string; lista: ProfessorCitacoes[] }) {
  const max = lista.length ? lista[0].total : 0
  return (
    <div className="bg-surface-canvas p-4 space-y-3">
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
