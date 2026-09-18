import { useEffect, useState } from 'react'

/**
 * "Agora" em ms, atualizado a cada `intervaloMs` (1 min por padrão).
 *
 * Existe por dois motivos: ler Date.now() no meio da renderização é impuro (o
 * lint barra, e dois renders seguidos podem discordar), e as contagens
 * regressivas dos incidentes ("assumir em 40min") precisam andar sozinhas com
 * a tela aberta, sem esperar outro motivo para re-renderizar.
 */
export function useAgora(intervaloMs = 60_000): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervaloMs)
    return () => clearInterval(id)
  }, [intervaloMs])
  return agora
}
