// ─────────────────────────────────────────────────────────────────────────────
// Token de sessão dos portais do professor, guardado no dispositivo.
//
// Uma sessão só serve para os 4 portais (/welcome-path, /pausa, /transferencia,
// /agendar): ela nasce em `portal-identidade`, depois que o professor digita o
// código enviado ao e-mail oficial. O token é opaco (32 bytes aleatórios) e o
// banco guarda só o SHA-256 dele — ver a migration 20260791.
//
// localStorage e não cookie: o portal é servido do mesmo domínio do app, e
// cookie viajaria junto com as requisições autenticadas da coordenação sem
// necessidade nenhuma.
// ─────────────────────────────────────────────────────────────────────────────

const CHAVE = 'king.portal.token'
/** Chave do Welcome Path antes do código por e-mail. Os tokens dela foram
 *  revogados no banco; apagamos para não ficar lixo no navegador. */
const CHAVE_ANTIGA = 'king.welcomePath.token'

export function lerToken(): string | null {
  try {
    localStorage.removeItem(CHAVE_ANTIGA)
    const t = localStorage.getItem(CHAVE)
    return t && t.length > 20 ? t : null
  } catch {
    // Navegador com storage bloqueado (aba anônima restrita, política de
    // terceiros): o portal segue funcionando, só sem lembrar do professor.
    return null
  }
}

export function gravarToken(token: string): void {
  try {
    localStorage.setItem(CHAVE, token)
  } catch { /* sem storage: a sessão vale só enquanto a aba estiver aberta */ }
}

export function limparToken(): void {
  try {
    localStorage.removeItem(CHAVE)
  } catch { /* nada a fazer */ }
}
