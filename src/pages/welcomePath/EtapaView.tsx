import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, CheckCircle2, Info, NotebookPen, Clock3, CalendarClock, Repeat2, LifeBuoy,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { dataBR, fmtDuracao } from '@/lib/formato'
import { BotaoWhatsApp } from '@/components/portal/PortalUI'
import {
  useEtapa, useIniciarEtapa, useRegistrarTempo, useResponderEtapa, useSalvarObservacao,
  type RespostaEnviada, type ResultadoEnvio, type QuestaoEtapa, type MinhaResposta,
} from '@/hooks/useWelcomePath'
import { BlocoView } from './Blocos'
import { QuestaoView, PainelResultado, BotoesQuiz } from './Quiz'
import { useQuizEtapa } from './useQuizEtapa'

// ─────────────────────────────────────────────────────────────────────────────
// Uma etapa da trilha, na linguagem editorial/control-room dos painéis do KTM:
// faixa-herói no topo (ordinal grande, progresso da trilha), e abaixo duas
// colunas — o conteúdo em zonas (filete + overline, sem card-in-card) e um trilho
// fixo com as anotações do professor sempre à mão enquanto ele lê.
// ─────────────────────────────────────────────────────────────────────────────

/** De quanto em quanto tempo o tempo de estudo é reportado ao servidor. Bater
 *  de tempos em tempos (em vez de medir só na hora do envio) é o que faz o
 *  número sobreviver a fechar a aba no meio — e a Edge Function limita o delta
 *  aceito por chamada, então uma aba esquecida aberta não infla o total. */
const BATIDA_SEGUNDOS = 30

// Constantes, e não `?? []` na chamada: um literal novo a cada render faria o
// useQuizEtapa achar que as respostas mudaram e ressincronizar o estado em
// loop ("Too many re-renders").
const SEM_QUESTOES: QuestaoEtapa[] = []
const SEM_RESPOSTAS: MinhaResposta[] = []

function useBatidaDeTempo(token: string, etapaId: string) {
  // `mutate` do TanStack Query é estável entre renders, então serve de dep do
  // effect sem reinstalar o intervalo a cada render.
  const { mutate } = useRegistrarTempo()

  useEffect(() => {
    const id = setInterval(() => {
      // Aba em segundo plano não conta como tempo de estudo.
      if (document.visibilityState !== 'visible') return
      mutate({ token, etapaId, segundos: BATIDA_SEGUNDOS })
    }, BATIDA_SEGUNDOS * 1000)
    return () => clearInterval(id)
  }, [mutate, token, etapaId])
}

/** Barra fina de progresso de leitura, colada no topo da viewport. Cresce
 *  conforme a rolagem da página — via `transform: scaleX` (GPU), sem tocar o
 *  layout — dando ao professor uma noção do quanto falta da etapa. */
function BarraLeitura() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    function medir() {
      const el = document.documentElement
      const max = el.scrollHeight - el.clientHeight
      const p = max > 0 ? Math.min(1, el.scrollTop / max) : 0
      if (ref.current) ref.current.style.transform = `scaleX(${p})`
    }
    function agendar() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(medir)
    }
    medir()
    window.addEventListener('scroll', agendar, { passive: true })
    window.addEventListener('resize', agendar, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', agendar)
      window.removeEventListener('resize', agendar)
    }
  }, [])
  return (
    <div aria-hidden className="fixed inset-x-0 top-0 z-30 h-0.5">
      <div ref={ref} className="h-full origin-left bg-brand" style={{ transform: 'scaleX(0)' }} />
    </div>
  )
}

/** Anel de progresso da trilha inteira, para orientar o professor de dentro de
 *  uma etapa. Desenha uma vez ao montar (raro, então cabe o carinho). */
