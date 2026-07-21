// ─────────────────────────────────────────────────────────────────────────────
// Formatações curtas que aparecem em várias telas. Ficam aqui (e não junto de
// um componente) porque misturar helpers e componentes no mesmo arquivo quebra
// o Fast Refresh do Vite — a regra react-refresh/only-export-components.
// ─────────────────────────────────────────────────────────────────────────────

/** ISO (YYYY-MM-DD) → DD/MM/AAAA. Fatia a string em vez de passar por Date:
 *  `new Date('2026-07-20')` é meia-noite UTC e vira 19/07 a oeste de Greenwich. */
export function dataBR(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** Iniciais (primeiro + último nome) para avatares. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primeira = partes[0][0]
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

/** Segundos → "45 min" / "2h 10min". */
export function fmtDuracao(segundos: number): string {
  if (!segundos) return '—'
  const min = Math.round(segundos / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto ? `${h}h ${resto}min` : `${h}h`
}

/** Dias inteiros de hoje até uma data ISO. Negativo = já passou. Compara só a
 *  parte de data, então o resultado não muda conforme a hora do dia. */
export function diasAte(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const alvo = Date.UTC(a, m - 1, d)
  const agora = new Date()
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.round((alvo - hoje) / 86_400_000)
}
