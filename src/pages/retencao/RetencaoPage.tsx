import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TurnoverProfessorTab } from './TurnoverProfessorTab'
import { RetencaoAlunoTab } from './RetencaoAlunoTab'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Duas medidas que a coordenação confundia porque dividiam a mesma página:
//
//   Professor — entrada/saída do PROFESSOR. É o que a plataforma do King chama
//               de turnover e o número que se compara com eles. Espelho fiel:
//               mesma fórmula, mesmos motivos, mesmas faixas (migration 20260757).
//   Aluno     — saída de ALUNO (churn da escola × troca de professor). Era o
//               conteúdo original desta página; nunca teve como bater com a King,
//               porque mede outra coisa.

type Aba = 'professor' | 'aluno'

// toISOString() converte pra UTC e, em fuso negativo, joga uma data construída à
// meia-noite local pro dia anterior. Formata direto dos campos locais.
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const hoje = new Date()
// Padrão = mês corrente, igual ao filtro que abre na página da King.
const PADRAO_DESDE = fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
const PADRAO_ATE   = fmt(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))

const ATALHOS: [string, () => [string, string]][] = [
  ['Mês atual', () => [
    fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    fmt(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  ]],
  ['Mês passado', () => [
    fmt(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
    fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
  ]],
  ['Últimos 6 meses', () => [
    fmt(new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1)),
    fmt(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  ]],
  ['Ano', () => [fmt(new Date(hoje.getFullYear(), 0, 1)), fmt(new Date(hoje.getFullYear(), 11, 31))]],
]

export function RetencaoPage() {
  const [params] = useSearchParams()
  const [aba, setAba] = useState<Aba>(params.get('aba') === 'aluno' ? 'aluno' : 'professor')
  const [desde, setDesde] = useState(PADRAO_DESDE)
  const [ate, setAte]     = useState(PADRAO_ATE)

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-5">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[19px] font-semibold text-ink tracking-[-0.01em]">Turnover &amp; Retenção</h1>
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            {aba === 'professor'
              ? 'Entrada e saída de professor no período — mesma metodologia da plataforma do King.'
              : 'Saídas de aluno no período, separando churn da escola de troca de professor.'}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
            De
            <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="h-9 w-[9.5rem]" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
            Até
            <Input type="date" value={ate} onChange={e => setAte(e.target.value)} className="h-9 w-[9.5rem]" />
          </label>
        </div>
      </header>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-surface-subtle rounded-full p-1 w-fit">
          {([['professor', 'Professor'], ['aluno', 'Aluno']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={cn(
                'btn-press px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-colors',
                aba === id ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {ATALHOS.map(([label, calc]) => {
            const [d, a] = calc()
            const ativo = d === desde && a === ate
            return (
              <button
                key={label}
                onClick={() => { setDesde(d); setAte(a) }}
                className={cn(
                  'btn-press px-2.5 py-1 rounded-full text-[11.5px] transition-colors',
                  ativo
                    ? 'bg-accentBlue-soft text-accentBlue font-medium'
                    : 'text-ink-muted hover:text-ink hover:bg-surface-subtle',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {aba === 'professor'
        ? <TurnoverProfessorTab desde={desde} ate={ate} />
        : <RetencaoAlunoTab     desde={desde} ate={ate} />}
    </div>
  )
}
