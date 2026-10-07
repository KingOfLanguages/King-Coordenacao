import { useMutation, useQuery } from '@tanstack/react-query'
import { invocarFuncao } from '@/lib/invocarFuncao'

export type OpcaoLink = { elegivel: boolean; link: string | null }
export type OpcaoGrupo = { elegivel: boolean; recomendada: boolean }

export type AvisoAgendamentoRecente = {
  reuniaoProfessorId: string
  data: string
  diasDesdeUltima: number
  diasParaProxima: number
  proximaDataSugerida: string
  /** min/max dias de cadência: 30-30 (acompanhamento mensal, 1º-3º mês) ou 30-60 (flexível, >3 meses). */
  janela: { min: number; max: number }
}

export type PortalLookupResult = {
  professor: { id: string; nome: string }
  coordenador: { id: string; nome: string } | null
  opcoes: {
    primeira_reuniao: OpcaoLink
    acompanhamento: OpcaoLink
    reuniao_grupo: OpcaoGrupo
  }
  avisoAgendamentoRecente: AvisoAgendamentoRecente | null
}

/**
 * Opções de agendamento do professor da sessão (`portal-agendamento-lookup`).
 * Quem é o professor vem do token (`portal-identidade`), nunca de um nome ou
 * e-mail mandado daqui.
 */
export function useOpcoesAgendamento(token: string | null) {
  return useQuery({
    queryKey: ['portal', 'agendamento', token],
    enabled: !!token,
    retry: false,
    queryFn: () => invocarFuncao<PortalLookupResult>('portal-agendamento-lookup', { token }),
  })
}

/** Professor declara que a última reunião vinculada (aviso de agendamento
 *  recente) não aconteceu de fato — libera um novo agendamento imediato. */
export function useDeclararNaoFezReuniao() {
  return useMutation({
    mutationFn: (input: { token: string; reuniaoProfessorId: string }) =>
      invocarFuncao<{ ok: true }>('portal-agendamento-declarar-nao-fez', input),
  })
}
