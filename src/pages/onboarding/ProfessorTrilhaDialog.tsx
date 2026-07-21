import { useState } from 'react'
import {
  Check, Clock3, Lock, Unlock, RotateCcw, MessageSquareText, X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { dataBR, fmtDuracao } from '@/lib/formato'
import {
  useRespostasProfessor, useLiberarEtapa, useResetarEtapa, useRevisarResposta,
  type EtapaAdmin, type RespostaAdmin,
} from '@/hooks/useWelcomePathAdmin'
import type { LinhaTrilha } from './WelcomePathTab'

// ─────────────────────────────────────────────────────────────────────────────
// Detalhe de um professor na trilha: etapa a etapa, com as respostas que ele
// deu e as ações da coordenação (liberar fora de ordem, resetar, corrigir
// dissertativa).
//
// É aqui que a dissertativa vira nota: enquanto ninguém revisa, a etapa fica
// pendurada em `revisao_pendente` e o professor não destrava a próxima.
// ─────────────────────────────────────────────────────────────────────────────

function RespostaObjetiva({ r }: { r: RespostaAdmin }) {
  const opcoes = r.questao?.opcoes ?? []
  const escolhidas = r.resposta?.opcoes ?? []
  const corretas = r.questao?.corretas ?? []

  return (
    <ul className="space-y-1">
      {opcoes.map((opt, i) => {
        const marcou = escolhidas.includes(i)
        const eraCerta = corretas.includes(i)
        return (
          <li
            key={i}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]',
              eraCerta ? 'bg-urg-lowBg/50 text-urg-lowFg'
                : marcou ? 'bg-urg-highBg/40 text-urg-highFg'
                  : 'text-ink-muted',
            )}
          >
            <span className="w-4 flex-shrink-0 text-[10.5px] font-semibold">
              {String.fromCharCode(65 + i)}
            </span>
            <span className="min-w-0 flex-1">{opt}</span>
            {marcou   && <span className="text-[10.5px] font-medium">marcou</span>}
            {eraCerta && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
          </li>
        )
      })}
    </ul>
  )
}

