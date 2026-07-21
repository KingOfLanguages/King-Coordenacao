import { useMemo, useState } from 'react'
import type {
  QuestaoEtapa, MinhaResposta, RespostaEnviada, ResultadoEnvio,
} from '@/hooks/useWelcomePath'

// ─────────────────────────────────────────────────────────────────────────────
// Estado e envio das atividades de uma etapa.
//
// Fica separado dos componentes (Quiz.tsx) porque as questões podem estar
// ancoradas a um bloco de conteúdo: quem intercala conteúdo e pergunta é a
// EtapaView, mas o estado e o envio precisam ser um só — se cada grupo de
// questões tivesse o próprio, o professor enviaria a etapa em pedaços.
// ─────────────────────────────────────────────────────────────────────────────

type Selecao = Record<string, number[] | string>

/** Correção de uma questão, vinda do envio recém-feito ou da última tentativa. */
export type Veredito = {
  correta: boolean | null
  explicacao: string | null
  comentario?: string | null
}

export function useQuizEtapa({
  questoes, minhasRespostas, concluida, revisaoPendente, onEnviar,
}: {
  questoes: QuestaoEtapa[]
  minhasRespostas: MinhaResposta[]
  concluida: boolean
  revisaoPendente: boolean
  onEnviar: (respostas: RespostaEnviada[]) => Promise<ResultadoEnvio | null>
}) {
  // Pré-carrega o que ele respondeu da última vez — recarregar a página não
  // pode fazer o professor perder o que já escreveu.
  const respostasIniciais = useMemo<Selecao>(() => {
    const s: Selecao = {}
    for (const r of minhasRespostas) {
      s[r.questao_id] = r.resposta?.texto != null ? r.resposta.texto : (r.resposta?.opcoes ?? [])
    }
    return s
  }, [minhasRespostas])

  const [selecao, setSelecao] = useState<Selecao>(respostasIniciais)
  const [envio, setEnvio] = useState<ResultadoEnvio | null>(null)
  // Ao refazer, some com a correção antiga: responder de novo com o "errei
  // aqui" grudado na tela é ruído, não ajuda.
  const [refazendo, setRefazendo] = useState(false)

  // Sincroniza quando o servidor traz respostas novas (ex.: a coordenação
  // revisou a dissertativa e a query revalidou) — ajuste-de-estado-em-render,
  // o mesmo padrão sem effect já usado em OnboardingPage.
  const [respostasAnteriores, setRespostasAnteriores] = useState(minhasRespostas)
  if (minhasRespostas !== respostasAnteriores) {
    setRespostasAnteriores(minhasRespostas)
    if (!envio) setSelecao(respostasIniciais)
  }

  const vereditos = useMemo<Record<string, Veredito>>(() => {
    if (refazendo) return {}
    const m: Record<string, Veredito> = {}
    if (envio) {
      for (const r of envio.resultado) m[r.questaoId] = { correta: r.correta, explicacao: r.explicacao }
      return m
    }
    for (const r of minhasRespostas) {
      const q = questoes.find(x => x.id === r.questao_id)
      m[r.questao_id] = {
        correta: r.correta,
        explicacao: q?.explicacao ?? null,
        comentario: r.comentario_revisao,
      }
    }
    return m
  }, [envio, minhasRespostas, questoes, refazendo])

  // `envio.*` entra na conta junto com o estado do servidor: entre o envio e a
  // revalidação da query, `revisaoPendente` ainda vem false e o botão de enviar
  // reapareceria por um instante — o servidor recusaria (409), mas o professor
  // veria o botão piscar de volta.
  const travada = concluida || revisaoPendente
    || (!!envio && (envio.aprovado || envio.revisaoPendente))
  const corrigida = Object.keys(vereditos).length > 0

  const faltando = questoes.filter(q => {
    if (!q.obrigatoria) return false
    const v = selecao[q.id]
    return typeof v === 'string' ? v.trim().length === 0 : !(v && v.length > 0)
  }).length

  async function enviar() {
    const payload: RespostaEnviada[] = questoes.flatMap((q): RespostaEnviada[] => {
      const v = selecao[q.id]
      if (q.tipo === 'dissertativa') {
        const texto = typeof v === 'string' ? v.trim() : ''
        return texto ? [{ questaoId: q.id, texto }] : []
      }
      const opcoes = Array.isArray(v) ? v : []
      return opcoes.length ? [{ questaoId: q.id, opcoes }] : []
    })
    setRefazendo(false)
    const r = await onEnviar(payload)
    if (r) setEnvio(r)
  }

  function tentarDeNovo() {
    setEnvio(null)
    setRefazendo(true)
    setSelecao({})
  }

  return {
    envio,
    travada,
    faltando,
    reprovado: !!envio && !envio.aprovado && !envio.revisaoPendente,
    /** Veredito de uma questão — null enquanto ela nunca foi corrigida. */
    vereditoDe: (id: string): Veredito | null => (corrigida ? vereditos[id] ?? null : null),
    valorDe: (id: string) => selecao[id],
    definir: (id: string, v: number[] | string) => setSelecao(s => ({ ...s, [id]: v })),
    enviar,
    tentarDeNovo,
  }
}

export type QuizEtapa = ReturnType<typeof useQuizEtapa>
