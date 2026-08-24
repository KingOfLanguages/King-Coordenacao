import { useMemo, useState } from 'react'
import {
  Crown, Medal, Trophy, TriangleAlert, ChevronDown, Users, CalendarDays,
  Star, ShieldAlert, ArrowUpDown,
} from 'lucide-react'
import { useRankingProfessores, type ItemRankingGeral } from '@/hooks/useConfiabilidade'
import { semSufixoInicio } from '@/lib/formato'
import { type NivelRanking } from '@/lib/rankingProfessores'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Ranking geral de professores — do melhor ao pior.
//
// Ocupa a tela do Comercial enquanto nenhum professor está selecionado: quem
// chega aqui sem um nome em mente quer justamente saber "quem eu posso indicar".
// Clicar num nome abre o dossiê daquele professor, que é o resto da página.
//
// A ordem NÃO é calculada aqui — vem de `ranquear` (src/lib/rankingProfessores),
// a mesma régua da aba Grupo da extensão do Meet. Esta tela só apresenta, e abre
// os eixos de cada linha para que a posição seja sempre auditável.
//
// Cores: tokens `aviso.*`, que são os únicos com par claro/escuro de verdade —
// `urg.*` não é redefinido no tema escuro e vira pastel ilegível sobre o preto.
// ─────────────────────────────────────────────────────────────────────────────

const NIVEL_META: Record<NivelRanking, { rotulo: string; cls: string; Icone: typeof Trophy }> = {
  destaque: { rotulo: 'Destaque', cls: 'bg-aviso-okBg text-aviso-okFg',       Icone: Trophy },
  regular:  { rotulo: 'Regular',  cls: 'bg-surface-muted text-ink-secondary', Icone: ArrowUpDown },
  atencao:  { rotulo: 'Atenção',  cls: 'bg-aviso-warnBg text-aviso-warnFg',   Icone: TriangleAlert },
}

/** Medalhas do pódio. Hex explícito com par escuro: não há token metálico no
 *  tema, e ouro/prata/bronze precisam ser reconhecíveis nos dois fundos. */
const PODIO = [
  { Icone: Crown, rotulo: 'Melhor colocado', tinta: 'text-[#a9791c] dark:text-[#f0c674]', anel: 'ring-[#e0c07a] dark:ring-[#6b5a2a]', chapa: 'bg-[#fdf3dc] dark:bg-[#332a12]' },
  { Icone: Medal, rotulo: '2º lugar',        tinta: 'text-[#6b7683] dark:text-[#c3cad3]', anel: 'ring-[#c2c9d1] dark:ring-[#454d57]', chapa: 'bg-[#f1f3f6] dark:bg-[#22262b]' },
  { Icone: Medal, rotulo: '3º lugar',        tinta: 'text-[#96522a] dark:text-[#d69a6a]', anel: 'ring-[#d3a382] dark:ring-[#5e3d2a]', chapa: 'bg-[#fbeee4] dark:bg-[#2e2118]' },
] as const

type Visao = 'melhores' | 'piores' | 'todos'
const LOTE = 50