function AnelTrilha({ pct }: { pct: number }) {
  const size = 60
  const stroke = 6
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const [montado, setMontado] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMontado(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-soft)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent-blue)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={montado ? c * (1 - pct / 100) : c}
          className="[transition:stroke-dashoffset_700ms_cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular-nums text-ink">
        {pct}%
      </span>
    </div>
  )
}

/** Seção temática: overline + filete, agrupando o conteúdo sem empilhar caixas. */
function Zona({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="label-micro whitespace-nowrap text-ink-secondary">{rotulo}</h2>
        <span aria-hidden className="h-px flex-1 bg-line-soft" />
      </div>
      {children}
    </section>
  )
}

function MetaChip({ icone: Icone, children }: { icone: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-subtle px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary">
      <Icone className="h-3.5 w-3.5 text-ink-muted" /> {children}
    </span>
  )
}

function ObservacaoPessoal({
  token, etapaId, inicial,
}: {
  token: string; etapaId: string; inicial: string
}) {
  const salvar = useSalvarObservacao()
  const [texto, setTexto] = useState(inicial)
  const [salvo, setSalvo] = useState(inicial)

  // Reflete o que o servidor devolveu quando o valor muda por fora.
  const [anterior, setAnterior] = useState(inicial)
  if (inicial !== anterior) {
    setAnterior(inicial)
    setTexto(inicial)
    setSalvo(inicial)
  }

  function gravar() {
    if (texto === salvo) return
    salvar.mutate({ token, etapaId, texto }, {
      onSuccess: () => { setSalvo(texto); toast.success('Anotação salva') },
      onError:   () => toast.error('Não foi possível salvar sua anotação.'),
    })
  }

  return (
    <div className="rounded-2xl border border-line-soft bg-surface-canvas px-5 py-5">
      <div className="mb-3 flex items-center gap-2">
        <NotebookPen className="h-4 w-4 text-ink-muted" />
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Suas anotações</h2>
      </div>
      <p className="mb-2.5 text-[12.5px] leading-relaxed text-ink-muted">
        Só você e a coordenação veem. Anote dúvidas para levar à próxima reunião.
      </p>
      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onBlur={gravar}
        rows={4}
        placeholder="Escreva aqui…"
        className="w-full resize-y rounded-xl border border-line-soft bg-surface-subtle px-3 py-2
                   text-[13px] text-ink placeholder:text-ink-subtle transition-colors
                   focus:outline-none focus:border-accentBlue focus:ring-2 focus:ring-accentBlue-soft"
      />
      {texto !== salvo && (
        <p className="mt-1.5 text-[11.5px] text-ink-muted">
          {salvar.isPending ? 'Salvando…' : 'Salvo ao sair do campo.'}
        </p>
      )}
    </div>
  )
}

