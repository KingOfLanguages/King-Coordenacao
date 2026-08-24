// ─────────────────────────────────────────────────────────────────────────────
// Diagnóstico de confiabilidade do professor (tela do Comercial).
//
// Responde uma pergunta só: "esse teacher é confiável?" — olhando os ÚLTIMOS
// 90 DIAS. Não é o score do King e não substitui o Acompanhamento: é uma leitura
// de RISCO OPERACIONAL pra quem vai indicar/alocar o professor a um aluno novo.
//
// Princípios:
//  • Nada de caixa-preta: cada ponto sai de um sinal nomeado, exibido na tela.
//    O veredito é a soma; se a coordenação discordar, dá pra apontar a linha.
//  • Falha com aluno pesa mais que falha administrativa. No-show de 1ª aula é o
//    pior sinal possível pro comercial — é o aluno novo levando bolo.
//  • Reincidência > volume: repetir a MESMA categoria vale mais que somar
//    incidentes espalhados.
//  • Bugs/Melhorias (aba Plataforma) NÃO contam. São chamados de TI abertos
//    "sobre" o professor, não falhas dele.
//  • Estrela de aluno NÃO vira ponto: 87% dos professores acima de 1300 têm
//    4,9+ — a métrica não discrimina. Aparece na tela como contexto, só.
// ─────────────────────────────────────────────────────────────────────────────

/** Janela de observação, em dias. "Últimos três meses" do pedido do comercial. */
export const JANELA_DIAS = 90

// ── Pesos ────────────────────────────────────────────────────────────────────
// Cada bloco tem teto (CAP) pra que um único tipo de problema não estoure o
// veredito sozinho — "risco" deve exigir mais de um tipo de sinal.

const P_DESAFIO           = 1.5, CAP_DESAFIO      = 6    // chamados abertos sobre o professor
const P_DESAFIO_EM_ABERTO = 1,   CAP_ABERTO       = 3    // ainda sem solução
const P_URG_ALTA          = 1,   P_URG_CRITICA    = 2, CAP_URGENCIA = 4
const P_REINCIDENCIA      = 2,   CAP_REINCIDENCIA = 4    // 2+ vezes a mesma categoria
const P_INFORME           = 0.5, CAP_INFORME      = 2    // registro sem fluxo de resolução
const P_ALUNO_CITADO      = 1,   CAP_ALUNO        = 3    // incidente com aluno nomeado
const P_FEEDBACK_NEGATIVO = 2,   CAP_FEEDBACK     = 4
const P_FALTA             = 1,   CAP_FALTA        = 3
const P_NO_SHOW           = 3,   CAP_NO_SHOW      = 6
const P_TROCA             = 1.5, CAP_TROCA        = 4.5  // aluno pediu pra trocar de professor
const P_AGENDA_BLOQUEADA  = 1
const P_PENDENCIA_MEDIA   = 1,   P_PENDENCIA_ALTA = 2.5
const P_SCORE_ATENCAO     = 1.5, P_SCORE_CRITICO  = 3

/** Aulas pendentes (lançamento) a partir das quais o sinal aparece / agrava. */
const PENDENCIA_MEDIA = 3, PENDENCIA_ALTA = 8

/** Repetir a mesma categoria a partir daqui é reincidência. */
const REINCIDENCIA_MIN = 2

/** Faixas do veredito, em pontos acumulados. */
const LIMITE_ATENCAO = 3, LIMITE_RISCO = 7

/** Volume mínimo pra que a média de estrelas signifique alguma coisa. */
export const AVALIACOES_MINIMAS = 20

// ── Tipos ────────────────────────────────────────────────────────────────────

export type Veredito = 'confiavel' | 'atencao' | 'risco'
export type Tom = 'ok' | 'warn' | 'crit'

export interface IncidenteResumo {
  id: string
  problem_type: string
  urgency: string
  description: string
  aluno_nome: string | null
  natureza: 'informe' | 'desafio'
  resolved: boolean
  created_at: string
  /** Categoria da aba Plataforma (Bugs/Melhorias) — chamado de TI, não é falha do professor. */
  plataforma: boolean
}

