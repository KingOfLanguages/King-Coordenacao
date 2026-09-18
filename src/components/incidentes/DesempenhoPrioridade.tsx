import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { natureza as naturezaDe, type Aba, type Incidente } from '@/hooks/useIncidentes'
import { PRIORIDADES, PRIORIDADE_META, normalizarPrioridade, type Prioridade } from '@/lib/incidentePrioridade'
import { cn } from '@/lib/utils'
import { useAgora } from '@/hooks/useAgora'

// ─────────────────────────────────────────────────────────────────────────────
// Desempenho do mês por prioridade: os números que dizem se o sistema de
// prioridade está funcionando — não só quanto chegou, mas se alguém agiu e
// resolveu dentro do prazo que o nível promete.
//
// Conta os DESAFIOS registrados no mês (informe não tem prazo). Um prazo que
// ainda não venceu e não foi cumprido não entra na conta de "no prazo" — ele
// ainda pode dar certo, então fica de fora em vez de puxar a taxa para baixo.
//
// Meta de Urgente: até 10% do total. Acima disso o nível volta a virar o
// "Crítico" de antes (37% em 2026-09), e a fila perde o sentido.
// ─────────────────────────────────────────────────────────────────────────────

const META_URGENTE = 0.10
const HORA = 3_600_000

interface Linha {
  total: number
  concluidos: number
  acaoNoPrazo: number
  acaoAvaliados: number
  resolNoPrazo: number
  resolAvaliados: number
  horasAteAcao: number[]
  diasAteResolver: number[]
}

function vazia(): Linha {
  return { total: 0, concluidos: 0, acaoNoPrazo: 0, acaoAvaliados: 0, resolNoPrazo: 0, resolAvaliados: 0, horasAteAcao: [], diasAteResolver: [] }
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)}%` : '—'
}

function horasFmt(h: number | null): string {
  if (h === null) return '—'
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}min`
  if (h < 48) return `${Math.round(h)}h`
  return `${Math.round(h / 24)} dias`
}

function diasFmt(d: number | null): string {
  if (d === null) return '—'
  if (d < 1) return `${Math.max(1, Math.round(d * 24))}h`
  return `${d.toFixed(1).replace('.', ',')} dias`
}

function acumular(l: Linha, i: Incidente, agora: number) {
  l.total++
  if (i.resolved) l.concluidos++

  const criado = new Date(i.created_at).getTime()
  const acao = i.primeira_acao_em ? new Date(i.primeira_acao_em).getTime() : null
  if (acao !== null) l.horasAteAcao.push((acao - criado) / HORA)
  if (i.prazo_primeira_acao) {
    const prazo = new Date(i.prazo_primeira_acao).getTime()
    if (acao !== null) { l.acaoAvaliados++; if (acao <= prazo) l.acaoNoPrazo++ }
    else if (prazo < agora) l.acaoAvaliados++          // venceu sem ninguém agir
  }

  const fim = i.resolved && i.resolved_at ? new Date(i.resolved_at).getTime() : null
  if (fim !== null) l.diasAteResolver.push((fim - criado) / (24 * HORA))
  if (i.prazo_resolucao) {
    const prazo = new Date(i.prazo_resolucao).getTime()
    if (fim !== null) { l.resolAvaliados++; if (fim <= prazo) l.resolNoPrazo++ }
    else if (prazo < agora) l.resolAvaliados++
  }
}

const NOME_ABA: Record<Aba, string> = { professor: 'Professor', geral: 'Geral', plataforma: 'Plataforma' }

