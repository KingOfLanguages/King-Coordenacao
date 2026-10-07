import { useMutation, useQuery } from '@tanstack/react-query'
import { invocarFuncao } from '@/lib/invocarFuncao'

// Portal de pausa (`portal-pausa`). Quem é o professor vem do token da sessão
// (`portal-identidade`), nunca de um id mandado daqui.

const invocar = <T,>(body: Record<string, unknown>) => invocarFuncao<T>('portal-pausa', body)

export type PausaEstado = {
  professor: { id: string; nome: string }
  /** Já existe solicitação pendente/em atendimento — não deixa duplicar. */
  pausaAberta: boolean
  jaPausado: boolean
}

export function usePausaEstado(token: string | null) {
  return useQuery({
    queryKey: ['portal', 'pausa', token],
    enabled: !!token,
    retry: false,
    queryFn: () => invocar<PausaEstado>({ acao: 'estado', token }),
  })
}

export type SolicitarPausaInput = {
  token: string
  motivo: string
  /** ISO YYYY-MM-DD — último dia de aula. */
  dataInicio: string
  /** ISO YYYY-MM-DD — dia do contato da coordenação. */
  dataFim: string
}

/** Registra a solicitação de pausa. Erros de validação (data invertida, pausa já
 *  aberta, professor já pausado) voltam com mensagem pronta para exibir. */
export function useSolicitarPausa() {
  return useMutation({
    mutationFn: (input: SolicitarPausaInput) =>
      invocar<{ ok: true; pausaId: string }>({ acao: 'solicitar', ...input }),
  })
}
