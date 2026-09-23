// ─────────────────────────────────────────────────────────────────────────────
// Semana operacional da King: vai de QUARTA a quarta. A semana começa na quarta
// às 00:00 (horário local) e termina na quarta seguinte às 00:00, sem incluí-la —
// ou seja, quarta → terça. Toda conta "da semana" usa [inicio, fim).
// ─────────────────────────────────────────────────────────────────────────────

const QUARTA = 3

/** Quarta-feira 00:00 que abre a semana de `d`. */
export function inicioSemanaKing(d: Date = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const recuo = (x.getDay() - QUARTA + 7) % 7
  x.setDate(x.getDate() - recuo)
  return x
}

/** Soma semanas inteiras a um início de semana (negativo volta). */
export function somarSemanas(inicio: Date, n: number): Date {
  return new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 7 * n)
}

/** Quarta seguinte 00:00 — limite exclusivo da semana. */
export function fimSemanaKing(inicio: Date): Date {
  return somarSemanas(inicio, 1)
}

export function dentroDaSemana(iso: string | null | undefined, inicio: Date): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= inicio.getTime() && t < fimSemanaKing(inicio).getTime()
}

/** "qua 17/09 – ter 23/09" */
export function rotuloSemanaKing(inicio: Date): string {
  const ultimoDia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6)
  const f = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `qua ${f(inicio)} – ter ${f(ultimoDia)}`
}

/** Chave estável para URL: YYYY-MM-DD da quarta que abre a semana. */
export function chaveSemana(inicio: Date): string {
  const m = String(inicio.getMonth() + 1).padStart(2, '0')
  const d = String(inicio.getDate()).padStart(2, '0')
  return `${inicio.getFullYear()}-${m}-${d}`
}

export function semanaDaChave(chave: string | null): Date | null {
  const m = chave?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return inicioSemanaKing(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}
