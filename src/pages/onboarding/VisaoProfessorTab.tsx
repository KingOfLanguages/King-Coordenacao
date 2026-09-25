import { useMemo, useState } from 'react'
import { Eye, KeyRound, RotateCcw, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { linkWelcomePathPublico } from '@/lib/portal'
import { TrilhaView } from '@/pages/welcomePath/TrilhaView'
import { EtapaLayout } from '@/pages/welcomePath/EtapaView'
import { useQuizEtapa } from '@/pages/welcomePath/useQuizEtapa'
import {
  useEtapasAdmin, useBlocosAdmin, useQuestoesAdmin, type EtapaAdmin, type QuestaoAdmin,
} from '@/hooks/useWelcomePathAdmin'
import type {
  EtapaTrilha, BlocoEtapa, MinhaResposta, RespostaEnviada, ResultadoEnvio,
} from '@/hooks/useWelcomePath'

// ─────────────────────────────────────────────────────────────────────────────
// Visão do professor: a trilha exatamente como o professor vê no portal, para a
// coordenação conferir o conteúdo sem precisar de uma conta de professor.
//
// Usa os MESMOS componentes do portal (TrilhaView, EtapaLayout, BlocoView,
// QuestaoView). Muda só a origem dos dados: aqui vêm das tabelas da trilha
// (leitura liberada a quem está logado), todas as etapas abertas, e as respostas
// são corrigidas no navegador com o gabarito, sem gravar nada. O professor
// nunca recebe o gabarito; quem está aqui já pode lê-lo na aba Conteúdo.
// ─────────────────────────────────────────────────────────────────────────────

const SEM_RESPOSTAS: MinhaResposta[] = []
const SEM_QUESTOES: QuestaoAdmin[] = []

function paraTrilha(e: EtapaAdmin): EtapaTrilha {
  return {
    id: e.id, ordem: e.ordem, titulo: e.titulo, descricao: e.descricao,
    minutos: e.minutos_estimados, obrigatoria: e.obrigatoria, notaMinima: e.nota_minima,
    notasCoordenacao: e.notas_coordenacao,
    // Tudo liberado: a coordenação precisa abrir qualquer etapa.
    estado: 'liberada', motivoBloqueio: null, abreEm: null, prazoEm: null,
    nota: null, tentativas: 0, iniciadaEm: null, concluidaEm: null, tempoSegundos: 0, revisaoPendente: false,
  }
}

export function VisaoProfessorTab() {
  const { data, isLoading } = useEtapasAdmin()
  const etapas = useMemo(() => (data ?? []).filter(e => e.ativa), [data])
  const [aberta, setAberta] = useState<string | null>(null)
  // Trocar a chave remonta a etapa: é o "refazer" da pré-visualização.
  const [rodada, setRodada] = useState(0)

  if (isLoading) return <p className="py-16 text-center text-[13px] text-ink-muted">Carregando a trilha…</p>

  const etapa = etapas.find(e => e.id === aberta)
  if (etapa) {
    return (
      <div className="flex justify-center">
        <EtapaPrevia
          key={`${etapa.id}-${rodada}`}
          etapa={etapa}
          totalEtapas={etapas.length}
          onVoltar={() => { setAberta(null); window.scrollTo({ top: 0 }) }}
          onRefazer={() => setRodada(r => r + 1)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <FaixaPrevia texto="É a tela inicial do portal do professor. Aqui todas as etapas ficam abertas, para você conferir qualquer uma." />
      <div className="flex justify-center">
        <TrilhaView
          nome="Professor"
          etapas={etapas.map(paraTrilha)}
          onAbrir={id => { setAberta(id); window.scrollTo({ top: 0 }) }}
        />
      </div>
    </div>
  )
}

function FaixaPrevia({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-accentBlue/20 bg-accentBlue-soft/50 px-4 py-3">
      <Eye className="mt-0.5 h-4 w-4 flex-shrink-0 text-accentBlue" />
      <p className="text-[13px] leading-relaxed text-ink-secondary">
        <span className="font-semibold text-ink">Visão do professor.</span> {texto} Nada do que você responder aqui é gravado.
      </p>
    </div>
  )
}

/** Mesma nota do servidor: soma de pesos das objetivas certas sobre o total.
 *  Dissertativa obrigatória respondida deixa a etapa "em revisão". */
function corrigir(questoes: QuestaoAdmin[], respostas: RespostaEnviada[], notaMinima: number): ResultadoEnvio {
  const porId = new Map(respostas.map(r => [r.questaoId, r]))
  let total = 0
  let certo = 0
  let pendente = false
  const resultado = questoes.map(q => {
    const r = porId.get(q.id)
    if (q.tipo === 'dissertativa') {
      if (r?.texto && q.obrigatoria) pendente = true
      return { questaoId: q.id, correta: null, explicacao: q.explicacao }
    }
    const escolhidas = [...(r?.opcoes ?? [])].sort((a, b) => a - b)
    const gabarito = [...q.corretas].sort((a, b) => a - b)
    const ok = escolhidas.length === gabarito.length && escolhidas.every((v, i) => v === gabarito[i])
    total += q.peso
    if (ok) certo += q.peso
    return { questaoId: q.id, correta: ok, explicacao: q.explicacao }
  })
  const nota = total ? (certo / total) * 100 : 100
  return {
    nota, notaMinima, tentativas: 1, resultado,
    revisaoPendente: pendente,
    aprovado: !pendente && nota >= notaMinima,
  }
}

function EtapaPrevia({
  etapa, totalEtapas, onVoltar, onRefazer,
}: {
  etapa: EtapaAdmin
  totalEtapas: number
  onVoltar: () => void
  onRefazer: () => void
}) {
  const blocosQ = useBlocosAdmin(etapa.id)
  const questoesQ = useQuestoesAdmin(etapa.id)
  const questoes = questoesQ.data ?? SEM_QUESTOES
  const [gabarito, setGabarito] = useState(false)

  const blocos = useMemo<BlocoEtapa[]>(
    () => (blocosQ.data ?? []).map(b => ({
      id: b.id, ordem: b.ordem, tipo: b.tipo, titulo: b.titulo, conteudo: b.conteudo, url: b.url, meta: b.meta ?? {},
    })),
    [blocosQ.data],
  )
  const porId = useMemo(() => new Map(questoes.map(q => [q.id, q])), [questoes])

  const quiz = useQuizEtapa({
    questoes,
    minhasRespostas: SEM_RESPOSTAS,
    concluida: false,
    revisaoPendente: false,
    onEnviar: async respostas => corrigir(questoes, respostas, etapa.nota_minima),
  })

  if (blocosQ.isLoading || questoesQ.isLoading) {
    return <p className="py-16 text-center text-[13px] text-ink-muted">Carregando etapa…</p>
  }

  return (
    <EtapaLayout
      etapa={{
        id: etapa.id, ordem: etapa.ordem, titulo: etapa.titulo, descricao: etapa.descricao,
        notaMinima: etapa.nota_minima, prazoEm: null, notasCoordenacao: etapa.notas_coordenacao,
      }}
      blocos={blocos}
      questoes={questoes}
      progresso={{ concluidaEm: null, revisaoPendente: false, tempoSegundos: 0, tentativas: 0 }}
      totalEtapas={totalEtapas}
      etapasConcluidas={0}
      quiz={quiz}
      enviando={false}
      erroEnvio={null}
      onVoltar={onVoltar}
      aviso={<FaixaPrevia texto="Esta é a etapa como o professor vê, com as práticas funcionando." />}
      aposQuestao={gabarito ? q => <Gabarito questao={porId.get(q.id)} /> : undefined}
      trilho={
        <div className="space-y-4 rounded-2xl border border-line-soft bg-surface-canvas px-5 py-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-ink-muted" />
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Modo coordenação</h2>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] text-ink-secondary">
            Mostrar gabarito
            <input
              type="checkbox"
              checked={gabarito}
              onChange={e => setGabarito(e.target.checked)}
              className="h-4 w-4 accent-current"
            />
          </label>
          <button
            type="button"
            onClick={onRefazer}
            className="btn-press flex w-full items-center justify-center gap-1.5 rounded-full border border-line px-4 py-2 text-[12.5px] font-medium text-ink-secondary hover:bg-surface-subtle"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Refazer as questões
          </button>
          <p className="text-[12px] leading-relaxed text-ink-muted">
            No portal, esta coluna mostra as anotações do professor e o botão para falar com a coordenação.
          </p>
          <a
            href={linkWelcomePathPublico()}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-[12.5px] font-medium text-accentBlue hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Abrir o portal do professor
          </a>
        </div>
      }
    />
  )
}

function Gabarito({ questao }: { questao: QuestaoAdmin | undefined }) {
  if (!questao) return null
  const dissertativa = questao.tipo === 'dissertativa'
  return (
    <div className={cn(
      '-mt-2 rounded-xl border border-dashed px-3.5 py-2.5 text-[12.5px] leading-relaxed',
      'border-accentBlue/30 bg-accentBlue-soft/40 text-ink-secondary',
    )}>
      <span className="font-semibold text-accentBlue">Gabarito: </span>
      {dissertativa
        ? 'resposta escrita, corrigida pela coordenação na aba Welcome Path.'
        : questao.corretas.map(i => String.fromCharCode(65 + i)).join(', ') || 'sem alternativa marcada'}
      {questao.explicacao && <p className="mt-1 whitespace-pre-wrap text-ink-muted">{questao.explicacao}</p>}
    </div>
  )
}
