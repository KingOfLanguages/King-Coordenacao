import { useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { natureza as naturezaDe, type Aba, type Incidente } from '@/hooks/useIncidentes'
import { PRIORIDADES, PRIORIDADE_META, normalizarPrioridade, type Prioridade } from '@/lib/incidentePrioridade'
import { dentroDaSemana, somarSemanas } from '@/lib/semanaKing'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Resumo da semana (quarta → terça): o que chegou, o que saiu e onde concentrou.
// "Registrados" conta pelo created_at; "Concluídos" pelo resolved_at — um
// chamado antigo fechado nesta semana entra aqui, porque é trabalho da semana.
// Informe não tem prazo nem resolução: entra no volume, fica fora das taxas.
// ─────────────────────────────────────────────────────────────────────────────

const HORA = 3_600_000

function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function diasFmt(d: number | null): string {
  if (d === null) return '—'
  if (d < 1) return `${Math.max(1, Math.round(d * 24))}h`
  return `${d.toFixed(1).replace('.', ',')} dias`
}

function contarTop(chaves: string[], limite: number): [string, number][] {
  const m = new Map<string, number>()
  for (const k of chaves) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limite)
}

function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  const diff = atual - anterior
  const Icone = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 tabular-nums',
      diff > 0 ? 'text-urg-critFg' : diff < 0 ? 'text-urg-lowFg' : 'text-ink-subtle',
    )}>
      <Icone className="h-3 w-3" />
      {diff === 0 ? 'igual à semana anterior' : `${diff > 0 ? '+' : ''}${diff} vs. semana anterior (${anterior})`}
    </span>
  )
}

