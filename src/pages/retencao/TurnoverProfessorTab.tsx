import {
  useTurnoverProfessores, motivoCurto, mesLabel,
  type TurnoverFaixa,
} from '@/hooks/useTurnoverProfessores'
import { cn } from '@/lib/utils'

// Aba "Professor" da página /retencao — espelho da página de turnover da
// plataforma do King, com os mesmos números e a mesma fórmula (validada em
// 01–31/08/2026: ativos 878 → 897). Ver migration 20260757.

export function TurnoverProfessorTab({ desde, ate }: { desde: string; ate: string }) {
  const { data, isLoading, error } = useTurnoverProfessores(desde, ate)

  const r           = data?.resumo
  const motivos     = data?.motivos ?? []
  const permanencia = data?.permanencia ?? []
  const mensal      = data?.mensal ?? []
  const porGrupo    = data?.porGrupo ?? []

  const saldo = (r?.entradas ?? 0) - (r?.saidas ?? 0)

  if (error) {
    return (
      <p className="text-[12.5px] text-urg-critFg">
        Não foi possível carregar o turnover: {error.message}
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {/* Faixa de métricas — mesmos 4 números do topo da página da King, mais o
          consolidado em destaque. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px rounded-2xl overflow-hidden bg-line-soft ring-1 ring-line-soft">
        <Tile valor={r?.entradas}      rotulo="Entradas no período" carregando={isLoading} />
        <Tile valor={r?.saidas}        rotulo="Saídas no período"   carregando={isLoading} />
        <Tile valor={r?.ativos_inicio} rotulo="Ativos no início"    carregando={isLoading} />
        <Tile valor={r?.ativos_fim}    rotulo="Ativos no fim"       carregando={isLoading}
              sub={saldo !== 0 ? `${saldo > 0 ? '+' : ''}${saldo} no período` : 'estável'} />
        <Tile valor={r?.turnover_pct}  rotulo="Turnover consolidado" carregando={isLoading}
              destaque sufixo="%" sub="saídas ÷ média de ativos" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Motivo de saída */}
        <section className="card-surface p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="label-micro">Motivo de saída</h2>
            <span className="text-[11px] text-ink-subtle tabular-nums">{r?.saidas ?? 0} saídas</span>
          </div>
          {isLoading ? (
            <p className="text-[12px] text-ink-muted">Carregando…</p>
          ) : motivos.length === 0 ? (
            <p className="text-[12px] text-ink-muted">Nenhuma saída no período.</p>
          ) : (
            <ul className="space-y-2.5">
              {motivos.map(m => {
                const largura = r?.saidas ? Math.max(2, Math.round((m.total / r.saidas) * 100)) : 0
                const livre = m.motivo.startsWith('Outro: ')
                return (
                  <li key={m.motivo} className="space-y-1">
                    <div className="flex items-start justify-between gap-3 text-[12px]">
                      <span className="text-ink-secondary" title={m.motivo}>
                        {livre ? (
                          <>
                            <span className="text-ink-subtle">Outro · </span>
                            {m.motivo.slice(7)}
                          </>
                        ) : motivoCurto(m.motivo)}
                      </span>
                      <span className="tabular-nums text-ink-muted flex-shrink-0">{m.total}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                      <div className="h-full rounded-full bg-accentBlue/60" style={{ width: `${largura}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Tempo de permanência */}
        <section className="card-surface p-5 space-y-3">
          <h2 className="label-micro">Tempo de permanência das saídas</h2>
          {isLoading ? (
            <p className="text-[12px] text-ink-muted">Carregando…</p>
          ) : permanencia.length === 0 ? (
            <p className="text-[12px] text-ink-muted">Nenhuma saída no período.</p>
          ) : (
            <>
              <ul className="space-y-2.5">
                {permanencia.map(f => (
                  <FaixaLinha key={f.faixa} faixa={f} total={r?.saidas ?? 0} />
                ))}
              </ul>
              {permanencia.some(f => f.ordem === 5) && (
                <p className="text-[10.5px] text-ink-subtle leading-relaxed">
                  A King joga quem tem data de entrada inválida na origem em “+12 meses”.
                  Aqui essas saídas ficam separadas em vez de inflar a faixa mais antiga.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      {/* Por coordenação — o recorte que a página da King não tem */}
      <section className="card-surface p-5 space-y-3">
        <h2 className="label-micro">Por coordenação</h2>
        {isLoading ? (
          <p className="text-[12px] text-ink-muted">Carregando…</p>
        ) : porGrupo.length === 0 ? (
          <p className="text-[12px] text-ink-muted">Sem movimento no período.</p>
        ) : (
          <Tabela
            colunas={['Grupo', 'Entraram', 'Saíram', 'Ativos no fim', 'Turnover']}
            linhas={porGrupo.map(g => [
              g.grupo_nome,
              g.entradas,
              g.saidas,
              g.ativos_fim,
              `${g.turnover_pct.toFixed(2)}%`,
            ])}
          />
        )}
      </section>

      {/* Tabela mensal */}
      <section className="card-surface p-5 space-y-3">
        <h2 className="label-micro">Mês a mês</h2>
        {isLoading ? (
          <p className="text-[12px] text-ink-muted">Carregando…</p>
        ) : mensal.length === 0 ? (
          <p className="text-[12px] text-ink-muted">Sem dados no período.</p>
        ) : (
          <Tabela
            colunas={['Mês', 'Entraram', 'Saíram', 'Ativos no fim', 'Turnover']}
            linhas={mensal.map(m => [
              mesLabel(m.ano_mes),
              m.entradas,
              m.saidas,
              m.ativos_fim,
              `${m.turnover_pct.toFixed(2)}%`,
            ])}
            rodape={mensal.length > 1 && r ? [
              'Consolidado', r.entradas, r.saidas, r.ativos_fim, `${r.turnover_pct.toFixed(2)}%`,
            ] : undefined}
          />
        )}
        <p className="text-[10.5px] text-ink-subtle leading-relaxed">
          O turnover de cada mês usa a média de ativos <em>daquele</em> mês — por isso a soma
          das linhas não dá o consolidado, que usa a média do intervalo inteiro. É o mesmo
          comportamento da tabela mensal da King.
        </p>
      </section>
    </div>
  )
}

function FaixaLinha({ faixa, total }: { faixa: TurnoverFaixa; total: number }) {
  const largura = total ? Math.max(2, Math.round((faixa.total / total) * 100)) : 0
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className={cn('text-ink-secondary', faixa.ordem === 5 && 'text-ink-subtle italic')}>
          {faixa.faixa}
        </span>
        <span className="tabular-nums text-ink-muted">{faixa.total}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
        <div
          className={cn('h-full rounded-full', faixa.ordem === 1 ? 'bg-brand/70' : 'bg-accentBlue/50')}
          style={{ width: `${largura}%` }}
        />
      </div>
    </li>
  )
}

function Tabela({ colunas, linhas, rodape }: {
  colunas: string[]
  linhas: (string | number)[][]
  rodape?: (string | number)[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted">
            {colunas.map((c, i) => (
              <th key={c} className={cn('font-semibold py-2', i === 0 ? 'text-left' : 'text-right')}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft/60">
          {linhas.map(linha => (
            <tr key={String(linha[0])}>
              {linha.map((v, i) => (
                <td
                  key={i}
                  className={cn(
                    'py-2',
                    i === 0 ? 'text-ink' : 'text-right tabular-nums text-ink-secondary',
                    i === linha.length - 1 && 'font-medium text-ink',
                  )}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {rodape && (
          <tfoot className="border-t border-line-soft">
            <tr>
              {rodape.map((v, i) => (
                <td
                  key={i}
                  className={cn(
                    'py-2 font-medium text-ink',
                    i === 0 ? 'text-left' : 'text-right tabular-nums',
                  )}
                >
                  {v}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function Tile({ valor, rotulo, sub, destaque, sufixo, carregando }: {
  valor?: number
  rotulo: string
  sub?: string
  destaque?: boolean
  sufixo?: string
  carregando?: boolean
}) {
  return (
    <div className="bg-surface-canvas p-4">
      <p className={cn(
        'text-[26px] font-semibold tabular-nums tracking-[-0.02em]',
        destaque ? 'text-brand' : 'text-ink',
      )}>
        {carregando || valor == null
          ? <span className="text-ink-subtle">—</span>
          : <>{sufixo === '%' ? valor.toFixed(2) : valor.toLocaleString('pt-BR')}{sufixo}</>}
      </p>
      <p className="text-[11.5px] text-ink-secondary mt-0.5">{rotulo}</p>
      {sub && <p className="text-[10.5px] text-ink-subtle mt-0.5">{sub}</p>}
    </div>
  )
}
