// ─────────────────────────────────────────────────────────────────────────────
// Meta de reuniões da coordenação.
//
// Os números vêm do Dashboard do Coordenador, que já media "Por dia — meta 8" e
// "Por semana — meta 40" desde sempre. Aqui eles saem de dentro daquela tela e
// viram a régua compartilhada, para o coordenador ver na própria agenda se o
// dia está de pé — e não só no fim do mês, quando não dá mais para reagir.
//
// A meta é POR COORDENADOR (a agenda de Reuniões é sempre a de um coordenador).
// ─────────────────────────────────────────────────────────────────────────────

/** Reuniões que cada coordenador precisa fazer num dia útil. */
export const META_REUNIOES_DIA = 8

/** Espelho semanal da mesma régua (8 × 5 dias úteis) — usado no Dashboard. */
export const META_REUNIOES_SEMANA = 40

/**
 * Quantos nomes sugerir para cada reunião que falta.
 *
 * 2× porque convite não é reunião: mandar mensagem para 3 professores não
 * fecha 3 horários. Sugerir o dobro do buraco é o mínimo para que a lista tenha
 * chance de fechar o dia, sem virar disparo em massa (que já tem tela própria
 * em /emails).
 */
export const SUGESTOES_POR_FALTA = 2

/** Meta do dia: 0 em sábado e domingo — não se cobra reunião de fim de semana. */
export function metaDoDia(d: Date): number {
  const dow = d.getDay()
  return dow === 0 || dow === 6 ? 0 : META_REUNIOES_DIA
}

/** Quantos nomes sugerir para cobrir `faltam` reuniões. 0 quando nada falta. */
export function sugestoesNecessarias(faltam: number): number {
  return faltam > 0 ? faltam * SUGESTOES_POR_FALTA : 0
}