function RevisaoDissertativa({ resposta }: { resposta: RespostaAdmin }) {
  const revisar = useRevisarResposta()
  const [comentario, setComentario] = useState(resposta.comentario_revisao ?? '')

  function decidir(correta: boolean) {
    revisar.mutate(
      { respostaId: resposta.id, correta, comentario },
      {
        onSuccess: () => toast.success(correta ? 'Resposta aprovada' : 'Resposta marcada para refazer'),
        onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível revisar.'),
      },
    )
  }

  const jaRevisada = resposta.correta !== null

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl border border-line-soft bg-surface-canvas px-3 py-2.5">
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
          {resposta.resposta?.texto || <span className="text-ink-muted">(em branco)</span>}
        </p>
      </div>

      {jaRevisada ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium',
            resposta.correta ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-urg-highBg text-urg-highFg',
          )}>
            {resposta.correta ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {resposta.correta ? 'Aprovada' : 'Precisa refazer'}
          </span>
          {resposta.revisado_em && (
            <span className="text-ink-muted">em {dataBR(resposta.revisado_em.slice(0, 10))}</span>
          )}
          {resposta.comentario_revisao && (
            <span className="w-full text-ink-secondary">“{resposta.comentario_revisao}”</span>
          )}
          <button
            onClick={() => decidir(!resposta.correta)}
            disabled={revisar.isPending}
            className="btn-press text-[11.5px] text-ink-muted underline-offset-2 hover:text-ink-secondary hover:underline"
          >
            Trocar decisão
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={comentario}
            onChange={e => setComentario(e.target.value)}
            rows={2}
            placeholder="Comentário para o professor (opcional)…"
            className="w-full resize-y rounded-xl border border-line-soft bg-surface-canvas px-3 py-2
                       text-[12.5px] text-ink placeholder:text-ink-subtle
                       focus:border-accentBlue focus:outline-none focus:ring-2 focus:ring-accentBlue-soft"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm" variant="outline"
              className="btn-press h-8 gap-1.5 border-line text-[12px]"
              disabled={revisar.isPending}
              onClick={() => decidir(false)}
            >
              <X className="h-3.5 w-3.5" /> Pedir para refazer
            </Button>
            <Button
              size="sm"
              className="btn-press h-8 gap-1.5 text-[12px]"
              disabled={revisar.isPending}
              onClick={() => decidir(true)}
            >
              <Check className="h-3.5 w-3.5" /> Aprovar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function DetalheEtapa({ linha, etapa }: { linha: LinhaTrilha; etapa: EtapaAdmin }) {
  const { data: respostas = [], isLoading } = useRespostasProfessor(linha.professorId, etapa.id)
  const p = linha.porEtapa.get(etapa.id)

  // Só a última tentativa importa para a revisão; as anteriores ficam no banco
  // para consulta, mas poluiriam a tela.
  const ultima = respostas.length ? Math.max(...respostas.map(r => r.tentativa)) : 0
  const daUltima = respostas.filter(r => r.tentativa === ultima)

  if (isLoading) {
    return <p className="px-1 py-3 text-[12.5px] text-ink-muted">Carregando respostas…</p>
  }

  if (daUltima.length === 0) {
    return (
      <p className="px-1 py-3 text-[12.5px] text-ink-muted">
        {p?.iniciada_em ? 'Abriu a etapa, mas ainda não enviou respostas.' : 'Ainda não começou esta etapa.'}
      </p>
    )
  }

  return (
    <div className="space-y-4 pt-1">
      {ultima > 1 && (
        <p className="text-[11.5px] text-ink-muted">
          Mostrando a tentativa {ultima} (de {ultima}).
        </p>
      )}
      {daUltima
        .sort((a, b) => (a.questao?.ordem ?? 0) - (b.questao?.ordem ?? 0))
        .map(r => (
          <div key={r.id} className="space-y-2 rounded-xl border border-line-soft bg-surface-subtle/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12.5px] font-medium leading-snug text-ink">
                {r.questao?.enunciado ?? '(questão removida)'}
              </p>
              {r.correta === null ? (
                <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-urg-medBg px-2 py-0.5 text-[10.5px] font-medium text-urg-medFg">
                  <Clock3 className="h-3 w-3" /> Aguardando você
                </span>
              ) : (
                <span className={cn(
                  'inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                  r.correta ? 'bg-urg-lowBg text-urg-lowFg' : 'bg-urg-highBg text-urg-highFg',
                )}>
                  {r.correta ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {r.correta ? 'Acertou' : 'Errou'}
                </span>
              )}
            </div>

            {r.questao?.tipo === 'dissertativa'
              ? <RevisaoDissertativa resposta={r} />
              : <RespostaObjetiva r={r} />}
          </div>
        ))}
    </div>
  )
}

export function ProfessorTrilhaDialog({
  linha, etapas, onFechar,
}: {
  linha: LinhaTrilha
  etapas: EtapaAdmin[]
  onFechar: () => void
}) {
  const [expandida, setExpandida] = useState<string | null>(null)
  const liberar = useLiberarEtapa()
  const resetar = useResetarEtapa()

  return (
    <Dialog open onOpenChange={aberto => { if (!aberto) onFechar() }}>
      {/* sm:max-w-* e não max-w-*: o DialogContent embute `sm:max-w-sm`, e o
          tailwind-merge não trata prefixos diferentes como conflito — sem o
          `sm:` aqui, o dialog encolhe para 384px a partir de 640px de tela. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{linha.nome}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-muted">
          {linha.dataInicio && <span>Início: {dataBR(linha.dataInicio)}</span>}
          <span>{linha.concluidas} de {linha.totalObrigatorias} etapas obrigatórias</span>
          {linha.notaMedia != null && <span>Nota média: {Math.round(linha.notaMedia)}%</span>}
          <span>Tempo total: {fmtDuracao(linha.tempoTotal)}</span>
        </div>

        <ul className="space-y-2">
          {etapas.map((etapa, i) => {
            const p = linha.porEtapa.get(etapa.id)
            const anterior = i > 0 ? linha.porEtapa.get(etapas[i - 1].id) : null
            const destravada = i === 0 || !!anterior?.concluida_em || !!p?.liberada_manualmente
            const aberta = expandida === etapa.id

            return (
              <li key={etapa.id} className="rounded-xl border border-line-soft">
                <button
                  type="button"
                  onClick={() => setExpandida(aberta ? null : etapa.id)}
                  className="btn-press flex w-full items-center gap-3 px-3.5 py-3 text-left"
                >
                  <span className={cn(
                    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    p?.concluida_em ? 'bg-urg-lowBg text-urg-lowFg'
                      : p?.revisao_pendente ? 'bg-urg-medBg text-urg-medFg'
                        : destravada ? 'bg-accentBlue-soft text-accentBlue'
                          : 'bg-surface-subtle text-ink-subtle',
                  )}>
                    {p?.concluida_em ? <Check className="h-3.5 w-3.5" />
                      : destravada ? etapa.ordem
                        : <Lock className="h-3 w-3" />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      Etapa {etapa.ordem} · {etapa.titulo}
                    </span>
                    <span className="block text-[11.5px] text-ink-muted">
                      {p?.concluida_em
                        ? `Concluída em ${dataBR(p.concluida_em.slice(0, 10))}${p.nota != null ? ` · ${Math.round(p.nota)}%` : ''}`
                        : p?.revisao_pendente
                          ? 'Aguardando sua revisão'
                          : p?.tentativas
                            ? `${p.tentativas} ${p.tentativas === 1 ? 'tentativa' : 'tentativas'}${p.nota != null ? ` · última nota ${Math.round(p.nota)}%` : ''}`
                            : destravada ? 'Liberada, não iniciada' : 'Bloqueada'}
                      {p?.liberada_manualmente && ' · liberada manualmente'}
                    </span>
                  </span>

                  {p?.tempo_segundos ? (
                    <span className="flex-shrink-0 text-[11.5px] text-ink-muted">
                      {fmtDuracao(p.tempo_segundos)}
                    </span>
                  ) : null}
                </button>

                {aberta && (
                  <div className="space-y-3 border-t border-line-soft px-3.5 py-3">
                    <DetalheEtapa linha={linha} etapa={etapa} />

                    {p?.observacao && (
                      <div className="rounded-xl border border-accentBlue/20 bg-accentBlue-soft/40 px-3 py-2.5">
                        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-label text-accentBlue">
                          <MessageSquareText className="h-3 w-3" /> Anotação do professor
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-secondary">
                          {p.observacao}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap justify-end gap-2">
                      {!destravada && (
                        <Button
                          size="sm" variant="outline"
                          className="btn-press h-8 gap-1.5 border-line text-[12px]"
                          disabled={liberar.isPending}
                          onClick={() => liberar.mutate(
                            { professorId: linha.professorId, etapaId: etapa.id },
                            {
                              onSuccess: () => toast.success('Etapa liberada para este professor'),
                              onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível liberar.'),
                            },
                          )}
                        >
                          <Unlock className="h-3.5 w-3.5" /> Liberar mesmo assim
                        </Button>
                      )}
                      {(p?.tentativas ?? 0) > 0 && (
                        <Button
                          size="sm" variant="outline"
                          className="btn-press h-8 gap-1.5 border-line text-[12px]"
                          disabled={resetar.isPending}
                          onClick={() => {
                            if (!confirm(`Zerar a etapa ${etapa.ordem} de ${linha.nome}? As respostas dele serão apagadas.`)) return
                            resetar.mutate(
                              { professorId: linha.professorId, etapaId: etapa.id },
                              {
                                onSuccess: () => toast.success('Etapa zerada — o professor pode refazer'),
                                onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível resetar.'),
                              },
                            )
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Zerar etapa
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