export function DesempenhoPrioridade({ incidentes, aba }: { incidentes: Incidente[]; aba: Aba }) {
  const hoje = new Date()
  const [mes, setMes] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const ehMesAtual = mes.getFullYear() === hoje.getFullYear() && mes.getMonth() === hoje.getMonth()
  const agora = useAgora()

  const dados = useMemo(() => {
    const ini = mes.getTime()
    const fim = new Date(mes.getFullYear(), mes.getMonth() + 1, 1).getTime()
    const porNivel = Object.fromEntries(PRIORIDADES.map(p => [p, vazia()])) as Record<Prioridade, Linha>
    const geral = vazia()
    for (const i of incidentes) {
      if (naturezaDe(i) !== 'desafio') continue
      const t = new Date(i.created_at).getTime()
      if (t < ini || t >= fim) continue
      acumular(porNivel[normalizarPrioridade(i.urgency)], i, agora)
      acumular(geral, i, agora)
    }
    return { porNivel, geral }
  }, [incidentes, mes, agora])

  const { geral, porNivel } = dados
  const fracUrgente = geral.total ? porNivel.Urgente.total / geral.total : 0
  const nomeMesBruto = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const nomeMes = nomeMesBruto.charAt(0).toUpperCase() + nomeMesBruto.slice(1)

  const kpis: { rotulo: string; valor: string; nota: string; alerta?: boolean }[] = [
    {
      rotulo: 'Urgentes',
      valor: geral.total ? `${Math.round(fracUrgente * 100)}%` : '—',
      nota: `meta: até ${Math.round(META_URGENTE * 100)}% · ${porNivel.Urgente.total} de ${geral.total}`,
      alerta: fracUrgente > META_URGENTE,
    },
    {
      rotulo: '1ª ação no prazo',
      valor: pct(geral.acaoNoPrazo, geral.acaoAvaliados),
      nota: `mediana até agir: ${horasFmt(mediana(geral.horasAteAcao))}`,
    },
    {
      rotulo: 'Resolvidos no prazo',
      valor: pct(geral.resolNoPrazo, geral.resolAvaliados),
      nota: `${geral.concluidos} concluído${geral.concluidos === 1 ? '' : 's'} de ${geral.total}`,
    },
    {
      rotulo: 'Tempo até resolver',
      valor: diasFmt(mediana(geral.diasAteResolver)),
      nota: 'mediana dos concluídos',
    },
  ]

  return (
    <section className="card-surface p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">Desempenho por prioridade · {NOME_ABA[aba]}</h2>
          <p className="text-[11.5px] text-ink-muted">Chamados registrados no mês. Prazo que ainda não venceu não entra na taxa.</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="btn-press rounded-md p-1 text-ink-muted hover:bg-surface-subtle hover:text-ink"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[130px] text-center text-[12.5px] font-medium text-ink">{nomeMes}</span>
          <button
            onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            disabled={ehMesAtual}
            className="btn-press rounded-md p-1 text-ink-muted hover:bg-surface-subtle hover:text-ink disabled:opacity-30"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-line-soft border-y border-line-soft">
        {kpis.map(k => (
          <div key={k.rotulo} className="px-3 py-2.5 first:pl-0">
            <p className="text-[11px] text-ink-muted">{k.rotulo}</p>
            <p className={cn('text-xl font-semibold tabular-nums', k.alerta ? 'text-urg-critFg' : 'text-ink')}>{k.valor}</p>
            <p className={cn('text-[10.5px]', k.alerta ? 'text-urg-critFg' : 'text-ink-subtle')}>{k.nota}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-ink-muted">
              <th className="py-1.5 pr-3 font-medium">Prioridade</th>
              <th className="py-1.5 pr-3 font-medium text-right">Registrados</th>
              <th className="py-1.5 pr-3 font-medium text-right">Concluídos</th>
              <th className="py-1.5 pr-3 font-medium text-right">1ª ação no prazo</th>
              <th className="py-1.5 pr-3 font-medium text-right">Até agir (mediana)</th>
              <th className="py-1.5 pr-3 font-medium text-right">Resolvidos no prazo</th>
              <th className="py-1.5 font-medium text-right">Prazo do nível</th>
            </tr>
          </thead>
          <tbody>
            {PRIORIDADES.map(p => {
              const l = porNivel[p]
              const m = PRIORIDADE_META[p]
              return (
                <tr key={p} className="border-t border-line-soft tabular-nums">
                  <td className="py-1.5 pr-3">
                    <span className={cn('inline-flex rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold', m.chip)}>{p}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right text-ink">{l.total}</td>
                  <td className="py-1.5 pr-3 text-right text-ink-secondary">{l.concluidos}</td>
                  <td className="py-1.5 pr-3 text-right text-ink-secondary">{pct(l.acaoNoPrazo, l.acaoAvaliados)}</td>
                  <td className="py-1.5 pr-3 text-right text-ink-secondary">{horasFmt(mediana(l.horasAteAcao))}</td>
                  <td className="py-1.5 pr-3 text-right text-ink-secondary">{pct(l.resolNoPrazo, l.resolAvaliados)}</td>
                  <td className="py-1.5 text-right text-[11px] text-ink-muted">agir {m.primeiraAcao} · resolver {m.resolucao}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
