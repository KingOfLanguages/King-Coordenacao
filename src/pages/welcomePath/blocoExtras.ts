// ─────────────────────────────────────────────────────────────────────────────
// Helpers dos elementos "extras" do Welcome Path (lista, divisor, botão), usados
// tanto pelo renderizador do professor (Blocos.tsx) quanto pelo editor da
// coordenação (EditarEtapaDialog.tsx). Ficam juntos aqui pela mesma razão do
// callout.ts: o resultado tem que ser idêntico dos dois lados, e um arquivo de
// componente que também exporta constantes quebra o Fast Refresh do Vite.
// ─────────────────────────────────────────────────────────────────────────────

/** Um item por linha; ignora linhas em branco. É como a coordenação digita a
 *  lista no editor e como o portal a quebra em <li>. */
export function itensDaLista(conteudo: string | null | undefined): string[] {
  return (conteudo ?? '').split('\n').map(l => l.trim()).filter(Boolean)
}

/** Lista numerada (ol) x com marcadores (ul). Default: marcadores. */
export function listaOrdenada(meta: Record<string, unknown> | null | undefined): boolean {
  return meta?.ordered === true
}

/** Só http/https viram link clicável — evita `javascript:` e afins num href que
 *  a coordenação cola. Devolve a URL limpa ou null. */
export function linkExterno(url: string | null | undefined): string | null {
  const bruta = (url ?? '').trim()
  if (!bruta) return null
  try {
    const u = new URL(bruta)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

export type BotaoEstilo = 'primario' | 'secundario'

export function botaoEstilo(meta: Record<string, unknown> | null | undefined): BotaoEstilo {
  return meta?.estilo === 'secundario' ? 'secundario' : 'primario'
}

export type DivisorEstilo = 'linha' | 'pontos' | 'espaco'

export function divisorEstilo(meta: Record<string, unknown> | null | undefined): DivisorEstilo {
  const v = meta?.estilo
  return v === 'pontos' || v === 'espaco' ? v : 'linha'
}
