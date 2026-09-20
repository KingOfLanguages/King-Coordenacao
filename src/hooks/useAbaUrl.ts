import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Aba ativa guardada na URL (?aba=…). É o que deixa os links antigos das telas
 * que viraram abas (/pendencias, /pausas…) caírem direto na aba certa, e o sino
 * apontar para ela. Valor fora da lista cai no padrão.
 *
 * Trocar de aba usa `replace` (não empilha histórico) e preserva os outros
 * parâmetros da URL — ex.: /solicitacoes?aba=transferencias&pedido=<id>.
 */
export function useAbaUrl<T extends string>(validas: readonly T[], padrao: T, param = 'aba'): [T, (nova: T) => void] {
  const [params, setParams] = useSearchParams()
  const bruto = params.get(param)
  const atual = (validas as readonly string[]).includes(bruto ?? '') ? (bruto as T) : padrao

  const trocar = useCallback((nova: T) => {
    setParams(p => {
      const n = new URLSearchParams(p)
      if (nova === padrao) n.delete(param)
      else n.set(param, nova)
      return n
    }, { replace: true })
  }, [setParams, padrao, param])

  return [atual, trocar]
}
