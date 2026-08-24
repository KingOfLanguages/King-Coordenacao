// ─────────────────────────────────────────────────────────────────────────────
// Ranking de desempenho do professor — do melhor ao pior.
//
// Nasceu para a REUNIÃO EM GRUPO: com ~10 professores na mesma chamada, a
// coordenação precisa saber em segundos quem está indo bem e quem precisa de
// atenção, sem abrir o perfil de um por um.
//
// Eixos, na ordem de peso pedida pela coordenação:
//   1. SCORE do King — a régua oficial da escola (escala 200–1500).
//   2. INCIDENTES — menos é melhor.
//   3. FEEDBACKS POSITIVOS — mais é melhor.
//   4. ALUNOS e TEMPO DE CASA — lastro, peso 2 e 1 (ver abaixo).
// O feedback NEGATIVO entra junto como contrapeso: contar elogio e ignorar
// reclamação enviesaria o ranking inteiro.
//
// POR QUE ALUNOS E TEMPO DE CASA (João, 2026-08-24): o score do King SATURA no
// teto. Medido na base inteira, 259 dos 891 professores ativos cravam 1500 com
// zero incidente — pelos três eixos originais eles empatam em 60 pontos exatos e
// o desempate cai no NOME, ou seja, um terço do ranking sairia em ordem
// alfabética. Carteira de alunos (peso 2) e tempo de casa (peso 1) são o lastro
// que separa "1500 com 14 alunos há dois anos" de "1500 com 2 alunos há um mês".
// Efeito colateral bem-vindo: com eles o teto prático sobe de 60 para 81, e a
// faixa 'destaque' (72) deixa de ser inalcançável — antes NINGUÉM a atingia.
//
// Princípios (herdados de confiabilidade.ts):
//  • Nada de caixa-preta: cada ponto sai de um eixo nomeado, exibido na tela.
//    Se a coordenação discordar da ordem, dá pra apontar a linha.
//  • Bugs/Melhorias (aba Plataforma) NÃO contam: são chamados de TI abertos
//    "sobre" o professor, não falhas dele. Mês de Análise também fica fora —
//    é consequência, não causa.
//  • Estrela de aluno NÃO entra: não discrimina (87% dos professores acima de
//    1300 têm 4,9+). O que entra é COMENTÁRIO positivo, que é volume real.
//  • Data de início IMPLAUSÍVEL não vira tempo de casa. 18 dos 891 ativos têm
//    `data_inicio` no futuro ou no ano 0001 (placeholder do cadastro). Tratar
//    lixo como "muito antigo" premiaria o erro, então ele vira DESCONHECIDO e o
//    eixo simplesmente não pontua.
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
const A_ALUNOS    = 14   // lastro de carteira — peso 2
const A_CASA      = 7    // lastro de tempo de casa — peso 1 (metade de A_ALUNOS)

/** Custo de cada incidente e de cada um que segue sem solução. */
const CUSTO_INCIDENTE = 5, CUSTO_EM_ABERTO = 3
/** Custo de cada feedback negativo. */
const CUSTO_NEGATIVO = 6
/** Quantos feedbacks positivos na janela já valem o bônus cheio. */
const POSITIVOS_REF = 4
/** Carteira que já vale o bônus cheio de alunos. É o p90 da base (mediana 5,
 *  p75 8, máx 26): acima disso a diferença deixa de significar mais lastro. */
const ALUNOS_REF = 12
/** Tempo de casa que já vale o bônus cheio, em meses. Dois anos é onde a
 *  coordenação considera o professor estabelecido; 108 ativos passam disso. */
const CASA_REF_MESES = 24
/** Limites de sanidade de `data_inicio`: fora disso é cadastro furado. */
const CASA_MAX_MESES = 360

/** Faixas do rótulo, em pontos finais. */
const LIMITE_DESTAQUE = 72, LIMITE_ATENCAO = 45

export type NivelRanking = 'destaque' | 'regular' | 'atencao'

