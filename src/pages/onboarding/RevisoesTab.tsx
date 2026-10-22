import { useMemo, useState } from 'react'
import { Clock3, ChevronRight } from 'lucide-react'
import { dataBR } from '@/lib/formato'
import { fmtHaQuanto, fmtRestanteCurto } from '@/lib/prazoTrilha'
import { ProfessorTrilhaDialog } from './ProfessorTrilhaDialog'
import { ehTeste, useLinhasTrilha } from './trilhaComum'

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Revisões": toda dissertativa esperando nota, de todos os professores.
//
// Antes (até 22/10/2026) ela só aparecia dentro de cada professor, e quem não
// abria o detalhe não via. Enquanto ninguém corrige, a etapa fica em
// `revisao_pendente` e o professor não destrava a seguinte — por isso a fila
// vem na ordem do prazo de cada um. Clicar abre o painel já na etapa.
// ─────────────────────────────────────────────────────────────────────────────

type Item = {
  professorId: string
  nome: string
  coordenacao: string
  etapaId: string
  numero: number
  titulo: string
  tentativas: number
  iniciadaEm: string | null
  prazoEm: string | null
  soFaltaRevisao: boolean
}

export function RevisoesTab() {
  const { linhas, ativas, agora } = useLinhasTrilha()
  const [aberto, setAberto] = useState<{ professorId: string; etapaId: string } | null>(null)

  const itens = useMemo<Item[]>(() => {
    const lista: Item[] = []
    for (const l of linhas) {
      if (!l.revisoes_pendentes) continue
      ativas.forEach((e, i) => {
        const p = l.porEtapa.get(e.id)
        if (!p?.revisao_pendente) return
        lista.push({
          professorId: l.professor_id,
          nome: l.nome,
          coordenacao: [l.grupo, l.coordenador?.split(' ')[0]].filter(Boolean).join(' · '),
          etapaId: e.id,
          numero: i + 1,
          titulo: e.titulo,
          tentativas: p.tentativas,
          iniciadaEm: p.iniciada_em,
          prazoEm: l.prazo_em,
          soFaltaRevisao: l.so_falta_revisao,
        })
      })
    }
    // Quem tem o prazo mais perto primeiro; sem prazo (dispensado), no fim.
    return lista.sort((a, b) => (a.prazoEm ?? '9999').localeCompare(b.prazoEm ?? '9999') || a.numero - b.numero)
  }, [linhas, ativas])

  const linhaAberta = aberto ? linhas.find(l => l.professor_id === aberto.professorId) ?? null : null

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-[13px] text-ink-muted">
        Respostas dissertativas esperando nota. Enquanto ninguém corrige, o professor não passa para a etapa
        seguinte. Se só falta a correção, o prazo dele não trava, mas ele fica parado.
      </p>

      {itens.length === 0 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          Nenhuma resposta esperando revisão.
        </div>
      ) : (
        <ul className="card-surface divide-y divide-line-soft overflow-hidden">
          {itens.map(it => {
            const restante = it.prazoEm ? new Date(it.prazoEm).getTime() - agora : null
            return (
              <li key={`${it.professorId}-${it.etapaId}`}>
                <button
                  type="button"
                  onClick={() => setAberto({ professorId: it.professorId, etapaId: it.etapaId })}
                  className="btn-press flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-subtle"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-urg-medBg text-urg-medFg">
                    <Clock3 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {it.nome}
                      {ehTeste(it.nome) && <span className="ml-1.5 text-[11px] font-normal text-ink-muted">teste</span>}
                    </span>
                    <span className="block truncate text-[12px] text-ink-muted">
                      Etapa {it.numero} · {it.titulo}
                      {it.coordenacao && ` · ${it.coordenacao}`}
                    </span>
                  </span>
                  <span className="hidden flex-shrink-0 text-right text-[11.5px] text-ink-muted sm:block">
                    {it.tentativas} {it.tentativas === 1 ? 'tentativa' : 'tentativas'}
                    {it.iniciadaEm && <><br />abriu a etapa em {dataBR(it.iniciadaEm.slice(0, 10))}</>}
                  </span>
                  <span className="w-[120px] flex-shrink-0 text-right text-[11.5px]">
                    {restante == null
                      ? <span className="text-ink-subtle">sem prazo</span>
                      : it.soFaltaRevisao
                        ? <span className="font-medium text-urg-medFg">só falta a correção</span>
                        : restante <= 0
                          ? <span className="text-ink-muted">prazo esgotou {fmtHaQuanto(-restante)}</span>
                          : <span className="text-ink-secondary">prazo: faltam {fmtRestanteCurto(restante)}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-subtle" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {linhaAberta && aberto && (
        <ProfessorTrilhaDialog
          key={`${aberto.professorId}-${aberto.etapaId}`}
          linha={linhaAberta}
          etapas={ativas}
          agora={agora}
          etapaInicial={aberto.etapaId}
          onFechar={() => setAberto(null)}
        />
      )}
    </div>
  )
}
