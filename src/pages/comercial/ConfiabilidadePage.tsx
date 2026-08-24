import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, X, ShieldCheck, ShieldAlert, ShieldQuestion, Plus, Star,
  CalendarClock, Info, CircleCheck, TriangleAlert, OctagonAlert,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { NovoIncidenteDialog } from '@/components/incidentes/NovoIncidenteDialog'
import { useProfessoresBusca, useConfiabilidadeProfessor, type ProfessorBusca } from '@/hooks/useConfiabilidade'
import { RankingProfessores } from '@/pages/comercial/RankingProfessores'
import { useNomesPorPerfilId } from '@/hooks/usePerfisPublicos'
import { useAuth } from '@/contexts/AuthContext'
import { canAddInfo } from '@/lib/permissions'
import { scoreVisual } from '@/lib/score'
import { dataBR } from '@/lib/formato'
import { JANELA_DIAS, VEREDITO_META, AVALIACOES_MINIMAS, type Sinal, type Tom } from '@/lib/confiabilidade'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Tela do setor Comercial: "esse teacher é confiável?".
//
// Uma pergunta, uma resposta: busca o professor e devolve o veredito dos últimos
// 90 dias, com os sinais que o produziram abertos na tela (nada de nota mágica).
// O botão de registrar incidente fica no topo porque o comercial costuma chegar
// aqui JUSTAMENTE depois de ouvir uma reclamação do aluno.
// ─────────────────────────────────────────────────────────────────────────────

const URG_DOT: Record<string, string> = {
  Baixa: 'bg-urg-lowFg', Média: 'bg-urg-medFg', Alta: 'bg-urg-highFg',
  Crítico: 'bg-urg-critFg', Crítica: 'bg-urg-critFg',
}

const TOM_ICON: Record<Tom, typeof CircleCheck> = {
  ok: CircleCheck,
  warn: TriangleAlert,
  crit: OctagonAlert,
}

const TOM_CLS: Record<Tom, string> = {
  ok: 'text-urg-lowFg',
  warn: 'text-urg-medFg',
  crit: 'text-urg-highFg',
}

const VEREDITO_ICON = {
  confiavel: ShieldCheck,
  atencao: ShieldQuestion,
  risco: ShieldAlert,
} as const

