// ─────────────────────────────────────────────────────────────────────────────
// Paleta das tags de onboarding.
//
// Cores em hex (aplicadas por style inline) e não classes do Tailwind: a cor é
// dado do banco, e o JIT do Tailwind só gera classes que aparecem escritas no
// código. Os pares fundo/texto são os mesmos das faixas de urgência do tema —
// fundo claro + texto escuro, legíveis nos dois modos.
// ─────────────────────────────────────────────────────────────────────────────

export type TagCorId =
  | 'cinza' | 'vermelho' | 'laranja' | 'amarelo'
  | 'verde' | 'azul' | 'roxo' | 'rosa'

export type TagCor = { id: TagCorId; label: string; bg: string; fg: string }

export const TAG_CORES: TagCor[] = [
  { id: 'cinza',    label: 'Cinza',    bg: '#e5e7ec', fg: '#474850' },
  { id: 'vermelho', label: 'Vermelho', bg: '#fad4d8', fg: '#ae1122' },
  { id: 'laranja',  label: 'Laranja',  bg: '#fbe0c0', fg: '#894800' },
  { id: 'amarelo',  label: 'Amarelo',  bg: '#f7eeb4', fg: '#6f5500' },
  { id: 'verde',    label: 'Verde',    bg: '#d3eedf', fg: '#0e6430' },
  { id: 'azul',     label: 'Azul',     bg: '#dde8ff', fg: '#1d3fae' },
  { id: 'roxo',     label: 'Roxo',     bg: '#ecd6f7', fg: '#6b1a8f' },
  { id: 'rosa',     label: 'Rosa',     bg: '#fbd9ea', fg: '#9c1458' },
]

export const TAG_COR_PADRAO: TagCorId = 'azul'

/** Cor pelo id gravado no banco; cai no padrão se vier nula ou desconhecida. */
export function corDaTag(id: string | null | undefined): TagCor {
  return TAG_CORES.find(c => c.id === id) ?? TAG_CORES.find(c => c.id === TAG_COR_PADRAO)!
}
