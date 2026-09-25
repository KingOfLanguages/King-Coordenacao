import { useMemo, useState } from 'react'
import { TriangleAlert, Clock3, Users, CheckCircle2, CircleSlash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDuracao } from '@/lib/formato'
import { useProfessores } from '@/hooks/useProfessores'
import {
  useEtapasAdmin, useProgressoTodos, useQuestoesTodas, useRespostasTodas,
  type EtapaAdmin, type QuestaoAdmin, type RespostaResumo, type ProgressoAdmin,
} from '@/hooks/useWelcomePathAdmin'

// ─────────────────────────────────────────────────────────────────────────────
// Painel da trilha: como o CONTEÚDO está funcionando, não onde cada professor
// está (isso é a aba Welcome Path). Três perguntas:
//
//   onde as pessoas param   funil por etapa (começaram × concluíram)
//   quanto tempo levam      tempo real mediano × o tempo estimado
//   o que confunde          questões com mais erro na 1ª tentativa, e a
//                           alternativa errada mais marcada
//
// Só a 1ª tentativa entra no erro: a partir da 2ª o professor já viu a
// explicação, e o número mede memória, não o conteúdo. Contas cujo nome tem
// "teste" ficam de fora por padrão, senão os testes da coordenação poluem a
// leitura enquanto há poucas turmas.
// ─────────────────────────────────────────────────────────────────────────────

/** Abaixo disso, o % de erro é anedota: mostramos, mas sem o selo "Rever". */
const MIN_RESPOSTAS_CONFIAVEL = 3
/** Erro na 1ª tentativa a partir do qual a questão (ou o texto que a ensina) merece revisão. */
const ERRO_REVER = 0.5
/** Tempo real acima de X vezes o estimado ganha aviso. */
const TEMPO_ACIMA = 1.5

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