/** Meses de casa a partir da data de início, ou null se a data não for crível.
 *  Compartilhado para que a web (que lê da RPC) e a extensão (que lê direto de
 *  `professores`) nunca discordem sobre o tempo de casa do mesmo professor. */
export function mesesDeCasa(dataInicio: string | null | undefined, hoje = new Date()): number | null {
  if (!dataInicio) return null
  const t = Date.parse(dataInicio.length <= 10 ? `${dataInicio}T12:00:00` : dataInicio)
  if (Number.isNaN(t)) return null
  const meses = (hoje.getTime() - t) / (86_400_000 * 30.44)
  if (meses < 0 || meses > CASA_MAX_MESES) return null // futuro ou ano 0001
  return meses
}

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
  /** Alunos ativos na carteira HOJE (o roster é reescrito a cada sync). */
  alunos: number
  /** Data de início crua — a sanidade é feita por `mesesDeCasa`. */
  dataInicio: string | null
}

/** Uma parcela do resultado — o "porquê" da posição. */
export interface EixoRanking {
  chave: 'score' | 'positivos' | 'incidentes' | 'negativos' | 'alunos' | 'casa'
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
  /** Meses de casa já sanitizados; null = data de início não confiável. */
  meses: number | null
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

/** Lastro de carteira: satura em ALUNOS_REF — o 20º aluno não vale o dobro do 12º. */
export function pontosDeAlunos(qtd: number): number {
  return limitar(qtd / ALUNOS_REF, 0, 1) * A_ALUNOS
}

/** Lastro de tempo de casa. Data implausível não pontua (não é o mesmo que zero
 *  meses: é desconhecido, e premiar cadastro furado seria pior). */
export function pontosDeCasa(meses: number | null): number {
  if (meses == null) return 0
  return limitar(meses / CASA_REF_MESES, 0, 1) * A_CASA
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
    const meses = mesesDeCasa(e.dataInicio)
    const eixos: EixoRanking[] = [
      { chave: 'score',      titulo: e.score != null ? `Score ${e.score}` : 'Sem score do King', pontos: pontosDeScore(e.score) },
      { chave: 'positivos',  titulo: `${e.feedbacksPositivos} feedback(s) positivo(s)`,          pontos: pontosDePositivos(e.feedbacksPositivos) },
      { chave: 'incidentes', titulo: `${e.incidentes} incidente(s)${e.incidentesAbertos ? `, ${e.incidentesAbertos} em aberto` : ''}`, pontos: pontosDeIncidentes(e.incidentes, e.incidentesAbertos) },
      { chave: 'negativos',  titulo: `${e.feedbacksNegativos} feedback(s) negativo(s)`,          pontos: pontosDeNegativos(e.feedbacksNegativos) },
      { chave: 'alunos',     titulo: `${e.alunos} aluno(s) na carteira`,                          pontos: pontosDeAlunos(e.alunos) },
      { chave: 'casa',       titulo: meses == null ? 'Tempo de casa indefinido' : `${Math.floor(meses)} ${Math.floor(meses) === 1 ? 'mês' : 'meses'} de casa`, pontos: pontosDeCasa(meses) },
    ]
    const pontos = limitar(eixos.reduce((s, x) => s + x.pontos, 0), 0, 100)
    return { entrada: e, professorId: e.professorId, nome: e.nome, pontos, nivel: nivelDe(pontos), eixos, semScore: e.score == null, meses }
  })

  avaliados.sort((a, b) =>
    b.pontos - a.pontos
    || b.entrada.alunos - a.entrada.alunos          // lastro pedido primeiro (peso 2)
    || (b.meses ?? -1) - (a.meses ?? -1)            // depois tempo de casa (peso 1)
    || (b.entrada.score ?? -1) - (a.entrada.score ?? -1)
    || a.entrada.incidentes - b.entrada.incidentes
    || b.entrada.feedbacksPositivos - a.entrada.feedbacksPositivos
    || a.nome.localeCompare(b.nome, 'pt-BR'),
  )

  return avaliados.map((x, i) => ({ ...x, posicao: i + 1 }))
}