export function RankingProfessores({ onSelecionar }: { onSelecionar: (id: string) => void }) {
  const { data, isLoading, error } = useRankingProfessores()
  const [grupo, setGrupo] = useState('todos')
  const [visao, setVisao] = useState<Visao>('melhores')
  const [mostrar, setMostrar] = useState(LOTE)

  const filtrados = useMemo(() => {
    const itens = data?.itens ?? []
    return grupo === 'todos' ? itens : itens.filter(i => i.grupoId === grupo)
  }, [data, grupo])

  // A posição exibida é sempre a GERAL: filtrar por coordenação responde "como o
  // meu time se sai na escola", não "quem é o melhor de um grupo de 30".
  const lista = useMemo(() => {
    if (visao === 'melhores') return filtrados.slice(0, 25)
    if (visao === 'piores')   return [...filtrados].reverse().slice(0, 25)
    return filtrados.slice(0, mostrar)
  }, [filtrados, visao, mostrar])

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center text-[13px] text-ink-muted">Montando o ranking…</div>
  }
  if (error) {
    return (
      <div className="rounded-xl border border-line bg-surface-canvas px-4 py-3 text-[13px] text-aviso-warnFg">
        Não foi possível montar o ranking. {error instanceof Error ? error.message : ''}
      </div>
    )
  }
  if (!data || filtrados.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-[13px] text-ink-muted">
        Nenhum professor ativo neste recorte.
      </div>
    )
  }

  const podio = filtrados.slice(0, 3)

  return (
    <section className="space-y-5 animate-fade-up">
      {/* ── Cabeçalho + controles ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-[17px] font-semibold tracking-tight text-ink">Ranking de professores</h2>
          <p className="text-[12px] text-ink-muted">
            {filtrados.length} professores ativos · score do King, incidentes dos últimos {data.janelaDias} dias,
            carteira de alunos e tempo de casa
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={grupo}
            onChange={e => { setGrupo(e.target.value); setMostrar(LOTE) }}
            aria-label="Filtrar por coordenação"
            className="h-8 rounded-lg border border-line bg-surface-canvas px-2.5 text-[12.5px] text-ink"
          >
            <option value="todos">Todas as coordenações</option>
            {data.grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
          </select>
          <div className="flex overflow-hidden rounded-lg border border-line">
            {(['melhores', 'piores', 'todos'] as Visao[]).map(v => (
              <button
                key={v}
                onClick={() => { setVisao(v); setMostrar(LOTE) }}
                className={cn(
                  'px-3 py-1.5 text-[12px] font-medium capitalize transition-colors',
                  visao === v ? 'bg-brand text-white' : 'bg-surface-canvas text-ink-secondary hover:bg-surface-subtle',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Pódio ── */}
      {visao === 'melhores' && (
        <div className="grid gap-3 sm:grid-cols-3">
          {podio.map((item, i) => {
            const m = PODIO[i]
            return (
              <button
                key={item.professorId}
                onClick={() => onSelecionar(item.professorId)}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left ring-1 transition-shadow hover:shadow-card',
                  m.chapa, m.anel,
                )}
              >
                <m.Icone className={cn('h-7 w-7 shrink-0', m.tinta)} strokeWidth={1.7} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink group-hover:underline">
                    {semSufixoInicio(item.nome)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-muted">
                    {m.rotulo} · {Math.round(item.pontos)} pts
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Lista ── */}
      <div className="overflow-hidden rounded-2xl ring-1 ring-line-soft">
        <ul className="divide-y divide-line-soft bg-surface-canvas">
          {lista.map(item => <Linha key={item.professorId} item={item} onSelecionar={onSelecionar} />)}
        </ul>
      </div>

      {visao === 'todos' && mostrar < filtrados.length && (
        <button
          onClick={() => setMostrar(m => m + LOTE)}
          className="mx-auto block rounded-lg border border-line px-4 py-1.5 text-[12.5px] text-ink-secondary hover:bg-surface-subtle"
        >
          Mostrar mais {Math.min(LOTE, filtrados.length - mostrar)} · faltam {filtrados.length - mostrar}
        </button>
      )}
    </section>
  )
}

function Linha({ item, onSelecionar }: { item: ItemRankingGeral; onSelecionar: (id: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const meta = NIVEL_META[item.nivel]
  const meses = item.meses

  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="w-9 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-ink-muted">
          {item.posicao}
        </span>

        <button onClick={() => onSelecionar(item.professorId)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13.5px] text-ink hover:underline">{semSufixoInicio(item.nome)}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-ink-subtle">
            {item.grupoNome && <span>{item.grupoNome}</span>}
            <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" />{item.entrada.score ?? '—'}</span>
            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{item.entrada.alunos}</span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />{meses == null ? '—' : `${Math.floor(meses)}m`}
            </span>
            {item.entrada.incidentes > 0 && (
              <span className="inline-flex items-center gap-1 text-aviso-warnFg">
                <ShieldAlert className="h-3 w-3" />{item.entrada.incidentes}
              </span>
            )}
          </span>
        </button>

        <span className={cn('hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium sm:inline-flex', meta.cls)}>
          <meta.Icone className="h-3 w-3" /> {meta.rotulo}
        </span>
        <span className="w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink">
          {Math.round(item.pontos)}
        </span>
        <button
          onClick={() => setAberto(a => !a)}
          aria-label={aberto ? 'Fechar detalhe da posição' : 'Por que esta posição?'}
          aria-expanded={aberto}
          className="shrink-0 rounded-md p-1 text-ink-muted hover:bg-surface-subtle hover:text-ink"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')} />
        </button>
      </div>

      {aberto && (
        <div className="border-t border-dashed border-line-soft bg-surface-subtle px-4 py-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">Por que esta posição</p>
          <ul className="space-y-1.5">
            {item.eixos.map(e => (
              <li key={e.chave} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="text-ink-secondary">{e.titulo}</span>
                <span className={cn(
                  'shrink-0 font-semibold tabular-nums',
                  e.pontos > 0 ? 'text-aviso-okFg' : e.pontos < 0 ? 'text-aviso-warnFg' : 'text-ink-subtle',
                )}>
                  {e.pontos > 0 ? '+' : ''}{e.pontos.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
          {item.semScore && (
            <p className="mt-2 text-[11.5px] text-ink-muted">
              Sem score sincronizado do King — a posição saiu só dos outros eixos.
            </p>
          )}
        </div>
      )}
    </li>
  )
}