export function ConfiabilidadePage() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const professorId = params.get('professor')

  const { data: professores = [], isLoading: carregandoLista } = useProfessoresBusca()
  const { data, isLoading, error } = useConfiabilidadeProfessor(professorId)
  const { mapa: nomesPorId } = useNomesPorPerfilId()

  const [busca, setBusca] = useState('')
  const [abrirIncidente, setAbrirIncidente] = useState(false)

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (termo.length < 2) return []
    return professores
      .filter(p => p.nome.toLowerCase().includes(termo) || (p.email ?? '').toLowerCase().includes(termo))
      .slice(0, 8)
  }, [busca, professores])

  function selecionar(p: ProfessorBusca) {
    setParams({ professor: p.id })
    setBusca('') // fecha a lista de resultados e deixa a caixa pronta pra próxima consulta
  }

  function limpar() {
    setParams({})
    setBusca('')
  }

  const podeRegistrar = canAddInfo(profile)

  return (
    <div className="px-6 py-6 max-w-[1200px] mx-auto">
      <header className="space-y-0.5 mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Esse teacher é confiável?</h1>
        <p className="text-[13px] text-ink-muted">
          Consulta do comercial — histórico dos últimos {JANELA_DIAS} dias: incidentes, desafios e alertas do professor.
        </p>
      </header>

      {/* ── Busca ── */}
      <div className="relative mb-5">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
          <Input
            autoFocus
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder={carregandoLista ? 'Carregando professores…' : 'Buscar professor por nome ou e-mail…'}
            className="pl-10 h-11 text-[14px] bg-surface-canvas border-line"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {resultados.length > 0 && (
          <ul className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-line bg-surface-canvas shadow-popover">
            {resultados.map(p => (
              <li key={p.id}>
                <button
                  onClick={() => selecionar(p)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-subtle"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] text-ink">{p.nome}</span>
                    {p.email && <span className="block truncate text-[11.5px] text-ink-subtle">{p.email}</span>}
                  </span>
                  <span className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                    p.status === 'ativo' ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-surface-muted text-ink-muted',
                  )}>
                    {p.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {busca.trim().length >= 2 && resultados.length === 0 && (
          <p className="mt-2 text-[12px] text-ink-muted">Nenhum professor encontrado com esse termo.</p>
        )}
      </div>

      {!professorId && <RankingProfessores onSelecionar={id => setParams({ professor: id })} />}

      {professorId && isLoading && (
        <div className="flex h-64 items-center justify-center text-[13px] text-ink-muted">Carregando…</div>
      )}

      {professorId && error && (
        <div className="rounded-xl border border-line bg-surface-canvas px-4 py-3 text-[13px] text-urg-highFg">
          Não foi possível carregar este professor. {error instanceof Error ? error.message : ''}
        </div>
      )}

      {professorId && data && (() => {
        const { professor, diagnostico, incidentesJanela, incidentesAnteriores, avaliacao } = data
        const meta = VEREDITO_META[diagnostico.veredito]
        const Icone = VEREDITO_ICON[diagnostico.veredito]
        const score = scoreVisual(data.scoreAtual)
        const coordenador = professor.coordenador_id ? nomesPorId.get(professor.coordenador_id) : null
        const relevantes = incidentesJanela.filter(i => !i.plataforma)
        const abertos = relevantes.filter(i => !i.resolved && i.natureza === 'desafio').length

        return (
          <div className="space-y-11 animate-fade-up">
            {/* ══ VEREDITO ══ */}
            <section className="space-y-2.5">
              <div className="relative overflow-hidden rounded-2xl ring-1 ring-line-soft shadow-card">
                <span className={cn('absolute left-0 top-0 z-10 h-full w-[3px]', meta.barraClass)} />
                <div className="bg-surface-canvas px-6 py-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-[22px] font-semibold tracking-tight text-ink">{professor.nome}</h2>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-medium',
                          professor.status === 'ativo' ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-surface-muted text-ink-muted',
                        )}>
                          {professor.status}
                        </span>
                        <button onClick={limpar} className="text-[11.5px] text-ink-muted underline underline-offset-2 hover:text-ink">
                          trocar professor
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
                        {professor.grupo_nome && <span>Grupo {professor.grupo_nome}</span>}
                        {coordenador && <span>· Coordenação {coordenador}</span>}
                        {professor.tempo_na_king && <span>· {professor.tempo_na_king} de casa</span>}
                        {professor.data_inicio && <span>· desde {dataBR(professor.data_inicio)}</span>}
                        {(professor.cidade || professor.estado) && (
                          <span>· {[professor.cidade, professor.estado].filter(Boolean).join('/')}</span>
                        )}
                      </div>
                    </div>

                    {podeRegistrar && (
                      <Button
                        onClick={() => setAbrirIncidente(true)}
                        className="btn-press gap-1.5 bg-brand text-white hover:bg-brand-strong shrink-0"
                      >
                        <Plus className="h-4 w-4" /> Registrar incidente
                      </Button>
                    )}
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-5">
                    <div className="flex items-center gap-3.5">
                      <Icone className={cn('h-11 w-11 shrink-0', meta.textoClass)} strokeWidth={1.6} />
                      <div>
                        <p className={cn('text-[30px] font-semibold leading-none tracking-tight', meta.textoClass)}>
                          {meta.titulo}
                        </p>
                        <p className="mt-1.5 text-[12.5px] text-ink-secondary">{meta.resumo}</p>
                      </div>
                    </div>
                    <span className="hidden h-11 w-px bg-line-soft sm:block" />
                    <p className="text-[11.5px] text-ink-subtle max-w-sm leading-relaxed">
                      Veredito calculado sobre {JANELA_DIAS} dias de histórico —
                      {' '}{diagnostico.alertas.length} sinal{diagnostico.alertas.length === 1 ? '' : 'is'} de atenção,
                      {' '}{diagnostico.pontos} ponto{diagnostico.pontos === 1 ? '' : 's'} de risco.
                      Chamados de TI (bugs e melhorias) não entram na conta.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ══ NÚMEROS DA JANELA ══ */}
            <section className="space-y-4">
              <Zone label={`Últimos ${JANELA_DIAS} dias`} meta="tudo aqui é do período — exceto onde marcado" />
              <Metrics items={[
                { label: 'Incidentes no período', value: relevantes.length, tone: relevantes.length > 0 ? 'warn' : undefined },
                { label: 'Chamados sem solução', value: abertos, tone: abertos > 0 ? 'warn' : undefined },
                { label: 'Ocorrências com aluno', value: relevantes.filter(i => !!i.aluno_nome?.trim()).length },
                { label: 'Informes', value: relevantes.filter(i => i.natureza === 'informe').length },
                { label: 'Aulas pendentes', value: data.aulasPendentes, hoje: true, tone: data.aulasPendentes >= 3 ? 'warn' : undefined },
                { label: 'Score do King', value: score.label, hoje: true, sub: score.faixaLabel },
              ]} />
              {incidentesAnteriores > 0 && (
                <p className="text-[11.5px] text-ink-subtle">
                  Fora da janela, este professor tem mais {incidentesAnteriores} incidente{incidentesAnteriores === 1 ? '' : 's'} no
                  histórico completo — não contam para o veredito.
                </p>
              )}
            </section>

            {/* ══ POR QUE ESSE VEREDITO ══ */}
            <section className="space-y-4">
              <Zone label="Por que esse veredito" meta={`${diagnostico.pontos} ponto(s) de risco`} />
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card-surface p-5 space-y-3.5">
                  <SectionHead
                    title="Sinais de atenção"
                    hint="cada linha soma pontos; quanto maior o peso, mais grave"
                  />
                  {diagnostico.alertas.length === 0 ? (
                    <p className="text-[13px] text-ink-muted">Nenhum sinal de atenção no período.</p>
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {diagnostico.alertas.map(s => <SinalLinha key={s.chave} sinal={s} mostrarPeso />)}
                    </ul>
                  )}
                </div>

                <div className="card-surface p-5 space-y-3.5">
                  <SectionHead title="O que está em ordem" hint="não somam pontos — explicam a leitura" />
                  {diagnostico.positivos.length === 0 ? (
                    <p className="text-[13px] text-ink-muted">Nada em ordem para destacar no período.</p>
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {diagnostico.positivos.map(s => <SinalLinha key={s.chave} sinal={s} />)}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            {/* ══ HISTÓRICO ══ */}
            <section className="space-y-4">
              <Zone label="Incidentes e desafios" meta={`${incidentesJanela.length} no período`} />
              <div className="card-surface p-5 space-y-3.5">
                <SectionHead
                  title="Registros do período"
                  hint="do mais recente para o mais antigo · categorias restritas à coordenação não aparecem aqui"
                />
                {incidentesJanela.length === 0 ? (
                  <p className="text-[13px] text-ink-muted">
                    Nenhum incidente registrado nos últimos {JANELA_DIAS} dias.
                  </p>
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {incidentesJanela.map(i => (
                      <li key={i.id} className="flex items-start gap-3 py-2.5">
                        <span
                          className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', URG_DOT[i.urgency] ?? 'bg-ink-subtle')}
                          title={`Urgência: ${i.urgency}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                            <span className="font-medium text-ink">{i.problem_type}</span>
                            {i.aluno_nome && <span className="text-ink-muted">· aluno {i.aluno_nome}</span>}
                            <span className="text-ink-subtle">· {dataBR(i.created_at)}</span>
                            <span className={cn(
                              'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                              i.resolved ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-urg-medBg text-urg-medFg',
                            )}>
                              {i.resolved ? 'Resolvido' : 'Em aberto'}
                            </span>
                            {i.natureza === 'informe' && (
                              <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                                Informe
                              </span>
                            )}
                            {i.plataforma && (
                              <span
                                title="Chamado de TI sobre a plataforma — não conta como falha do professor."
                                className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-muted"
                              >
                                TI · não conta
                              </span>
                            )}
                          </div>
                          {i.description && (
                            <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-secondary">{i.description}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* ══ CONTEXTO DO KING ══ */}
            <section className="space-y-4">
              <Zone
                label="Contexto do King"
                meta={data.apiAtualizadoEm ? `sincronizado em ${dataBR(data.apiAtualizadoEm)}` : 'sem sincronização'}
              />
              {data.semDadosDoKing ? (
                <div className="flex items-start gap-2 rounded-lg border border-line-soft bg-surface-subtle/50 px-3.5 py-2.5">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                  <p className="text-[12px] text-ink-secondary">
                    Este professor não tem dados de acompanhamento vindos do King. O veredito acima usou só
                    os incidentes registrados aqui — trate-o como incompleto.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="card-surface p-5 space-y-3">
                    <SectionHead title="Avaliação dos alunos" hint="retrato de hoje" />
                    <div className="flex items-end gap-2">
                      <Star className="mb-1 h-4 w-4 text-urg-medFg" fill="currentColor" />
                      <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-ink">
                        {avaliacao.media != null ? avaliacao.media.toFixed(1).replace('.', ',') : '—'}
                      </p>
                      <p className="mb-1 text-[12px] text-ink-muted tabular-nums">
                        {avaliacao.total} avaliaç{avaliacao.total === 1 ? 'ão' : 'ões'}
                      </p>
                    </div>
                    <p className="text-[11.5px] leading-relaxed text-ink-subtle">
                      {avaliacao.total < AVALIACOES_MINIMAS
                        ? `Menos de ${AVALIACOES_MINIMAS} avaliações — volume baixo demais para tirar conclusão.`
                        : 'Quase todo professor da King fica acima de 4,8 — a estrela não separa bom de ruim, por isso não entra no veredito.'}
                    </p>
                    {avaliacao.comentariosNegativos > 0 && (
                      <p className="text-[12px] text-urg-medFg">
                        {avaliacao.comentariosNegativos} comentário(s) negativo(s) de aluno
                      </p>
                    )}
                  </div>

                  <div className="card-surface p-5 space-y-3">
                    <SectionHead title="Acompanhamento da coordenação" hint="retrato de hoje" />
                    <dl className="space-y-2 text-[12.5px]">
                      <Linha rotulo="Última reunião" valor={data.reuniaoUltima ? dataBR(data.reuniaoUltima) : '—'} />
                      <Linha rotulo="Status da reunião" valor={data.reuniaoStatus ?? '—'} />
                      <Linha rotulo="Aulas pendentes" valor={String(data.aulasPendentes)} alerta={data.aulasPendentes >= 3} />
                      <Linha rotulo="Agenda" valor={data.agendaBloqueada ? 'Bloqueada' : 'Livre'} alerta={data.agendaBloqueada} />
                    </dl>
                  </div>

                  <div className="card-surface p-5 space-y-3">
                    <SectionHead title="Perfil de alocação" hint="o que o King recomenda" />
                    <dl className="space-y-2 text-[12.5px]">
                      <Linha rotulo="Score" valor={score.label} />
                      <Linha rotulo="Faixa" valor={data.scoreFaixa ?? score.faixaLabel} />
                      <Linha rotulo="Nível recomendado" valor={professor.nivel_recomendado_alunos ?? '—'} />
                      <Linha rotulo="E-mail" valor={professor.email ?? '—'} />
                    </dl>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-line-soft bg-surface-subtle/50 px-3.5 py-2.5">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                <p className="text-[12px] text-ink-secondary">
                  Score, aulas pendentes, agenda e avaliação são o retrato de hoje — o King não guarda histórico
                  diário desses números. Incidentes, faltas, no-show e trocas de professor respeitam a janela
                  de {JANELA_DIAS} dias.
                </p>
              </div>
            </section>
          </div>
        )
      })()}

      {data && (
        <NovoIncidenteDialog
          open={abrirIncidente}
          onOpenChange={setAbrirIncidente}
          professorFixo={{ id: data.professor.id, nome: data.professor.nome }}
        />
      )}
    </div>
  )
}

// ─── Peças ───────────────────────────────────────────────────────────────────

function SinalLinha({ sinal, mostrarPeso }: { sinal: Sinal; mostrarPeso?: boolean }) {
  const Icone = TOM_ICON[sinal.tom]
  return (
    <li className="flex items-start gap-2.5 py-2.5">
      <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', TOM_CLS[sinal.tom])} strokeWidth={1.8} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink">{sinal.titulo}</p>
        {sinal.detalhe && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{sinal.detalhe}</p>}
      </div>
      {mostrarPeso && (
        <span
          title="Pontos que este sinal soma no veredito"
          className="shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-secondary"
        >
          +{sinal.peso}
        </span>
      )}
    </li>
  )
}

function Linha({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line-soft pb-2 last:border-0 last:pb-0">
      <dt className="text-ink-muted">{rotulo}</dt>
      <dd className={cn('truncate text-right', alerta ? 'font-medium text-urg-highFg' : 'text-ink')} title={valor}>
        {valor}
      </dd>
    </div>
  )
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <h3 className="text-[14px] font-semibold tracking-tight text-ink">{title}</h3>
      {hint && <p className="text-[11.5px] text-ink-muted">{hint}</p>}
    </div>
  )
}

function Zone({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{label}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
      {meta && <span className="whitespace-nowrap text-[11.5px] text-ink-subtle">{meta}</span>}
    </div>
  )
}

interface Metric { label: string; value: ReactNode; sub?: string; tone?: 'warn'; hoje?: boolean }

function Metrics({ items }: { items: Metric[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line-soft ring-1 ring-line-soft sm:grid-cols-3 lg:grid-cols-6">
      {items.map((m, i) => (
        <div key={i} className="space-y-1.5 bg-surface-canvas px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="truncate" title={m.label}>{m.label}</span>
            {m.hoje && (
              <span
                title="Retrato de hoje — o King não guarda histórico diário deste número."
                className="rounded-[4px] bg-surface-muted px-1 py-px text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-muted"
              >
                hoje
              </span>
            )}
          </p>
          <p className={cn('text-[22px] font-semibold leading-none tabular-nums', m.tone === 'warn' ? 'text-urg-highFg' : 'text-ink')}>
            {m.value}
          </p>
          {m.sub && <p className="truncate text-[11px] text-ink-subtle" title={m.sub}>{m.sub}</p>}
        </div>
      ))}
    </div>
  )
}
