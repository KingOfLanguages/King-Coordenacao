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

/** Remove o sufixo de "início/data" que a plataforma às vezes gruda no nome do
 *  professor por uma falha no procedimento de cadastro da escola — ex.:
 *  "Fulano de Tal - inicio 18/09". São 140 dos 891 ativos (16%), então numa
 *  lista longa aparece uma linha suja a cada seis.
 *
 *  SÓ EXIBIÇÃO: o dado bruto continua sujo no banco (o kms-api-sync regrava a
 *  cada rodada) e a correção é sempre em tempo de leitura. Espelha o
 *  `semSufixoInicio` das edge functions de portal/agendamento — não dá pra
 *  compartilhar módulo entre Deno e o bundle da web.
 *
 *  Conservador: só corta com o marcador "início" ou uma data solta no fim. */
export function semSufixoInicio(nome: string): string {
  return nome
    .replace(/[\s\-–—(|,:;]+in[íi]cio.*$/i, '')
    .replace(/[\s\-–—(|,:;]+\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\)?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}