function mediana(v: number[]): number | null {
  if (!v.length) return null
  const o = [...v].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

function media(v: number[]): number | null {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function comecou(p: ProgressoAdmin): boolean {
  return !!(p.iniciada_em || p.concluida_em || p.tentativas > 0 || p.tempo_segundos > 0)
}

type LinhaEtapa = {
  etapa: EtapaAdmin
  comecaram: number
  concluiram: number
  parados: number
  tempoMediano: number | null
  tentativas: number | null
  nota: number | null
}

type LinhaQuestao = {
  questao: QuestaoAdmin
  etapa: EtapaAdmin
  respostas: number
  erros: number
  taxa: number
  erradaMaisMarcada: { texto: string; vezes: number } | null
}

export function PainelTrilhaTab() {
  const { data: etapasTodas, isLoading: e1 } = useEtapasAdmin()
  const { data: progresso = [], isLoading: e2 } = useProgressoTodos()
  const { data: questoes = [], isLoading: e3 } = useQuestoesTodas()
  const { data: respostas = [], isLoading: e4 } = useRespostasTodas()
  const { data: professores = [] } = useProfessores()
  const [comTeste, setComTeste] = useState(false)

  const etapas = useMemo(() => (etapasTodas ?? []).filter(e => e.ativa), [etapasTodas])

  const contasTeste = useMemo(
    () => new Set(professores.filter(p => norm(p.nome ?? '').includes('teste')).map(p => p.id)),
    [professores],
  )
  const conta = (professorId: string) => comTeste || !contasTeste.has(professorId)
  const progressoVisivel = useMemo(
    () => progresso.filter(p => comTeste || !contasTeste.has(p.professor_id)),
    [progresso, contasTeste, comTeste],
  )
  const testesComDado = useMemo(
    () => new Set(progresso.filter(p => contasTeste.has(p.professor_id)).map(p => p.professor_id)).size,
    [progresso, contasTeste],
  )

  const porEtapa = useMemo<LinhaEtapa[]>(() => etapas.map(etapa => {
    const ps = progressoVisivel.filter(p => p.etapa_id === etapa.id && comecou(p))
    const feitas = ps.filter(p => p.concluida_em)
    const base = feitas.length ? feitas : ps
    return {
      etapa,
      comecaram: ps.length,
      concluiram: feitas.length,
      parados: ps.length - feitas.length,
      tempoMediano: mediana(base.map(p => p.tempo_segundos).filter(t => t > 0)),
      tentativas: media(feitas.map(p => p.tentativas).filter(t => t > 0)),
      nota: media(feitas.map(p => p.nota).filter((n): n is number => n != null)),
    }
  }), [etapas, progressoVisivel])

  const resumo = useMemo(() => {
    const obrigatorias = etapas.filter(e => e.obrigatoria).map(e => e.id)
    const porProf = new Map<string, ProgressoAdmin[]>()
    for (const p of progressoVisivel) {
      if (!comecou(p)) continue
      porProf.set(p.professor_id, [...(porProf.get(p.professor_id) ?? []), p])
    }
    let concluiram = 0
    for (const ps of porProf.values()) {
      const feitas = new Set(ps.filter(p => p.concluida_em).map(p => p.etapa_id))
      if (obrigatorias.length && obrigatorias.every(id => feitas.has(id))) concluiram++
    }
    const maisPara = [...porEtapa].sort((a, b) => b.parados - a.parados)[0]
    return {
      comecaram: porProf.size,
      concluiram,
      emAndamento: porProf.size - concluiram,
      maisPara: maisPara && maisPara.parados > 0 ? maisPara : null,
    }
  }, [etapas, progressoVisivel, porEtapa])

  const piores = useMemo<LinhaQuestao[]>(() => {
    const etapaDe = new Map(etapas.map(e => [e.id, e]))
    const primeiras = new Map<string, RespostaResumo[]>()
    for (const r of respostas) {
      if (r.tentativa !== 1 || r.correta == null || !conta(r.professor_id)) continue
      primeiras.set(r.questao_id, [...(primeiras.get(r.questao_id) ?? []), r])
    }
    const linhas: LinhaQuestao[] = []
    for (const q of questoes) {
      const etapa = etapaDe.get(q.etapa_id)
      const rs = primeiras.get(q.id)
      if (!etapa || !rs?.length || q.tipo === 'dissertativa') continue
      const erradas = rs.filter(r => r.correta === false)
      // Alternativa errada mais marcada: o que o professor ENTENDEU no lugar do certo.
      const cont = new Map<number, number>()
      for (const r of erradas) {
        for (const i of r.resposta?.opcoes ?? []) {
          if (!q.corretas.includes(i)) cont.set(i, (cont.get(i) ?? 0) + 1)
        }
      }
      const topo = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]
      linhas.push({
        questao: q, etapa,
        respostas: rs.length,
        erros: erradas.length,
        taxa: erradas.length / rs.length,
        erradaMaisMarcada: topo ? { texto: `${String.fromCharCode(65 + topo[0])} · ${q.opcoes[topo[0]] ?? ''}`, vezes: topo[1] } : null,
      })
    }
    return linhas
      .filter(l => l.erros > 0)
      .sort((a, b) => b.taxa - a.taxa || b.respostas - a.respostas)
      .slice(0, 12)
    // `conta` depende só de comTeste e contasTeste, que já estão nas deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respostas, questoes, etapas, comTeste, contasTeste])

  if (e1 || e2 || e3 || e4) {
    return <p className="py-16 text-center text-[13px] text-ink-muted">Carregando o painel…</p>
  }

  const maxComecaram = Math.max(1, ...porEtapa.map(l => l.comecaram))
  const semDados = resumo.comecaram === 0

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-ink-muted">
          Como o conteúdo da trilha está funcionando: onde os professores param, quanto tempo levam
          e quais questões mais derrubam. Serve para decidir o que reescrever.
        </p>
        <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-secondary">
          <input
            type="checkbox"
            checked={comTeste}
            onChange={e => setComTeste(e.target.checked)}
            className="h-3.5 w-3.5 accent-current"
          />
          Incluir contas de teste{testesComDado ? ` (${testesComDado})` : ''}
        </label>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line-soft bg-line-soft lg:grid-cols-4">
        <Numero icone={Users} rotulo="Começaram a trilha" valor={resumo.comecaram} />
        <Numero icone={CheckCircle2} rotulo="Concluíram tudo" valor={resumo.concluiram} />
        <Numero icone={Clock3} rotulo="Em andamento" valor={resumo.emAndamento} />
        <Numero
          icone={TriangleAlert}
          rotulo="Etapa que mais segura"
          valor={resumo.maisPara ? `Etapa ${resumo.maisPara.etapa.ordem}` : '—'}
          detalhe={resumo.maisPara ? `${resumo.maisPara.parados} parado${resumo.maisPara.parados > 1 ? 's' : ''} nela agora` : undefined}
        />
      </div>

      {semDados && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-aviso-infoBd bg-aviso-infoBg px-4 py-3">
          <CircleSlash className="mt-0.5 h-4 w-4 flex-shrink-0 text-aviso-infoFg" />
          <p className="text-[13px] leading-relaxed text-aviso-infoFg">
            Nenhum professor começou a trilha ainda{contasTeste.size && !comTeste ? ' (sem contar as contas de teste)' : ''}.
            O painel se preenche sozinho conforme as turmas avançam.
          </p>
        </div>
      )}

      {/* Etapa por etapa */}
      <Secao titulo="Etapa por etapa" dica="A barra cheia é quem concluiu; a clara, quem começou e ainda não terminou.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-line-soft text-left">
                <Th>Etapa</Th>
                <Th className="w-[34%]">Começaram → concluíram</Th>
                <Th>Tempo real (mediana)</Th>
                <Th className="text-right">Tentativas</Th>
                <Th className="text-right">Nota média</Th>
              </tr>
            </thead>
            <tbody>
              {porEtapa.map(l => {
                const acima = l.tempoMediano != null && l.etapa.minutos_estimados
                  && l.tempoMediano > l.etapa.minutos_estimados * 60 * TEMPO_ACIMA
                return (
                  <tr key={l.etapa.id} className="border-b border-line-soft last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[12px] tabular-nums text-ink-muted">{String(l.etapa.ordem).padStart(2, '0')}</span>
                        <span className="font-medium text-ink">{l.etapa.titulo}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <Funil comecaram={l.comecaram} concluiram={l.concluiram} max={maxComecaram} />
                    </td>
                    <td className="py-3 pr-4">
                      {l.tempoMediano == null ? (
                        <span className="text-ink-subtle">—</span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-2 tabular-nums">
                          <span className="text-ink">{fmtDuracao(l.tempoMediano)}</span>
                          {l.etapa.minutos_estimados && (
                            <span className="text-[12px] text-ink-muted">previsto {fmtDuracao(l.etapa.minutos_estimados * 60)}</span>
                          )}
                          {acima && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-aviso-warnBg px-2 py-0.5 text-[11px] font-medium text-aviso-warnFg">
                              <TriangleAlert className="h-3 w-3" /> acima do previsto
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-ink-secondary">
                      {l.tentativas == null ? '—' : l.tentativas.toFixed(1).replace('.', ',')}
                    </td>
                    <td className="py-3 text-right tabular-nums text-ink-secondary">
                      {l.nota == null ? '—' : `${Math.round(l.nota)}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Secao>

      {/* Questões */}
      <Secao
        titulo="Questões que mais derrubam"
        dica={`Erro na 1ª tentativa, antes de o professor ver a explicação. Com ${MIN_RESPOSTAS_CONFIAVEL} ou mais respostas e metade de erro, a questão ganha o selo “Rever”: ou o enunciado confunde, ou o texto da etapa não ensina aquilo.`}
      >
        {piores.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[13px] text-ink-muted">
            Nenhuma questão com erro na 1ª tentativa{semDados ? ' ainda' : ''}.
          </p>
        ) : (
          <ol className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line-soft bg-surface-canvas">
            {piores.map(l => {
              const rever = l.respostas >= MIN_RESPOSTAS_CONFIAVEL && l.taxa >= ERRO_REVER
              return (
                <li key={l.questao.id} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_14rem] sm:gap-6">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-surface-subtle px-1.5 py-0.5 text-[11px] font-medium text-ink-secondary">
                        Etapa {l.etapa.ordem} · Q{l.questao.ordem + 1}
                      </span>
                      {rever && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-aviso-warnBg px-2 py-0.5 text-[11px] font-medium text-aviso-warnFg">
                          <TriangleAlert className="h-3 w-3" /> Rever
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-[13px] leading-snug text-ink">{l.questao.enunciado}</p>
                    {l.erradaMaisMarcada && (
                      <p className="line-clamp-1 text-[12px] text-ink-muted">
                        Errada mais marcada ({l.erradaMaisMarcada.vezes}×): {l.erradaMaisMarcada.texto}
                      </p>
                    )}
                  </div>
                  <div className="self-center">
                    <div className="flex items-baseline justify-between text-[12px]">
                      <span className="font-semibold tabular-nums text-ink">{Math.round(l.taxa * 100)}% de erro</span>
                      <span className="tabular-nums text-ink-muted">{l.erros} de {l.respostas}</span>
                    </div>
                    <div
                      className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-subtle"
                      title={`${l.erros} de ${l.respostas} erraram na 1ª tentativa`}
                    >
                      <div
                        className={cn('h-full rounded-full', rever ? 'bg-aviso-warnFg' : 'bg-accentBlue')}
                        style={{ width: `${Math.max(4, l.taxa * 100)}%` }}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </Secao>
    </div>
  )
}

function Numero({
  icone: Icone, rotulo, valor, detalhe,
}: {
  icone: typeof Users
  rotulo: string
  valor: number | string
  detalhe?: string
}) {
  return (
    <div className="space-y-1 bg-surface-canvas px-5 py-4">
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-muted">
        <Icone className="h-3.5 w-3.5" /> {rotulo}
      </p>
      <p className="text-[1.6rem] font-semibold leading-none tracking-tight tabular-nums text-ink">{valor}</p>
      {detalhe && <p className="text-[11.5px] text-ink-muted">{detalhe}</p>}
    </div>
  )
}

function Secao({ titulo, dica, children }: { titulo: string; dica: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{titulo}</h2>
        <p className="mt-0.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-muted">{dica}</p>
      </div>
      {children}
    </section>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('pb-2 pr-4 text-[11px] font-semibold uppercase tracking-label text-ink-muted', className)}>
      {children}
    </th>
  )
}

/** Barra de funil de uma etapa, na escala da etapa com mais gente. */
function Funil({ comecaram, concluiram, max }: { comecaram: number; concluiram: number; max: number }) {
  if (comecaram === 0) return <span className="text-ink-subtle">ninguém começou</span>
  const wC = (comecaram / max) * 100
  const wF = (concluiram / max) * 100
  return (
    <div className="flex items-center gap-3" title={`${concluiram} de ${comecaram} concluíram`}>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-surface-subtle">
        <div className="absolute inset-y-0 left-0 rounded-full bg-aviso-infoBg" style={{ width: `${wC}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-accentBlue" style={{ width: `${wF}%` }} />
      </div>
      <span className="w-16 flex-shrink-0 text-right text-[12px] tabular-nums text-ink-secondary">
        {concluiram} / {comecaram}
      </span>
    </div>
  )
}
