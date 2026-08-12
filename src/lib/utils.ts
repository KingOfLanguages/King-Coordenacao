import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Contato ───────────────────────────────────────────────────────────────────

/** Link do WhatsApp a partir de um telefone livre. Só dígitos; assume DDI 55
 *  (Brasil) quando vem sem código de país (≤ 11 dígitos). Retorna null se vazio. */
export function whatsappLink(tel: string | null | undefined): string | null {
  if (!tel) return null
  let d = tel.replace(/\D/g, '')
  if (!d) return null
  if (d.length <= 11) d = '55' + d
  return `https://wa.me/${d}`
}

// ─── Tempo de casa ─────────────────────────────────────────────────────────────

/**
 * Meses completos desde a data de início (entrada na empresa).
 * `ref` permite medir o tempo de casa numa data que não hoje — usado ao apurar
 * metas de períodos passados no Dashboard Geral.
 */
export function mesesDeCasa(dataInicio: string | null | undefined, ref: Date = new Date()): number | null {
  if (!dataInicio) return null
  const inicio = new Date(dataInicio)
  if (isNaN(inicio.getTime())) return null
  let meses = (ref.getFullYear() - inicio.getFullYear()) * 12
            + (ref.getMonth() - inicio.getMonth())
  if (ref.getDate() < inicio.getDate()) meses -= 1
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
