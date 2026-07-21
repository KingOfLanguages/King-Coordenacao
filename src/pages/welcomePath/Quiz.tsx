import { Check, X, Clock3, Lightbulb, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuestaoEtapa, ResultadoEnvio } from '@/hooks/useWelcomePath'
import type { QuizEtapa, Veredito } from './useQuizEtapa'

// ─────────────────────────────────────────────────────────────────────────────
// Peças visuais das atividades avaliativas de uma etapa. O estado e o envio
// vivem em useQuizEtapa.ts.
//
// A correção NÃO acontece aqui — o front manda as respostas e recebe de volta
// só "acertou / errou" por questão, mais a explicação didática. O gabarito
// nunca chega ao navegador, que é a diferença central para o app original (lá o
// `correct_index` vinha junto com a pergunta e o quiz era burlável).
// ─────────────────────────────────────────────────────────────────────────────

function LetraOpcao({ i, ativa }: { i: number; ativa: boolean }) {
  return (
    <span className={cn(
      'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-[10.5px] font-semibold',
      ativa ? 'bg-ink text-ink-inverse' : 'bg-surface-subtle text-ink-muted',
    )}>
      {String.fromCharCode(65 + i)}
    </span>
  )
}

function SeloVeredito({ v }: { v: Veredito }) {
  if (v.correta === null) {
    return (
      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-urg-medBg px-2 py-0.5 text-[10.5px] font-medium text-urg-medFg">
        <Clock3 className="h-3 w-3" /> Em revisão
      </span>
    )
  }
  return v.correta ? (
    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-urg-lowBg px-2 py-0.5 text-[10.5px] font-medium text-urg-lowFg">
      <Check className="h-3 w-3" /> Correta
    </span>
  ) : (
    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-urg-highBg px-2 py-0.5 text-[10.5px] font-medium text-urg-highFg">
      <X className="h-3 w-3" /> Revise
    </span>
  )
}

export function QuestaoView({
  questao, numero, selecao, veredito, travada, onChange,
}: {
  questao: QuestaoEtapa
  numero: number
  selecao: number[] | string | undefined
  veredito: Veredito | null
  travada: boolean
  onChange: (v: number[] | string) => void
}) {
  const multipla = questao.tipo === 'multipla_selecao'
  const marcadas = Array.isArray(selecao) ? selecao : []

  function toggle(i: number) {
    if (travada) return
    if (multipla) {
      onChange(marcadas.includes(i) ? marcadas.filter(x => x !== i) : [...marcadas, i])
    } else {
      onChange([i])
    }
  }

  return (
    <div className={cn(
      'space-y-3 rounded-2xl border p-4',
      veredito?.correta === false
        ? 'border-urg-highFg/25 bg-urg-highBg/10'
        : 'border-line-soft bg-surface-subtle/40',
    )}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13.5px] font-medium leading-snug text-ink">
          <span className="tabular-nums text-ink-muted">{numero}.</span>{' '}
          {questao.enunciado}
          {!questao.obrigatoria && (
            <span className="ml-1.5 text-[11px] font-normal text-ink-muted">(opcional)</span>
          )}
        </p>
        {veredito && <SeloVeredito v={veredito} />}
      </div>

      {questao.tipo === 'dissertativa' ? (
        <textarea
          value={typeof selecao === 'string' ? selecao : ''}
          onChange={e => onChange(e.target.value)}
          disabled={travada}
          rows={4}
          placeholder="Escreva sua resposta…"
          className="w-full resize-y rounded-xl border border-line-soft bg-surface-canvas px-3 py-2
                     text-[13px] text-ink placeholder:text-ink-subtle transition-colors
                     focus:outline-none focus:border-accentBlue focus:ring-2 focus:ring-accentBlue-soft
                     disabled:opacity-70"
        />
      ) : (
        <div className="space-y-1.5">
          {questao.opcoes.map((opt, i) => {
            const marcada = marcadas.includes(i)
            return (
              <label
                key={i}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] transition-colors',
                  travada ? 'cursor-default' : 'cursor-pointer',
                  marcada
                    ? 'border-accentBlue bg-accentBlue-soft/60 text-ink'
                    : 'border-line-soft bg-surface-canvas text-ink-secondary',
                  !travada && !marcada && 'hover:border-line hover:bg-surface-subtle/60',
                )}
              >
                <input
                  type={multipla ? 'checkbox' : 'radio'}
                  name={questao.id}
                  checked={marcada}
                  disabled={travada}
                  onChange={() => toggle(i)}
                  className="sr-only"
                />
                <LetraOpcao i={i} ativa={marcada} />
                <span className="min-w-0">{opt}</span>
              </label>
            )
          })}
          {multipla && !travada && (
            <p className="pt-0.5 text-[11px] text-ink-muted">Marque todas as alternativas corretas.</p>
          )}
        </div>
      )}

      {veredito?.explicacao && (
        <div className="flex gap-2 rounded-xl bg-surface-canvas px-3 py-2.5">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-muted" />
          <p className="text-[12.5px] leading-relaxed text-ink-secondary">{veredito.explicacao}</p>
        </div>
      )}
      {veredito?.comentario && (
        <div className="rounded-xl border border-accentBlue/20 bg-accentBlue-soft/50 px-3 py-2.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-label text-accentBlue">
            Retorno da coordenação
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-secondary">{veredito.comentario}</p>
        </div>
      )}
    </div>
  )
}

