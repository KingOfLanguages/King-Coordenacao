import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Info, NotebookPen, Clock3 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { dataBR, fmtDuracao } from '@/lib/formato'
import {
  useEtapa, useIniciarEtapa, useRegistrarTempo, useResponderEtapa, useSalvarObservacao,
  type RespostaEnviada, type ResultadoEnvio, type QuestaoEtapa, type MinhaResposta,
} from '@/hooks/useWelcomePath'
import { BlocoView } from './Blocos'
import { QuestaoView, PainelResultado, BotoesQuiz } from './Quiz'
import { useQuizEtapa } from './useQuizEtapa'

// ─────────────────────────────────────────────────────────────────────────────
// Uma etapa da trilha: conteúdo em blocos, atividades (intercaladas quando a
// questão está ancorada a um bloco) e a anotação pessoal do professor.
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

function Cartao({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-line-soft bg-surface-canvas px-5 py-5', className)}>
      {children}
    </div>
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
    <Cartao>
      <div className="mb-3 flex items-center gap-2">
        <NotebookPen className="h-4 w-4 text-ink-muted" />
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Suas anotações</h2>
      </div>
      <p className="mb-2.5 text-[12.5px] text-ink-muted">
        Só você e a coordenação veem. Use para dúvidas que quer levar para a próxima reunião.
      </p>
      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onBlur={gravar}
        rows={3}
        placeholder="Escreva aqui…"
        className="w-full resize-y rounded-xl border border-line-soft bg-surface-subtle px-3 py-2
                   text-[13px] text-ink placeholder:text-ink-subtle transition-colors
                   focus:outline-none focus:border-accentBlue focus:ring-2 focus:ring-accentBlue-soft"
      />
      {texto !== salvo && (
        <p className="mt-1.5 text-[11.5px] text-ink-muted">
          {salvar.isPending ? 'Salvando…' : 'Suas mudanças são salvas ao sair do campo.'}
        </p>
      )}
    </Cartao>
  )
}

export function EtapaView({
  token, etapaId, onVoltar,
}: {
  token: string
  etapaId: string
  onVoltar: () => void
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
    <div className="w-full max-w-2xl space-y-6 animate-fade-up">
      <button
        type="button"
        onClick={onVoltar}
        className="btn-press flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-ink-secondary"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar para a trilha
      </button>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-micro text-accentBlue">Etapa {etapa.ordem}</span>
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
        <h1 className="text-[1.6rem] font-bold leading-tight tracking-[-0.03em] text-ink">
          {etapa.titulo}
        </h1>
        {etapa.descricao && (
          <p className="text-[14px] leading-relaxed text-ink-muted">{etapa.descricao}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[11.5px] text-ink-muted">
          {etapa.prazoEm && <span>Prazo sugerido: {dataBR(etapa.prazoEm)}</span>}
          {progresso.tempoSegundos > 0 && <span>Tempo nesta etapa: {fmtDuracao(progresso.tempoSegundos)}</span>}
          {progresso.tentativas > 0 && (
            <span>{progresso.tentativas === 1 ? '1 tentativa' : `${progresso.tentativas} tentativas`}</span>
          )}
        </div>
      </header>

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

      {blocos.length === 0 && questoes.length === 0 ? (
        <Cartao className="text-center">
          <p className="text-[13px] text-ink-muted">
            Esta etapa ainda não tem conteúdo publicado. A coordenação está preparando — volte em breve.
          </p>
        </Cartao>
      ) : (
        <Cartao className="space-y-6">
          {blocos.map(bloco => (
            <div key={bloco.id} className="space-y-4">
              <BlocoView bloco={bloco} />
              {(porBloco.get(bloco.id) ?? []).map(renderQuestao)}
            </div>
          ))}

          {soltas.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  Atividade da etapa
                </h2>
                <p className="text-[12.5px] text-ink-muted">
                  {concluida
                    ? 'Você já concluiu esta etapa. Suas respostas ficam aqui para consulta.'
                    : `Acerte ao menos ${etapa.notaMinima}% para liberar a próxima etapa.`}
                </p>
              </div>
              {soltas.map(renderQuestao)}
            </div>
          )}

          {quiz.envio && <PainelResultado envio={quiz.envio} />}

          {erroEnvio && (
            <div className="rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5 text-[12.5px] font-medium text-brand-strong">
              {erroEnvio}
            </div>
          )}

          {questoes.length > 0 && <BotoesQuiz quiz={quiz} enviando={responder.isPending} />}
        </Cartao>
      )}

      <ObservacaoPessoal token={token} etapaId={etapaId} inicial={progresso.observacao} />
    </div>
  )
}
