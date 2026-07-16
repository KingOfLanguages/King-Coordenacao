// ─────────────────────────────────────────────────────────────────────────────
// Portal público de agendamento — o link que os professores usam para marcar
// reuniões (sem login), em https://…/agendar.
//
// Fixado no domínio de produção (sobrescritível por VITE_PUBLIC_BASE_URL) de
// propósito: o link enviado aos professores NÃO pode herdar a URL onde o
// coordenador está navegando — senão vazaria uma URL de preview da Vercel
// (protegida por login e congelada num build antigo) ou localhost.
// ─────────────────────────────────────────────────────────────────────────────

export const PORTAL_BASE_URL =
  import.meta.env.VITE_PUBLIC_BASE_URL || 'https://projeto-king-coord.vercel.app'

/** Link público que os professores usam para agendar reuniões (sem login). */
export function linkAgendamentoPublico(): string {
  return `${PORTAL_BASE_URL}/agendar`
}