export interface EntradaConfiabilidade {
  /** Incidentes do professor DENTRO da janela (os de Plataforma são descartados aqui). */
  incidentes: IncidenteResumo[]
  /** Observações do tipo feedback_negativo na janela. */
  feedbacksNegativos: number
  /** Faltas do professor na janela (datas vindas da API do King). */
  faltas: number
  /** No-show de 1ª aula na janela. */
  noShowPrimeiraAula: number
  /** Trocas de professor pedidas na janela. */
  trocas: number
  /** Retrato de HOJE — o King não guarda histórico diário destes três. */
  aulasPendentes: number
  agendaBloqueada: boolean
  scoreFaixa: string | null
}

export interface Sinal {
  chave: string
  titulo: string
  detalhe?: string
  /** Quanto o sinal soma no veredito. 0 = sinal positivo/contexto. */
  peso: number
  tom: Tom
}

export interface Diagnostico {
  veredito: Veredito
  pontos: number
  alertas: Sinal[]
  positivos: Sinal[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Início da janela de observação. */
export function inicioJanela(dias = JANELA_DIAS, hoje = new Date()): Date {
  const d = new Date(hoje)
  d.setDate(d.getDate() - dias)
  return d
}

/** Data solta da API do King caiu dentro da janela?
 *  Data ausente ou que não dá pra interpretar CONTA: a tela é de risco — melhor
 *  um alerta a mais do que esconder uma falta por causa de formato de string. */
export function dentroDaJanela(data: string | null | undefined, corte: Date): boolean {
  if (!data) return true
  const t = Date.parse(data.length <= 10 ? `${data}T12:00:00` : data)
  if (Number.isNaN(t)) return true
  return t >= corte.getTime()
}

/** Conta os eventos de um alerta do King que caíram na janela.
 *  Sem lista de datas (contrato antigo da API), cai na quantidade cheia —
 *  é o comportamento conservador pra uma leitura de risco. */
export function contarNaJanela(
  alerta: { quantidade?: number; datas?: string[] } | null | undefined,
  corte: Date,
): number {
  if (!alerta) return 0
  const datas = alerta.datas
  if (!Array.isArray(datas) || datas.length === 0) return alerta.quantidade ?? 0
  return datas.filter(d => dentroDaJanela(d, corte)).length
}

/** Soma limitada por teto. */
function capado(valor: number, teto: number): number {
  return Math.min(valor, teto)
}

/** Peso por urgência do chamado. O app do TI escreve "Crítica"; o KTM, "Crítico". */
const PESO_URGENCIA: Record<string, number> = {
  'Crítico': P_URG_CRITICA,
  'Crítica': P_URG_CRITICA,
  'Alta': P_URG_ALTA,
}

// ── Diagnóstico ──────────────────────────────────────────────────────────────

export function diagnosticar(e: EntradaConfiabilidade): Diagnostico {
  const alertas: Sinal[] = []
  const positivos: Sinal[] = []

  // Chamados de TI ficam de fora da conta inteira.
  const relevantes = e.incidentes.filter(i => !i.plataforma)
  const desafios = relevantes.filter(i => i.natureza === 'desafio')
  const informes = relevantes.filter(i => i.natureza === 'informe')
  const abertos  = desafios.filter(i => !i.resolved)

  // 1. Volume de desafios.
  if (desafios.length > 0) {
    alertas.push({
      chave: 'desafios',
      titulo: `${desafios.length} ${desafios.length === 1 ? 'chamado aberto' : 'chamados abertos'} sobre o professor`,
      detalhe: `nos últimos ${JANELA_DIAS} dias`,
      peso: capado(desafios.length * P_DESAFIO, CAP_DESAFIO),
      tom: desafios.length >= 3 ? 'crit' : 'warn',
    })
  }

  // 2. Ainda sem solução.
  if (abertos.length > 0) {
    alertas.push({
      chave: 'em-aberto',
      titulo: `${abertos.length} ainda sem solução`,
      detalhe: abertos.map(i => i.problem_type).join(' · '),
      peso: capado(abertos.length * P_DESAFIO_EM_ABERTO, CAP_ABERTO),
      tom: 'warn',
    })
  }

  // 3. Urgência dos chamados.
  const pesoUrgencia = desafios.reduce((s, i) => s + (PESO_URGENCIA[i.urgency] ?? 0), 0)
  if (pesoUrgencia > 0) {
    const graves = desafios.filter(i => PESO_URGENCIA[i.urgency])
    alertas.push({
      chave: 'urgencia',
      titulo: `${graves.length} de urgência alta ou crítica`,
      detalhe: graves.map(i => `${i.problem_type} (${i.urgency})`).join(' · '),
      peso: capado(pesoUrgencia, CAP_URGENCIA),
      tom: 'crit',
    })
  }

  // 4. Reincidência — mesma categoria repetida.
  const porCategoria = new Map<string, number>()
  for (const i of relevantes) porCategoria.set(i.problem_type, (porCategoria.get(i.problem_type) ?? 0) + 1)
  const reincidentes = [...porCategoria.entries()].filter(([, n]) => n >= REINCIDENCIA_MIN)
  if (reincidentes.length > 0) {
    alertas.push({
      chave: 'reincidencia',
      titulo: `Reincidência em ${reincidentes.length === 1 ? 'uma categoria' : `${reincidentes.length} categorias`}`,
      detalhe: reincidentes.map(([cat, n]) => `${cat} ×${n}`).join(' · '),
      peso: capado(reincidentes.length * P_REINCIDENCIA, CAP_REINCIDENCIA),
      tom: 'crit',
    })
  }

  // 5. Informes (registro sem fluxo de resolução) — sinal fraco, mas acumula.
  if (informes.length > 0) {
    alertas.push({
      chave: 'informes',
      titulo: `${informes.length} ${informes.length === 1 ? 'informe registrado' : 'informes registrados'}`,
      detalhe: 'registros que não exigiram resolução',
      peso: capado(informes.length * P_INFORME, CAP_INFORME),
      tom: 'warn',
    })
  }

  // 6. Incidentes com aluno nomeado — o que o comercial mais sente.
  const comAluno = relevantes.filter(i => !!i.aluno_nome?.trim())
  if (comAluno.length > 0) {
    const distintos = new Set(comAluno.map(i => i.aluno_nome!.trim().toLowerCase())).size
    alertas.push({
      chave: 'aluno-citado',
      titulo: `${comAluno.length} ${comAluno.length === 1 ? 'ocorrência citou um aluno' : 'ocorrências citaram alunos'}`,
      detalhe: `${distintos} aluno${distintos === 1 ? '' : 's'} diferente${distintos === 1 ? '' : 's'}`,
      peso: capado(comAluno.length * P_ALUNO_CITADO, CAP_ALUNO),
      tom: 'warn',
    })
  }

  // 7. Feedback negativo da coordenação (gera convocação automática).
  if (e.feedbacksNegativos > 0) {
    alertas.push({
      chave: 'feedback-negativo',
      titulo: `${e.feedbacksNegativos} feedback negativo da coordenação`,
      detalhe: 'registrado no acompanhamento do professor',
      peso: capado(e.feedbacksNegativos * P_FEEDBACK_NEGATIVO, CAP_FEEDBACK),
      tom: 'crit',
    })
  }

  // 8. Faltas.
  if (e.faltas > 0) {
    alertas.push({
      chave: 'faltas',
      titulo: `${e.faltas} ${e.faltas === 1 ? 'falta' : 'faltas'} do professor`,
      detalhe: `nos últimos ${JANELA_DIAS} dias`,
      peso: capado(e.faltas * P_FALTA, CAP_FALTA),
      tom: e.faltas >= 3 ? 'crit' : 'warn',
    })
  }

  // 9. No-show de 1ª aula — o pior sinal possível pro comercial.
  if (e.noShowPrimeiraAula > 0) {
    alertas.push({
      chave: 'no-show',
      titulo: `${e.noShowPrimeiraAula} no-show de 1ª aula`,
      detalhe: 'aluno novo ficou esperando — o sinal mais grave desta tela',
      peso: capado(e.noShowPrimeiraAula * P_NO_SHOW, CAP_NO_SHOW),
      tom: 'crit',
    })
  }

  // 10. Trocas de professor pedidas.
  if (e.trocas > 0) {
    alertas.push({
      chave: 'trocas',
      titulo: `${e.trocas} ${e.trocas === 1 ? 'troca de professor pedida' : 'trocas de professor pedidas'}`,
      detalhe: `nos últimos ${JANELA_DIAS} dias`,
      peso: capado(e.trocas * P_TROCA, CAP_TROCA),
      tom: 'crit',
    })
  }

  // 11. Aulas pendentes de lançamento (hoje).
  if (e.aulasPendentes >= PENDENCIA_MEDIA) {
    const alta = e.aulasPendentes >= PENDENCIA_ALTA
    alertas.push({
      chave: 'pendencias',
      titulo: `${e.aulasPendentes} aulas pendentes de lançamento`,
      detalhe: 'retrato de hoje · indica desorganização administrativa',
      peso: alta ? P_PENDENCIA_ALTA : P_PENDENCIA_MEDIA,
      tom: alta ? 'crit' : 'warn',
    })
  }

  // 12. Agenda bloqueada (hoje).
  if (e.agendaBloqueada) {
    alertas.push({
      chave: 'agenda',
      titulo: 'Agenda bloqueada',
      detalhe: 'retrato de hoje · não recebe aluno novo enquanto estiver assim',
      peso: P_AGENDA_BLOQUEADA,
      tom: 'warn',
    })
  }

  // 13. Faixa de score do King (hoje).
  const faixa = (e.scoreFaixa ?? '').toLowerCase()
  if (faixa.startsWith('crit')) {
    alertas.push({
      chave: 'score',
      titulo: 'Score na faixa Crítico',
      detalhe: 'retrato de hoje · avaliação da própria King',
      peso: P_SCORE_CRITICO,
      tom: 'crit',
    })
  } else if (faixa.startsWith('aten')) {
    alertas.push({
      chave: 'score',
      titulo: 'Score na faixa Atenção',
      detalhe: 'retrato de hoje · avaliação da própria King',
      peso: P_SCORE_ATENCAO,
      tom: 'warn',
    })
  }

  // ── Sinais positivos (não somam pontos; explicam o "por que confiável") ────
  if (relevantes.length === 0) {
    positivos.push({ chave: 'sem-incidentes', titulo: 'Nenhum incidente registrado na janela', peso: 0, tom: 'ok' })
  } else if (abertos.length === 0) {
    positivos.push({ chave: 'tudo-resolvido', titulo: 'Todos os chamados do período foram resolvidos', peso: 0, tom: 'ok' })
  }
  if (e.noShowPrimeiraAula === 0) positivos.push({ chave: 'sem-no-show', titulo: 'Nenhum no-show de 1ª aula', peso: 0, tom: 'ok' })
  if (e.faltas === 0)            positivos.push({ chave: 'sem-faltas', titulo: 'Nenhuma falta registrada', peso: 0, tom: 'ok' })
  if (e.trocas === 0)            positivos.push({ chave: 'sem-trocas', titulo: 'Nenhum aluno pediu troca de professor', peso: 0, tom: 'ok' })
  if (e.aulasPendentes === 0)    positivos.push({ chave: 'em-dia', titulo: 'Lançamento de aulas em dia', peso: 0, tom: 'ok' })
  if (faixa.startsWith('regular')) positivos.push({ chave: 'score-ok', titulo: 'Score do King na faixa Regular', peso: 0, tom: 'ok' })

  const pontos = Math.round(alertas.reduce((s, a) => s + a.peso, 0) * 10) / 10
  const veredito: Veredito =
    pontos >= LIMITE_RISCO ? 'risco' : pontos >= LIMITE_ATENCAO ? 'atencao' : 'confiavel'

  alertas.sort((a, b) => b.peso - a.peso) // mais grave primeiro

  return { veredito, pontos, alertas, positivos }
}

// ── Apresentação do veredito ─────────────────────────────────────────────────

export const VEREDITO_META: Record<Veredito, {
  titulo: string
  resumo: string
  tagClass: string
  barraClass: string
  textoClass: string
}> = {
  confiavel: {
    titulo: 'Confiável',
    resumo: 'Sem sinais relevantes no período. Pode indicar com tranquilidade.',
    tagClass: 'bg-urg-lowBg text-urg-lowFg',
    barraClass: 'bg-urg-lowFg',
    textoClass: 'text-urg-lowFg',
  },
  atencao: {
    titulo: 'Atenção',
    resumo: 'Tem sinais no período. Vale alinhar com a coordenação antes de indicar.',
    tagClass: 'bg-urg-medBg text-urg-medFg',
    barraClass: 'bg-urg-medFg',
    textoClass: 'text-urg-medFg',
  },
  risco: {
    titulo: 'Risco',
    resumo: 'Sinais graves ou repetidos no período. Não indique sem falar com a coordenação.',
    tagClass: 'bg-urg-highBg text-urg-highFg',
    barraClass: 'bg-urg-highFg',
    textoClass: 'text-urg-highFg',
  },
}