export function ResumoSemana({ incidentes, inicio, aba, agora, categoriaAtiva, professorAtivo, onCategoria, onProfessor }: {
  incidentes: Incidente[]
  inicio: Date
  aba: Aba
  agora: number
  categoriaAtiva: string
  professorAtivo: string
  onCategoria: (c: string) => void
  onProfessor: (id: string) => void
}) {
  const d = useMemo(() => {
    const anterior = somarSemanas(inicio, -1)
    const registrados = incidentes.filter(i => dentroDaSemana(i.created_at, inicio))
    const registradosAnt = incidentes.filter(i => dentroDaSemana(i.created_at, anterior)).length
    const desafios = registrados.filter(i => naturezaDe(i) === 'desafio')
    const informes = registrados.length - desafios.length

    const concluidos = incidentes.filter(i => naturezaDe(i) === 'desafio' && i.resolved && dentroDaSemana(i.resolved_at, inicio))
    const concluidosAnt = incidentes.filter(i => naturezaDe(i) === 'desafio' && i.resolved && dentroDaSemana(i.resolved_at, anterior)).length
    const diasAteResolver = concluidos.map(i => (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()) / (24 * HORA))

    const emAberto = desafios.filter(i => !i.resolved).length

    // 1ª ação no prazo: mesma regra do Desempenho — prazo ainda correndo não conta.
    let acaoAval = 0, acaoOk = 0
    for (const i of desafios) {
      if (!i.prazo_primeira_acao) continue
      const prazo = new Date(i.prazo_primeira_acao).getTime()
      if (i.primeira_acao_em) { acaoAval++; if (new Date(i.primeira_acao_em).getTime() <= prazo) acaoOk++ }
      else if (prazo < agora) acaoAval++
    }

    const porNivel = Object.fromEntries(PRIORIDADES.map(p => [p, 0])) as Record<Prioridade, number>
    for (const i of desafios) porNivel[normalizarPrioridade(i.urgency)]++

    const categorias = contarTop(registrados.map(i => i.problem_type), 6)
    const nomes = new Map<string, string>()
    for (const i of registrados) if (i.professor_id) nomes.set(i.professor_id, i.teacher_name)
    const professores = contarTop(registrados.filter(i => i.professor_id).map(i => i.professor_id!), 6)
      .map(([id, n]) => [id, nomes.get(id) ?? '—', n] as const)

    return {
      registrados: registrados.length, registradosAnt, desafios: desafios.length, informes,
      concluidos: concluidos.length, concluidosAnt, medResol: mediana(diasAteResolver),
      emAberto, acaoAval, acaoOk, porNivel, categorias, professores,
    }
  }, [incidentes, inicio, agora])

  const maxCat = d.categorias[0]?.[1] ?? 1
  const maxProf = d.professores[0]?.[2] ?? 1

  return (
    <section className="card-surface p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-line-soft border-b border-line-soft pb-3">
        <div className="pr-3">
          <p className="text-[11px] text-ink-muted">Registrados</p>
          <p className="text-2xl font-semibold text-ink tabular-nums">{d.registrados}</p>
          <p className="text-[10.5px]"><Variacao atual={d.registrados} anterior={d.registradosAnt} /></p>
          <p className="text-[10.5px] text-ink-subtle">{d.desafios} desafio{d.desafios === 1 ? '' : 's'} · {d.informes} informe{d.informes === 1 ? '' : 's'}</p>
        </div>
        <div className="px-3">
          <p className="text-[11px] text-ink-muted">Concluídos na semana</p>
          <p className="text-2xl font-semibold text-ink tabular-nums">{d.concluidos}</p>
          <p className="text-[10.5px] text-ink-subtle tabular-nums">semana anterior: {d.concluidosAnt}</p>
          <p className="text-[10.5px] text-ink-subtle">mediana até resolver: {diasFmt(d.medResol)}</p>
        </div>
        <div className="px-3">
          <p className="text-[11px] text-ink-muted">Ainda em aberto</p>
          <p className={cn('text-2xl font-semibold tabular-nums', d.emAberto ? 'text-urg-critFg' : 'text-ink')}>{d.emAberto}</p>
          <p className="text-[10.5px] text-ink-subtle">dos desafios registrados na semana</p>
        </div>
        <div className="pl-3">
          <p className="text-[11px] text-ink-muted">1ª ação no prazo</p>
          <p className="text-2xl font-semibold text-ink tabular-nums">{d.acaoAval ? `${Math.round((d.acaoOk / d.acaoAval) * 100)}%` : '—'}</p>
          <p className="text-[10.5px] text-ink-subtle tabular-nums">{d.acaoOk} de {d.acaoAval} com prazo já vencido</p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-ink-muted">Desafios por prioridade</p>
          {PRIORIDADES.map(p => (
            <div key={p} className="flex items-center justify-between text-[12px]">
              <span className={cn('inline-flex rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold', PRIORIDADE_META[p].chip)}>{p}</span>
              <span className="tabular-nums text-ink">{d.porNivel[p]}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-ink-muted">Categorias mais registradas</p>
          {d.categorias.length === 0 && <p className="text-[12px] text-ink-subtle">Nada registrado.</p>}
          {d.categorias.map(([c, n]) => (
            <button
              key={c}
              onClick={() => onCategoria(categoriaAtiva === c ? 'todas' : c)}
              aria-pressed={categoriaAtiva === c}
              className={cn('block w-full text-left rounded-md px-1.5 py-1 hover:bg-surface-subtle', categoriaAtiva === c && 'bg-surface-subtle ring-1 ring-ink')}
              title="Filtrar a lista por esta categoria"
            >
              <span className="flex items-center justify-between text-[12px]">
                <span className="truncate text-ink">{c}</span>
                <span className="tabular-nums text-ink-secondary">{n}</span>
              </span>
              <span className="mt-0.5 block h-1 rounded-full bg-accentBlue" style={{ width: `${(n / maxCat) * 100}%` }} />
            </button>
          ))}
        </div>

        {aba === 'professor' && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-ink-muted">Professores mais citados</p>
            {d.professores.length === 0 && <p className="text-[12px] text-ink-subtle">Nenhum professor citado.</p>}
            {d.professores.map(([id, nome, n]) => (
              <button
                key={id}
                onClick={() => onProfessor(professorAtivo === id ? 'todos' : id)}
                aria-pressed={professorAtivo === id}
                className={cn('block w-full text-left rounded-md px-1.5 py-1 hover:bg-surface-subtle', professorAtivo === id && 'bg-surface-subtle ring-1 ring-ink')}
                title="Filtrar a lista por este professor"
              >
                <span className="flex items-center justify-between text-[12px]">
                  <span className="truncate text-ink">{nome}</span>
                  <span className="tabular-nums text-ink-secondary">{n}</span>
                </span>
                <span className="mt-0.5 block h-1 rounded-full bg-ink-subtle" style={{ width: `${(n / maxProf) * 100}%` }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
