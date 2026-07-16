// ─────────────────────────────────────────────────────────────────────────────
// Índice de Prioridade do painel de Acompanhamento.
//
// Combina score, quantidade de aulas pendentes e dias de acúmulo num único
// número (maior = mais crítico) que ordena a lista do caso mais grave ao menos.
//
// Princípios (pedido da coordenação):
//  • Muitas pendências que se arrastam por vários dias > score só moderadamente baixo.
//  • Score EXTREMAMENTE baixo eleva muito a prioridade, mesmo com poucas pendências.
//  • 1 dia de pendência não deve passar na frente de um score extremamente baixo.
//  • Quanto mais sobem juntas quantidade e tempo, mais peso a pendência ganha.
//
// Tudo ajustável nas constantes abaixo — sem tocar na lógica.
// ─────────────────────────────────────────────────────────────────────────────

// Score: penalidade não-linear, íngreme só no fundo da escala (200–1500).
const SCORE_TETO = 1000   // acima disto, score não gera prioridade
const SCORE_PISO = 200    // fundo da escala de score
const SCORE_EXP  = 1.8    // >1 → só scores muito baixos disparam forte
const SCORE_K    = 100    // amplitude do peso de score

// Pendência: interação multiplicativa qtd × dias — só pesa forte quando as duas sobem.
const DIAS_REF = 12       // referência de dias (≈ 3º estágio da régua de pendências)
const QTD_REF  = 10       // referência de quantidade de aulas pendentes
const PEND_K   = 100      // amplitude do peso de pendência

/** Peso do score: 0 quando score ≥ SCORE_TETO ou ausente; cresce (curva) ao cair. */
export function pesoScore(score: number | null | undefined): number {
  if (score == null) return 0
  const deficit = Math.max(0, SCORE_TETO - score)
  const ratio = Math.min(1, deficit / (SCORE_TETO - SCORE_PISO))
  return Math.pow(ratio, SCORE_EXP) * SCORE_K
}

/** Peso da pendência: 0 sem pendência; cresce com quantidade E dias juntos. */
export function pesoPendencia(qtd: number, dias: number): number {
  if (qtd <= 0 || dias <= 0) return 0
  return (dias / DIAS_REF) * (qtd / QTD_REF) * PEND_K
}

/** Índice de Prioridade (maior = mais crítico). */
export function calcularPrioridade(
  score: number | null | undefined,
  qtdPendencias: number,
  diasPendencia: number,
): number {
  return pesoScore(score) + pesoPendencia(qtdPendencias, diasPendencia)
}

// ─── Níveis (rótulo + cor a partir do número) ────────────────────────────────

export type NivelPrioridadeId = 'critica' | 'alta' | 'media' | 'baixa'

export interface NivelPrioridade {
  id: NivelPrioridadeId
  label: string
  tagClass: string   // pílula (bg + texto)
  dotClass: string   // dot indicador
  ordem: number      // p/ agrupar/ordenar (maior = mais crítico)
}

const NIVEIS: Record<NivelPrioridadeId, Omit<NivelPrioridade, 'id'>> = {
  critica: { label: 'Crítica', tagClass: 'bg-urg-highBg text-urg-highFg',      dotClass: 'bg-urg-highFg', ordem: 3 },
  alta:    { label: 'Alta',    tagClass: 'bg-urg-medBg text-urg-medFg',        dotClass: 'bg-urg-medFg',  ordem: 2 },
  media:   { label: 'Média',   tagClass: 'bg-accentBlue-soft text-accentBlue', dotClass: 'bg-accentBlue', ordem: 1 },
  baixa:   { label: 'Baixa',   tagClass: 'bg-surface-subtle text-ink-muted',   dotClass: 'bg-ink-subtle', ordem: 0 },
}

// Limiares de corte do número → nível (ajustáveis).
// CRITICA = 80 faz um score próximo do piso (≈ ≤ 270) já cair em "Crítica"
// sozinho, sem depender de pendências — como pede a regra de score extremo.
const LIMIAR_CRITICA = 80
const LIMIAR_ALTA    = 45
const LIMIAR_MEDIA   = 18

export function nivelIdPara(valor: number): NivelPrioridadeId {
  if (valor >= LIMIAR_CRITICA) return 'critica'
  if (valor >= LIMIAR_ALTA)    return 'alta'
  if (valor >= LIMIAR_MEDIA)   return 'media'
  return 'baixa'
}

/** Ordem de exibição/agrupamento: do mais crítico ao menos. */
export const NIVEIS_ORDEM: NivelPrioridadeId[] = ['critica', 'alta', 'media', 'baixa']

export function nivelInfo(id: NivelPrioridadeId): NivelPrioridade {
  return { id, ...NIVEIS[id] }
}

export function nivelPrioridade(valor: number): NivelPrioridade {
  return nivelInfo(nivelIdPara(valor))
}
