import { Navigate, useLocation } from 'react-router-dom'

/**
 * Redireciona uma rota antiga para a nova PRESERVANDO a query string e somando
 * os parâmetros fixos (normalmente a aba). Ex.: /transferencias?pedido=X →
 * /solicitacoes?aba=transferencias&pedido=X. O <Navigate> puro descartaria o
 * `pedido`, e é por ele que o aviso do sino abre o pedido certo.
 */
export function Redirecionar({ para, params }: { para: string; params?: Record<string, string> }) {
  const { search, hash } = useLocation()
  const q = new URLSearchParams(search)
  for (const [k, v] of Object.entries(params ?? {})) q.set(k, v)
  const s = q.toString()
  return <Navigate to={`${para}${s ? `?${s}` : ''}${hash}`} replace />
}
