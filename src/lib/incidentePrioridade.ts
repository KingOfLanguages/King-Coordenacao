// ─────────────────────────────────────────────────────────────────────────────
// Prioridade de incidentes e informes — fonte única da tela.
//
// Quatro níveis (Urgente, Alta, Média, Baixa), cada um com um critério objetivo
// e dois prazos em dias úteis: até quando alguém precisa AGIR (assumir) e até
// quando o chamado deve estar resolvido. O prazo da 1ª ação é calculado no banco
// (incidente_prazo_primeira_acao, migration 20260784); o de resolução é
// sugerido aqui e fica editável. Os dois mapas precisam andar juntos.
//
// Por que existe: em 2026-09, 37% dos desafios eram "Crítico" (32 deles Bugs),
// a Média demorava 6 dias até a primeira ação e a lista era ordenada pela data
// de criação — a prioridade não mudava nada na tela. Agora ela ordena a fila,
// tem critério escrito e o Urgente pede uma frase de justificativa.
// ─────────────────────────────────────────────────────────────────────────────

import { somarDiasUteis } from '@/lib/diasUteis'

export type Prioridade = 'Urgente' | 'Alta' | 'Média' | 'Baixa'

/** Do mais grave para o mais leve — ordem de exibição em seletores e placar. */
export const PRIORIDADES: readonly Prioridade[] = ['Urgente', 'Alta', 'Média', 'Baixa']

interface MetaPrioridade {
  /** Maior = mais grave. Usado na ordenação da fila. */
  peso: number
  /** Quando usar, em linguagem de quem está registrando. */
  criterio: string
  /** O mesmo nível lido como importância de um informe (que não tem prazo). */
  importancia: string
  /** Prazo da 1ª ação, por extenso, já com a preposição ("em 2 horas úteis",
   *  "no mesmo dia útil"). O cálculo mora no banco. */
  primeiraAcao: string
  /** Dias úteis até resolver, contados a partir do dia seguinte ao registro. */
  diasResolucao: number
  /** Prazo de resolução, por extenso. */
  resolucao: string
  /** Chip (fundo + texto) — par urg-*Bg/urg-*Fg, legível nos dois temas. */
  chip: string
  /** Cor sólida (barra lateral, ponto). */
  cor: string
}

export const PRIORIDADE_META: Record<Prioridade, MetaPrioridade> = {
  Urgente: {
    peso: 4,
    criterio: 'Alguém está impedido agora: a aula não acontece, a plataforma está fora, ou há risco de cancelamento, jurídico ou de segurança.',
    importancia: 'Pede ação imediata. Se é isso, o certo é abrir um chamado.',
    primeiraAcao: 'em 2 horas úteis',
    diasResolucao: 1,
    resolucao: 'até o fim do próximo dia útil',
    chip: 'bg-urg-critBg text-urg-critFg',
    cor: 'bg-urg-critFg',
  },
  Alta: {
    peso: 3,
    criterio: 'Afeta professor ou aluno nos próximos dias. Alguém precisa agir ainda hoje.',
    importancia: 'A coordenação precisa saber hoje.',
    primeiraAcao: 'no mesmo dia útil',
    diasResolucao: 2,
    resolucao: 'em 2 dias úteis',
    chip: 'bg-urg-highBg text-urg-highFg',
    cor: 'bg-urg-highFg',
  },
  Média: {
    peso: 2,
    criterio: 'Precisa de atenção, mas não impede ninguém agora.',
    importancia: 'Vale ler nesta semana.',
    primeiraAcao: 'em 2 dias úteis',
    diasResolucao: 5,
    resolucao: 'em 5 dias úteis',
    chip: 'bg-urg-medBg text-urg-medFg',
    cor: 'bg-urg-medFg',
  },
  Baixa: {
    peso: 1,
    criterio: 'Pode esperar: acompanhamento, organização ou melhoria.',
    importancia: 'Só registro.',
    primeiraAcao: 'em 5 dias úteis',
    diasResolucao: 10,
    resolucao: 'em 10 dias úteis',
    chip: 'bg-urg-lowBg text-urg-lowFg',
    cor: 'bg-urg-lowFg',
  },
}

/** Valor salvo → nível. "Crítico"/"Crítica" (antes de 2026-09-18 e do app do
 *  TI) viram Urgente; qualquer coisa desconhecida conta como Média. */
export function normalizarPrioridade(valor: string | null | undefined): Prioridade {
  if (valor === 'Crítico' || valor === 'Crítica') return 'Urgente'
  return (PRIORIDADES as readonly string[]).includes(valor ?? '') ? (valor as Prioridade) : 'Média'
}

export function metaPrioridade(valor: string | null | undefined): MetaPrioridade {
  return PRIORIDADE_META[normalizarPrioridade(valor)]
}

/**
 * Nível sugerido ao escolher a categoria. É só o ponto de partida — a pessoa
 * troca à vontade, e depois de trocar a sugestão para de mexer no campo.
 * Nenhuma categoria sugere Urgente: urgência é do caso, não do tipo.
 */
