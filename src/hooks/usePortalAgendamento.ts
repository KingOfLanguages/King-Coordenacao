import { useMutation, useQuery } from '@tanstack/react-query'
import { invocarFuncao } from '@/lib/invocarFuncao'

/** Uma agenda oferecida pra um tipo de reunião: quem atende e o link dele. */
export type AgendaOpcao = { coordenador: { id: string; nome: string | null }; link: string }

export type OpcaoLink = {
  elegivel: boolean
  /** = agendas[0].link. Mantido porque a function antiga só mandava este. */
  link: string | null
  /** Uma por coordenador atendendo — mais de uma em período de cobertura com
   *  vários substitutos (20260816). Ausente se a function for anterior a ela. */
  agendas?: AgendaOpcao[]
}
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

/** Cobertura vigente (20260814): o coordenador titular está ausente e outro —
 *  ou mais de um, desde a 20260816 — atende o grupo. As agendas em `opcoes` já
 *  são as de quem está cobrindo; isto aqui é só pra tela dizer com quem o
 *  professor vai falar e até quando. */
export type CoberturaPortal = {
  /** Todos os que atendem no período, em ordem de nome. */
  substitutos?: { id: string; nome: string | null }[]
  /** = substitutos[0]. Mantido porque a function antiga só mandava este. */
  substituto: { id: string; nome: string | null }
  /** Último dia da cobertura, inclusive (YYYY-MM-DD). */
  fim: string
}

export type PortalLookupResult = {
  /** `kingsCircle` desde 20260802: membro recebe as boas-vindas VIP. */
  professor: { id: string; nome: string; kingsCircle?: boolean }
  coordenador: { id: string; nome: string } | null
  opcoes: {
    primeira_reuniao: OpcaoLink
    acompanhamento: OpcaoLink
    reuniao_grupo: OpcaoGrupo
  }
  avisoAgendamentoRecente: AvisoAgendamentoRecente | null
  /** Ausente se a function do servidor for de antes da 20260814. */
  cobertura?: CoberturaPortal | null
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
