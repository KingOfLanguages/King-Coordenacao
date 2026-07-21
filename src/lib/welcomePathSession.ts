// ─────────────────────────────────────────────────────────────────────────────
// Token de sessão do portal do Welcome Path, guardado no dispositivo.
//
// A trilha se estende por dias: obrigar o professor a redigitar o e-mail toda
// visita seria atrito puro. O token é opaco (32 bytes aleatórios), vale 30 dias
// deslizantes e o banco guarda só o SHA-256 dele — ver a migration 20260739.
//
// localStorage e não cookie: o portal é servido do mesmo domínio do app, e
// cookie viajaria junto com as requisições autenticadas da coordenação sem
// necessidade nenhuma.
// ─────────────────────────────────────────────────────────────────────────────

const CHAVE = 'king.welcomePath.token'

export function lerToken(): string | null {
  try {
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
