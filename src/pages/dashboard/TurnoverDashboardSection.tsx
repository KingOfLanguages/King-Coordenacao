import { type ReactNode } from 'react'
import { Users, GraduationCap } from 'lucide-react'
import {
  useTurnoverProfessores, useTurnoverAlunos, type TurnoverGrupo, type TurnoverResumo,
} from '@/hooks/useTurnoverProfessores'
import { type Janela } from '@/hooks/useDashboardGeral'
import { cn } from '@/lib/utils'

// Zona de turnover do Dashboard Geral — professor e aluno lado a lado, com o
// mesmo recorte por coordenação. Mesma fórmula nos dois:
//
//   turnover % = saídas ÷ média(ativos no início, ativos no fim)
//
// A de professor espelha a página da plataforma do King (validada em agosto/26:
// 878 → 897). A de aluno aplica a mesma conta sobre matrícula e saída da escola
// — troca de professor não conta como saída. Ver migrations 20260757/20260758.

interface Props {
  grupoId: string | null
  /** Janela do filtro global de período — o turnover é sempre apurado nela. */
  janela: Janela
}

export function TurnoverDashboardSection({ grupoId, janela }: Props) {
  const professores = useTurnoverProfessores(janela.inicio, janela.fim)
  const alunos      = useTurnoverAlunos(janela.inicio, janela.fim)

  // Com uma coordenação selecionada, o consolidado passa a ser o dela — senão o
  // topo do card mostraria a escola inteira ao lado de uma tabela de uma linha.
  const recorte = (resumo: TurnoverResumo | undefined, grupos: TurnoverGrupo[]) => {
    if (!grupoId) return resumo
    return grupos.find(g => g.grupo_id === grupoId) ?? undefined
  }

  const gruposProf  = (professores.data?.porGrupo ?? []).filter(g => !grupoId || g.grupo_id === grupoId)
  const gruposAluno = (alunos.data?.porGrupo ?? []).filter(g => !grupoId || g.grupo_id === grupoId)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloco
        icone={<Users className="h-3.5 w-3.5" />}
        titulo="Turnover de professores"
        hint="mesma metodologia da plataforma do King"
        resumo={recorte(professores.data?.resumo, professores.data?.porGrupo ?? [])}
        grupos={gruposProf}
        carregando={professores.isLoading}
        erro={professores.error}
        unidade="professores"
      />
      <Bloco
        icone={<GraduationCap className="h-3.5 w-3.5" />}
        titulo="Turnover de alunos"
        hint="saída da escola — troca de professor não conta"
        resumo={recorte(alunos.data?.resumo, alunos.data?.porGrupo ?? [])}
        grupos={gruposAluno}
        carregando={alunos.isLoading}
        erro={alunos.error}
        unidade="alunos"
        nota="A API devolve as saídas de aluno dos últimos ~12 meses; períodos anteriores a isso inflam a base de ativos."
      />
    </div>
  )
}

function Bloco({ icone, titulo, hint, resumo, grupos, carregando, erro, unidade, nota }: {
  icone: ReactNode
  titulo: string
  hint: string
  resumo?: TurnoverResumo
  grupos: TurnoverGrupo[]
  carregando: boolean
  erro: Error | null
  unidade: string
  nota?: string
}) {
  const saldo = (resumo?.entradas ?? 0) - (resumo?.saidas ?? 0)

  return (
    <div className="card-surface p-5 space-y-4">
      <div className="space-y-0.5">
        <h2 className="text-[14px] font-semibold tracking-tight text-ink flex items-center gap-1.5">
          <span className="text-ink-subtle">{icone}</span>{titulo}
        </h2>
        <p className="text-[11.5px] text-ink-muted">{hint}</p>
      </div>

      {erro ? (
        <p className="text-[12.5px] text-urg-critFg">Não foi possível carregar: {erro.message}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl bg-line-soft ring-1 ring-line-soft overflow-hidden">
            <MiniStat label="Entradas" value={resumo?.entradas} dot="#22c55e" carregando={carregando} />
            <MiniStat label="Saídas"   value={resumo?.saidas}   dot="#ef4444" carregando={carregando}
                      warn={(resumo?.saidas ?? 0) > 0} />
            <MiniStat label="Base média" carregando={carregando}
                      value={resumo ? Math.round((resumo.ativos_inicio + resumo.ativos_fim) / 2) : undefined}
                      sub={resumo ? `${resumo.ativos_inicio} → ${resumo.ativos_fim}` : undefined} />
            <MiniStat label="Turnover" carregando={carregando} destaque
                      value={resumo ? `${resumo.turnover_pct.toFixed(2)}%` : undefined}
                      sub={saldo !== 0 ? `saldo ${saldo > 0 ? '+' : ''}${saldo}` : 'saldo estável'} />
          </div>

          {carregando ? (
            <p className="text-[12.5px] text-ink-muted py-4 text-center">Carregando…</p>
          ) : grupos.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted py-4 text-center">
              Sem movimento de {unidade} no período selecionado.
            </p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[0.06em] text-ink-muted">
                  <th className="text-left font-semibold py-2">Coordenação</th>
                  <th className="text-right font-semibold py-2">Entraram</th>
                  <th className="text-right font-semibold py-2">Saíram</th>
                  <th className="text-right font-semibold py-2">Ativos</th>
                  <th className="text-right font-semibold py-2">Turnover</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft/60">
                {grupos.map(g => (
                  <tr key={g.grupo_id ?? '__sem__'}>
                    <td className="py-2 text-ink">{g.grupo_nome}</td>
                    <td className="py-2 text-right tabular-nums text-ink-secondary">{g.entradas}</td>
                    <td className="py-2 text-right tabular-nums text-ink-secondary">{g.saidas}</td>
                    <td className="py-2 text-right tabular-nums text-ink-secondary">{g.ativos_fim}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-ink">
                      {g.turnover_pct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {nota && <p className="text-[10.5px] text-ink-subtle leading-relaxed">{nota}</p>}
        </>
      )}
    </div>
  )
}

function MiniStat({ label, value, dot, sub, warn, destaque, carregando }: {
  label: string
  value?: ReactNode
  dot?: string
  sub?: string
  warn?: boolean
  destaque?: boolean
  carregando?: boolean
}) {
  return (
    <div className="bg-surface-canvas px-4 py-3 space-y-1.5">
      <p className="text-[11px] text-ink-muted flex items-center gap-1.5">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}{label}
      </p>
      <p className={cn(
        'text-[20px] font-semibold tabular-nums leading-none',
        destaque ? 'text-brand' : warn ? 'text-urg-highFg' : 'text-ink',
      )}>
        {carregando || value == null ? <span className="text-ink-subtle">—</span> : value}
      </p>
      {sub && <p className="text-[10.5px] text-ink-subtle truncate" title={sub}>{sub}</p>}
    </div>
  )
}