export function EtapaView({
  token, etapaId, onVoltar, totalEtapas, etapasConcluidas,
}: {
  token: string
  etapaId: string
  onVoltar: () => void
  totalEtapas: number
  etapasConcluidas: number
}) {
  const { data, isLoading, error } = useEtapa(token, etapaId)
  const iniciar  = useIniciarEtapa()
  const responder = useResponderEtapa()
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)

  useBatidaDeTempo(token, etapaId)

  // Marca a etapa como iniciada uma única vez por montagem.
  const iniciouRef = useRef(false)
  useEffect(() => {
    if (iniciouRef.current || !data) return
    iniciouRef.current = true
    iniciar.mutate({ token, etapaId })
    // `iniciar` é estável o suficiente (useMutation) e a guarda por ref garante
    // uma chamada só — incluí-lo nas deps só provocaria re-execução à toa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, token, etapaId])

  async function enviarRespostas(respostas: RespostaEnviada[]): Promise<ResultadoEnvio | null> {
    setErroEnvio(null)
    try {
      return await responder.mutateAsync({ token, etapaId, respostas })
    } catch (e) {
      setErroEnvio(e instanceof Error ? e.message : 'Não foi possível enviar agora.')
      return null
    }
  }

  const quiz = useQuizEtapa({
    questoes: data?.questoes ?? SEM_QUESTOES,
    minhasRespostas: data?.minhasRespostas ?? SEM_RESPOSTAS,
    concluida: !!data?.progresso.concluidaEm,
    revisaoPendente: !!data?.progresso.revisaoPendente,
    onEnviar: enviarRespostas,
  })

  if (isLoading) {
    return <p className="py-16 text-center text-[13px] text-ink-muted">Carregando etapa…</p>
  }

  if (error || !data) {
    return (
      <div className="w-full max-w-md space-y-5 py-12 text-center">
        <p className="text-[14px] text-ink">
          {error instanceof Error ? error.message : 'Não foi possível abrir esta etapa.'}
        </p>
        <button
          onClick={onVoltar}
          className="btn-press h-10 rounded-full bg-ink px-5 text-[13px] font-medium text-ink-inverse hover:bg-ink/90"
        >
          Voltar para a trilha
        </button>
      </div>
    )
  }

  const { etapa, blocos, questoes, progresso } = data
  const concluida = !!progresso.concluidaEm
  const pctTrilha = totalEtapas > 0 ? Math.round((etapasConcluidas / totalEtapas) * 100) : 0
  const vazia = blocos.length === 0 && questoes.length === 0

  // Questões ancoradas a um bloco aparecem logo depois dele; as soltas, no fim.
  // A numeração segue a ordem global, para o professor não ver "1, 1, 2".
  const numeroDe = new Map(questoes.map((q, i) => [q.id, i + 1]))
  const porBloco = new Map<string, typeof questoes>()
  const soltas: typeof questoes = []
  for (const q of questoes) {
    if (q.bloco_id) {
      porBloco.set(q.bloco_id, [...(porBloco.get(q.bloco_id) ?? []), q])
    } else {
      soltas.push(q)
    }
  }

  function renderQuestao(q: (typeof questoes)[number]) {
    return (
      <QuestaoView
        key={q.id}
        questao={q}
        numero={numeroDe.get(q.id) ?? 0}
        selecao={quiz.valorDe(q.id)}
        veredito={quiz.vereditoDe(q.id)}
        travada={quiz.travada}
        onChange={v => quiz.definir(q.id, v)}
      />
    )
  }

  return (
    <div className="w-full max-w-5xl animate-fade-up">
      <BarraLeitura />

      <button
        type="button"
        onClick={onVoltar}
        className="btn-press flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-ink-secondary"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar para a trilha
      </button>

      {/* Faixa-herói: ordinal grande + contexto + progresso da trilha */}
      <header className="relative mt-4 overflow-hidden rounded-3xl border border-line-soft bg-surface-canvas px-5 py-5 shadow-card sm:px-7 sm:py-6">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(120% 120% at 0% 0%, var(--brand-red-soft), transparent 42%)' }}
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-4 sm:gap-5">
            <span className="font-mono text-[2.5rem] font-medium leading-none tracking-tight tabular-nums text-brand/85 sm:text-[3rem]">
              {String(etapa.ordem).padStart(2, '0')}
            </span>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="label-micro flex items-center gap-1.5 text-accentBlue">
                  <span className="h-1.5 w-1.5 rounded-full bg-accentBlue" />
                  Welcome Path · Etapa {etapa.ordem} de {totalEtapas}
                </span>
                {concluida && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-urg-lowBg px-2 py-0.5 text-[10.5px] font-medium text-urg-lowFg">
                    <CheckCircle2 className="h-3 w-3" /> Concluída
                  </span>
                )}
                {progresso.revisaoPendente && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-urg-medBg px-2 py-0.5 text-[10.5px] font-medium text-urg-medFg">
                    <Clock3 className="h-3 w-3" /> Em revisão
                  </span>
                )}
              </div>
              <h1 className="text-[1.5rem] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[1.75rem]">
                {etapa.titulo}
              </h1>
              {etapa.descricao && (
                <p className="max-w-prose text-[14px] leading-relaxed text-ink-muted">{etapa.descricao}</p>
              )}
              {(etapa.prazoEm || progresso.tempoSegundos > 0 || progresso.tentativas > 0) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {etapa.prazoEm && <MetaChip icone={CalendarClock}>Prazo {dataBR(etapa.prazoEm)}</MetaChip>}
                  {progresso.tempoSegundos > 0 && (
                    <MetaChip icone={Clock3}>{fmtDuracao(progresso.tempoSegundos)} nesta etapa</MetaChip>
                  )}
                  {progresso.tentativas > 0 && (
                    <MetaChip icone={Repeat2}>
                      {progresso.tentativas === 1 ? '1 tentativa' : `${progresso.tentativas} tentativas`}
                    </MetaChip>
                  )}
                </div>
              )}
            </div>
          </div>

          {totalEtapas > 0 && (
            <div className="flex items-center gap-3.5 self-start rounded-2xl border border-line-soft bg-surface-subtle/60 px-4 py-3 lg:self-center">
              <AnelTrilha pct={pctTrilha} />
              <div className="space-y-0.5">
                <p className="text-[13px] font-semibold text-ink">{etapasConcluidas} de {totalEtapas} etapas</p>
                <p className="text-[11.5px] text-ink-muted">concluídas na trilha</p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Conteúdo (amplo) + trilho fixo com anotações */}
      <div className="mt-6 grid items-start gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
        <main className="space-y-8">
          {etapa.notasCoordenacao && (
            <div className="flex gap-2.5 rounded-2xl border border-accentBlue/20 bg-accentBlue-soft/50 px-4 py-3.5">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accentBlue" />
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-label text-accentBlue">
                  Recado da coordenação
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-secondary">
                  {etapa.notasCoordenacao}
                </p>
              </div>
            </div>
          )}

          {vazia ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
              <p className="text-[13px] leading-relaxed text-ink-muted">
                Esta etapa ainda não tem conteúdo publicado. A coordenação está preparando — volte em breve.
              </p>
            </div>
          ) : (
            <>
              <Zona rotulo="Conteúdo da etapa">
                <div className="space-y-7">
                  {blocos.map(bloco => (
                    <div key={bloco.id} className="space-y-4">
                      <BlocoView bloco={bloco} />
                      {(porBloco.get(bloco.id) ?? []).map(renderQuestao)}
                    </div>
                  ))}
                  {blocos.length === 0 && (
                    <p className="text-[13px] text-ink-muted">Esta etapa é só de atividade — responda abaixo.</p>
                  )}
                </div>
              </Zona>

              {questoes.length > 0 && (
                <Zona rotulo="Atividade da etapa">
                  <div className="space-y-4">
                    <p className="-mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                      {concluida
                        ? 'Você já concluiu esta etapa. Suas respostas ficam aqui para consulta.'
                        : `Acerte ao menos ${etapa.notaMinima}% para liberar a próxima etapa.`}
                    </p>

                    {soltas.map(renderQuestao)}

                    {quiz.envio && <PainelResultado envio={quiz.envio} />}

                    {erroEnvio && (
                      <div className="rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5 text-[12.5px] font-medium text-brand-strong">
                        {erroEnvio}
                      </div>
                    )}

                    <BotoesQuiz quiz={quiz} enviando={responder.isPending} />
                  </div>
                </Zona>
              )}
            </>
          )}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <ObservacaoPessoal token={token} etapaId={etapaId} inicial={progresso.observacao} />

          <div className="space-y-3 rounded-2xl border border-line-soft bg-surface-canvas px-5 py-4">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-ink-muted" />
              <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">Precisa de ajuda?</h2>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-muted">
              Travou em algo ou tem uma dúvida? A coordenação responde rápido.
            </p>
            <BotaoWhatsApp>Falar com a coordenação</BotaoWhatsApp>
          </div>
        </aside>
      </div>
    </div>
  )
}