const SUGESTAO_POR_CATEGORIA: Record<string, Prioridade> = {
  'No-show': 'Alta',            // o professor faltou à 1ª aula do aluno
  'Erros de lançamento': 'Média',
  'Reclamação': 'Alta',
  'Muitas faltas': 'Média',
  'Muitas pendências': 'Média',
  'Problemas didáticos reportados em atendimento': 'Média',
  'Profissionalismo': 'Alta',
  'Organização': 'Baixa',
  'Problemas graves de professores': 'Alta',
  'Questões administrativas': 'Média',
  'Ocorrências gerais': 'Média',
  'Problemas de cadastro de alunos/turmas': 'Alta',
  'Problemas em procedimentos do suporte do aluno': 'Média',
  'Problemas em procedimentos de vendedores': 'Média',
  'Bugs': 'Alta',
  'Melhorias': 'Baixa',
}

export function sugestaoPorCategoria(categoria: string): Prioridade {
  return SUGESTAO_POR_CATEGORIA[categoria] ?? 'Média'
}

/** Prazo de resolução sugerido, "YYYY-MM-DD" (fim do N-ésimo dia útil após hoje).
 *  Espelha incidente_prazo_resolucao() do banco. */
export function prazoResolucaoSugerido(valor: string, base: Date = new Date()): string {
  const amanha = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1)
  const iso = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`
  return somarDiasUteis(iso, metaPrioridade(valor).diasResolucao)
}

// ── Relógio do chamado ──────────────────────────────────────────────────────

export interface PrazoIncidente {
  resolved: boolean
  natureza: string | null
  urgency: string
  prazo_primeira_acao: string | null
  primeira_acao_em: string | null
  prazo_resolucao: string | null
  created_at: string
}

export interface EstadoPrazo {
  /** Qual relógio está valendo agora. */
  etapa: 'primeira_acao' | 'resolucao'
  vencido: boolean
  /** ms até o prazo (negativo = vencido). */
  restanteMs: number
  /** "assumir em 1h20" · "sem 1ª ação há 3h" · "vence em 2 dias" · "atrasado há 1 dia". */
  rotulo: string
}

const HORA = 3_600_000
const DIA = 24 * HORA

/** Duração curta e legível: "40min", "3h", "1h20", "2 dias". */
export function duracaoCurta(ms: number): string {
  const abs = Math.abs(ms)
  if (abs < HORA) return `${Math.max(1, Math.round(abs / 60_000))}min`
  if (abs < DIA) {
    // Arredonda o total de minutos antes de separar: arredondar só os minutos
    // dava "4h60" quando faltavam 4h59m40s.
    const totalMin = Math.round(abs / 60_000)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return m >= 5 && h < 10 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
  }
  const d = Math.round(abs / DIA)
  return d === 1 ? '1 dia' : `${d} dias`
}

function ehInforme(i: Pick<PrazoIncidente, 'natureza'>): boolean {
  return i.natureza === 'informe'
}

/**
 * O relógio que importa AGORA: enquanto ninguém agiu, o da 1ª ação; depois, o
 * da resolução. null para informe, concluído ou chamado sem prazo.
 */
export function estadoPrazo(i: PrazoIncidente, agora = Date.now()): EstadoPrazo | null {
  if (i.resolved || ehInforme(i)) return null

  if (!i.primeira_acao_em && i.prazo_primeira_acao) {
    const restante = new Date(i.prazo_primeira_acao).getTime() - agora
    return {
      etapa: 'primeira_acao',
      vencido: restante < 0,
      restanteMs: restante,
      rotulo: restante < 0
        ? `sem 1ª ação há ${duracaoCurta(restante)}`
        : `assumir em ${duracaoCurta(restante)}`,
    }
  }
  if (i.prazo_resolucao) {
    const restante = new Date(i.prazo_resolucao).getTime() - agora
    return {
      etapa: 'resolucao',
      vencido: restante < 0,
      restanteMs: restante,
      rotulo: restante < 0 ? `atrasado há ${duracaoCurta(restante)}` : `vence em ${duracaoCurta(restante)}`,
    }
  }
  return null
}

/** Algum dos dois prazos já passou? (O da 1ª ação só conta enquanto ninguém agiu.) */
export function estaAtrasado(i: PrazoIncidente, agora = Date.now()): boolean {
  if (i.resolved || ehInforme(i)) return false
  const p1 = !i.primeira_acao_em && i.prazo_primeira_acao && new Date(i.prazo_primeira_acao).getTime() < agora
  const pr = i.prazo_resolucao && new Date(i.prazo_resolucao).getTime() < agora
  return !!(p1 || pr)
}

/**
 * Ordem da fila: atrasados primeiro, depois o nível (Urgente → Baixa), depois o
 * prazo mais próximo, depois o mais antigo. Concluídos vão para o fim. O nível
 * gravado NÃO muda quando atrasa — senão as métricas perderiam a origem.
 */
export function compararPorPrioridade(a: PrazoIncidente, b: PrazoIncidente, agora = Date.now()): number {
  if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
  const atrA = estaAtrasado(a, agora), atrB = estaAtrasado(b, agora)
  if (atrA !== atrB) return atrA ? -1 : 1
  const pesoA = metaPrioridade(a.urgency).peso, pesoB = metaPrioridade(b.urgency).peso
  if (pesoA !== pesoB) return pesoB - pesoA
  const prazoA = estadoPrazo(a, agora)?.restanteMs ?? Infinity
  const prazoB = estadoPrazo(b, agora)?.restanteMs ?? Infinity
  if (prazoA !== prazoB) return prazoA - prazoB
  return a.created_at.localeCompare(b.created_at)
}