export function PainelResultado({ envio }: { envio: ResultadoEnvio }) {
  return (
    <div className={cn(
      'rounded-2xl border px-4 py-3.5',
      envio.aprovado
        ? 'border-urg-lowFg/25 bg-urg-lowBg/50'
        : envio.revisaoPendente
          ? 'border-urg-medFg/25 bg-urg-medBg/40'
          : 'border-urg-highFg/25 bg-urg-highBg/30',
    )}>
      <p className="text-[13.5px] font-semibold text-ink">
        {envio.aprovado
          ? `Etapa concluída!${envio.nota != null ? ` ${Math.round(envio.nota)}% de acerto.` : ''}`
          : envio.revisaoPendente
            ? 'Respostas enviadas para a coordenação'
            : `Você acertou ${Math.round(envio.nota ?? 0)}%`}
      </p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-secondary">
        {envio.aprovado
          ? 'A próxima etapa já está liberada na sua trilha.'
          : envio.revisaoPendente
            ? 'Sua resposta escrita será lida pela coordenação. O retorno aparece aqui mesmo.'
            : `O mínimo é ${envio.notaMinima}%. Revise o conteúdo acima e tente de novo.`}
      </p>
    </div>
  )
}

export function BotoesQuiz({
  quiz, enviando,
}: {
  quiz: QuizEtapa
  enviando: boolean
}) {
  if (quiz.travada) return null

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {quiz.reprovado && (
          <button
            type="button"
            onClick={quiz.tentarDeNovo}
            className="btn-press flex h-10 items-center gap-1.5 rounded-full border border-line px-4 text-[13px] font-medium text-ink-secondary hover:bg-surface-subtle"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        )}
        <button
          type="button"
          onClick={quiz.enviar}
          disabled={enviando || quiz.faltando > 0}
          title={quiz.faltando > 0 ? 'Responda todas as questões obrigatórias.' : undefined}
          className="btn-press h-10 rounded-full bg-ink px-5 text-[13px] font-medium text-ink-inverse hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : 'Enviar respostas'}
        </button>
      </div>
      {quiz.faltando > 0 && (
        <p className="text-right text-[11.5px] text-ink-muted">
          {quiz.faltando === 1
            ? 'Falta 1 questão obrigatória.'
            : `Faltam ${quiz.faltando} questões obrigatórias.`}
        </p>
      )}
    </div>
  )
}
