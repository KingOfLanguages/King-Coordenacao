import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Tempo de casa ─────────────────────────────────────────────────────────────

/** Meses completos desde a data de início (entrada na empresa). */
export function mesesDeCasa(dataInicio: string | null | undefined): number | null {
  if (!dataInicio) return null
  const inicio = new Date(dataInicio)
  if (isNaN(inicio.getTime())) return null
  const agora = new Date()
  let meses = (agora.getFullYear() - inicio.getFullYear()) * 12
            + (agora.getMonth() - inicio.getMonth())
  if (agora.getDate() < inicio.getDate()) meses -= 1
  return Math.max(0, meses)
}

/** Rótulo amigável do tempo de casa, ex.: "5 meses", "1 ano e 2 meses". */
export function tempoDeCasaLabel(dataInicio: string | null | undefined): string | null {
  const meses = mesesDeCasa(dataInicio)
  if (meses === null) return null
  if (meses < 1)  return 'menos de 1 mês'
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
  const anos  = Math.floor(meses / 12)
  const resto = meses % 12
  const parteAnos = `${anos} ${anos === 1 ? 'ano' : 'anos'}`
  if (resto === 0) return parteAnos
  return `${parteAnos} e ${resto} ${resto === 1 ? 'mês' : 'meses'}`
}
