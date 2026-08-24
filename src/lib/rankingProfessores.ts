// ─────────────────────────────────────────────────────────────────────────────
// Ranking de desempenho do professor — do melhor ao pior.
//
// Nasceu para a REUNIÃO EM GRUPO: com ~10 professores na mesma chamada, a
// coordenação precisa saber em segundos quem está indo bem e quem precisa de
// atenção, sem abrir o perfil de um por um.
//
// Três eixos, na ordem de peso pedida pela coordenação:
//   1. SCORE do King — a régua oficial da escola (escala 200–1500).
//   2. INCIDENTES — menos é melhor.
//   3. FEEDBACKS POSITIVOS — mais é melhor.
// O feedback NEGATIVO entra junto como contrapeso: contar elogio e ignorar
// reclamação enviesaria o ranking inteiro.
//
// Princípios (herdados de confiabilidade.ts):
//  • Nada de caixa-preta: cada ponto sai de um eixo nomeado, exibido na tela.
//    Se a coordenação discordar da ordem, dá pra apontar a linha.
//  • Bugs/Melhorias (aba Plataforma) NÃO contam: são chamados de TI abertos
//    "sobre" o professor, não falhas dele. Mês de Análise também fica fora —
//    é consequência, não causa.
//  • Estrela de aluno NÃO entra: não discrimina (87% dos professores acima de
//    1300 têm 4,9+). O que entra é COMENTÁRIO positivo, que é volume real.
//
// Não confundir com prioridade.ts (fila de quem precisa de ajuda, maior = pior)
// nem com confiabilidade.ts (veredito de risco pro comercial). Aqui o número
// grande é o BOM.
// ─────────────────────────────────────────────────────────────────────────────

/** Janela de observação de incidentes e feedbacks, em dias. */
export const JANELA_DIAS = 90

/** Extremos da escala de score do King. */
const SCORE_PISO = 200, SCORE_TETO = 1500

// ── Amplitude de cada eixo, em pontos (o total vive em 0..100) ───────────────
const A_SCORE     = 60   // o score é a espinha dorsal
const A_POSITIVOS = 22   // bônus máximo por elogio
const A_INCIDENTE = 22   // penalidade máxima por incidente
const A_NEGATIVOS = 18   // penalidade máxima por feedback negativo

/** Custo de cada incidente e de cada um que segue sem solução. */
const CUSTO_INCIDENTE = 5, CUSTO_EM_ABERTO = 3
/** Custo de cada feedback negativo. */
const CUSTO_NEGATIVO = 6
/** Quantos feedbacks positivos na janela já valem o bônus cheio. */
const POSITIVOS_REF = 4

/** Faixas do rótulo, em pontos finais. */
const LIMITE_DESTAQUE = 72, LIMITE_ATENCAO = 45

export type NivelRanking = 'destaque' | 'regular' | 'atencao'

export interface EntradaRanking {
  professorId: string
  nome: string
  /** Score do King (200–1500). null = professor sem score sincronizado. */
  score: number | null
  /** Incidentes relevantes na janela (Plataforma e Mês de Análise já fora). */
  incidentes: number
  /** Quantos desses seguem sem solução. */
  incidentesAbertos: number
  /** observacoes tipo=feedback_positivo na janela. */
  feedbacksPositivos: number
  /** observacoes tipo=feedback_negativo na janela. */
  feedbacksNegativos: number
}

/** Uma parcela do resultado — o "porquê" da posição. */
export interface EixoRanking {
  chave: 'score' | 'positivos' | 'incidentes' | 'negativos'
  titulo: string
  /** Contribuição em pontos: positiva soma, negativa desconta. */
  pontos: number
}

export interface ItemRanking {
  professorId: string
  nome: string
  /** 1 = melhor. */
  posicao: number
  /** 0..100, maior = melhor. */
  pontos: number
  nivel: NivelRanking
  eixos: EixoRanking[]
  /** Sem score do King: a posição sai só dos outros eixos. */
  semScore: boolean
  entrada: EntradaRanking
}

function limitar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Contribuição do score: linear na escala 200–1500. */
export function pontosDeScore(score: number | null | undefined): number {
  if (score == null) return 0
  const ratio = limitar((score - SCORE_PISO) / (SCORE_TETO - SCORE_PISO), 0, 1)
  return ratio * A_SCORE
}

/** Bônus por elogio: satura em POSITIVOS_REF — o 8º elogio não vale o dobro do 4º. */
export function pontosDePositivos(qtd: number): number {
  return limitar(qtd / POSITIVOS_REF, 0, 1) * A_POSITIVOS
}

/** Penalidade de incidentes: o que segue em aberto pesa mais. */
export function pontosDeIncidentes(qtd: number, abertos: number): number {
  return -Math.min(A_INCIDENTE, qtd * CUSTO_INCIDENTE + abertos * CUSTO_EM_ABERTO)
}

export function pontosDeNegativos(qtd: number): number {
  return -Math.min(A_NEGATIVOS, qtd * CUSTO_NEGATIVO)
}

export function nivelDe(pontos: number): NivelRanking {
  if (pontos >= LIMITE_DESTAQUE) return 'destaque'
  if (pontos >= LIMITE_ATENCAO)  return 'regular'
  return 'atencao'
}

/** Ordena do melhor ao pior e devolve cada um com os eixos que o levaram ali.
 *
 *  Empate é resolvido na ordem em que a coordenação pediu os critérios:
 *  score → menos incidentes → mais positivos → nome (para a lista não dançar
 *  entre uma abertura e outra do painel). */
export function ranquear(entradas: EntradaRanking[]): ItemRanking[] {
  const avaliados = entradas.map(e => {
    const eixos: EixoRanking[] = [
      { chave: 'score',      titulo: e.score != null ? `Score ${e.score}` : 'Sem score do King', pontos: pontosDeScore(e.score) },
      { chave: 'positivos',  titulo: `${e.feedbacksPositivos} feedback(s) positivo(s)`,          pontos: pontosDePositivos(e.feedbacksPositivos) },
      { chave: 'incidentes', titulo: `${e.incidentes} incidente(s)${e.incidentesAbertos ? `, ${e.incidentesAbertos} em aberto` : ''}`, pontos: pontosDeIncidentes(e.incidentes, e.incidentesAbertos) },
      { chave: 'negativos',  titulo: `${e.feedbacksNegativos} feedback(s) negativo(s)`,          pontos: pontosDeNegativos(e.feedbacksNegativos) },
    ]
    const pontos = limitar(eixos.reduce((s, x) => s + x.pontos, 0), 0, 100)
    return { entrada: e, professorId: e.professorId, nome: e.nome, pontos, nivel: nivelDe(pontos), eixos, semScore: e.score == null }
  })

  avaliados.sort((a, b) =>
    b.pontos - a.pontos
    || (b.entrada.score ?? -1) - (a.entrada.score ?? -1)
    || a.entrada.incidentes - b.entrada.incidentes
    || b.entrada.feedbacksPositivos - a.entrada.feedbacksPositivos
    || a.nome.localeCompare(b.nome, 'pt-BR'),
  )

  return avaliados.map((x, i) => ({ ...x, posicao: i + 1 }))
}
