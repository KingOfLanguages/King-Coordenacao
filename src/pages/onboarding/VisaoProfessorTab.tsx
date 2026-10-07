import { useMemo, useState } from 'react'
import { Eye, KeyRound, RotateCcw, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { linkWelcomePathPublico } from '@/lib/portal'
import { useAuth } from '@/contexts/AuthContext'
import { useLinksCoordenador } from '@/hooks/useMeusLinksAgendamento'
import { TrilhaView } from '@/pages/welcomePath/TrilhaView'
import { EtapaLayout } from '@/pages/welcomePath/EtapaView'
import { useQuizEtapa } from '@/pages/welcomePath/useQuizEtapa'
import {
  useEtapasAdmin, useBlocosAdmin, useQuestoesAdmin, type EtapaAdmin, type QuestaoAdmin,
} from '@/hooks/useWelcomePathAdmin'
import type {
  EtapaTrilha, BlocoEtapa, MinhaResposta, RespostaEnviada, ResultadoEnvio, JornadaPortal,
} from '@/hooks/useWelcomePath'

/** Estados do prazo que a coordenação pode simular na prévia (2026-10-07). */
type Simulacao = 'andamento' | 'acabando' | 'bloqueado' | 'concluiu'

const SIMULACOES: { id: Simulacao; label: string }[] = [
  { id: 'andamento', label: 'Em andamento' },
  { id: 'acabando',  label: 'Menos de 24h' },
  { id: 'bloqueado', label: 'Prazo esgotado' },
  { id: 'concluiu',  label: 'Concluiu tudo' },
]

const HORA = 3_600_000

/** Relógio de mentira para a prévia: quanto falta em cada simulação. */
function jornadaSimulada(sim: Simulacao, base: number): JornadaPortal {
  const iso = (ms: number) => new Date(ms).toISOString()
  const prazo = sim === 'andamento' ? base + 76 * HORA
    : sim === 'acabando' ? base + 5.2 * HORA
      : sim === 'bloqueado' ? base - 2 * HORA
        : base + 30 * HORA
  return {
    primeiroAcessoEm: iso(prazo - 120 * HORA),
    prazoEm: iso(prazo),
    concluidaEm: sim === 'concluiu' ? iso(base - HORA) : null,
    desbloqueios: 0,
    bloqueada: sim === 'bloqueado',
    agora: iso(base),
  }
}

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
    desativada: !e.ativa,
    // Tudo liberado: a coordenação precisa abrir qualquer etapa.
    estado: 'liberada', motivoBloqueio: null, abreEm: null, prazoEm: null,
    nota: null, tentativas: 0, iniciadaEm: null, concluidaEm: null, tempoSegundos: 0, revisaoPendente: false,
  }
}

export function VisaoProfessorTab() {
  const { data, isLoading } = useEtapasAdmin()
  // Com as desativadas, a coordenação revisa um módulo antes de ativar; sem
  // elas, a lista é exatamente a que o professor vê hoje.
  const [comDesativadas, setComDesativadas] = useState(true)
  const etapas = useMemo(() => (data ?? []).filter(e => comDesativadas || e.ativa), [data, comDesativadas])
  const nDesativadas = (data ?? []).filter(e => !e.ativa).length
  const [aberta, setAberta] = useState<string | null>(null)
  // Trocar a chave remonta a etapa: é o "refazer" da pré-visualização.
  const [rodada, setRodada] = useState(0)
  const [simulacao, setSimulacao] = useState<Simulacao>('andamento')
  // Hora fixa da prévia: o relógio simulado não precisa andar.
  const [base] = useState(() => Date.now())
  // Nos parabéns, o link de quem está olhando: um coordenador vê o próprio
  // Koalendar, como o professor do grupo dele vai ver.
  const { profile } = useAuth()
  const { data: meusLinks } = useLinksCoordenador(profile?.id ?? null)

  const trilhaSimulada = useMemo(() => {
    const todas = etapas.map(paraTrilha)
    if (simulacao === 'concluiu') return todas.map(e => ({ ...e, estado: 'concluida' as const }))
    if (simulacao === 'bloqueado') {
      // Concluiu um terço; o resto fica travado pelo prazo, como no portal.
      const feitas = Math.max(1, Math.floor(todas.length / 3))
      return todas.map((e, i) => i < feitas
        ? { ...e, estado: 'concluida' as const }
        : { ...e, estado: 'bloqueada' as const, motivoBloqueio: 'prazo' as const })
    }
    return todas
  }, [etapas, simulacao])

  if (isLoading) return <p className="py-16 text-center text-[13px] text-ink-muted">Carregando a trilha…</p>

  const etapa = etapas.find(e => e.id === aberta)
  if (etapa) {
    return (
      <div className="flex justify-center">
        <EtapaPrevia
          key={`${etapa.id}-${rodada}`}
          etapa={etapa}
          numero={etapas.indexOf(etapa) + 1}
          desativada={!etapa.ativa}
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
      {nDesativadas > 0 && (
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-secondary">
          <input
            type="checkbox"
            checked={comDesativadas}
            onChange={e => setComDesativadas(e.target.checked)}
            className="h-4 w-4 accent-current"
          />
          Mostrar também as {nDesativadas} etapas desativadas, que o professor ainda não vê
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-ink-secondary">Simular o prazo:</span>
        <div className="flex items-center gap-1 rounded-full border border-line-soft p-0.5" role="group" aria-label="Simular o prazo">
          {SIMULACOES.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSimulacao(s.id)}
              className={cn(
                'btn-press rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors',
                simulacao === s.id ? 'bg-ink text-ink-inverse' : 'text-ink-secondary hover:text-ink',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-center">
        <TrilhaView
          nome="Professor"
          etapas={trilhaSimulada}
          onAbrir={id => { setAberta(id); window.scrollTo({ top: 0 }) }}
          jornada={jornadaSimulada(simulacao, base)}
          primeiraReuniao={{ coordenador: profile?.nome ?? null, link: meusLinks?.koalendar_link ?? null }}
        />
      </div>
    </div>
  )
}

function FaixaPrevia({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-aviso-infoBd bg-aviso-infoBg px-4 py-3">
      <Eye className="mt-0.5 h-4 w-4 flex-shrink-0 text-aviso-infoFg" />
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
  etapa, numero, desativada, totalEtapas, onVoltar, onRefazer,
}: {
  etapa: EtapaAdmin
  numero: number
  desativada: boolean
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
      numero={numero}
      totalEtapas={totalEtapas}
      etapasConcluidas={0}
      quiz={quiz}
      enviando={false}
      erroEnvio={null}
      onVoltar={onVoltar}
      aviso={<FaixaPrevia texto={desativada
        ? 'Esta etapa está desativada: o professor ainda não a vê. Aqui ela aparece como vai ficar, com as práticas funcionando.'
        : 'Esta é a etapa como o professor vê, com as práticas funcionando.'} />}
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
    <div className="-mt-2 rounded-xl border border-dashed border-aviso-infoBd bg-aviso-infoBg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-secondary">
      <span className="font-semibold text-aviso-infoFg">Gabarito: </span>
      {dissertativa
        ? 'resposta escrita, corrigida pela coordenação na aba Welcome Path.'
        : questao.corretas.map(i => String.fromCharCode(65 + i)).join(', ') || 'sem alternativa marcada'}
      {questao.explicacao && <p className="mt-1 whitespace-pre-wrap text-ink-muted">{questao.explicacao}</p>}
    </div>
  )
}
