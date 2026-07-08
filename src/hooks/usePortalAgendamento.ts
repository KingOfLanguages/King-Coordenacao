import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type OpcaoLink = { elegivel: boolean; link: string | null }
export type OpcaoGrupo = { elegivel: boolean; recomendada: boolean }

export type AvisoAgendamentoRecente = {
  reuniaoProfessorId: string
  data: string
  diasDesdeUltima: number
  diasParaProxima: number
  proximaDataSugerida: string
}

export type PortalLookupResult = {
  professor: { id: string; nome: string } | null
  coordenador: { id: string; nome: string } | null
  ambiguo: boolean
  opcoes: {
    primeira_reuniao: OpcaoLink
    acompanhamento: OpcaoLink
    reuniao_grupo: OpcaoGrupo
  }
  avisoAgendamentoRecente: AvisoAgendamentoRecente | null
}

export type PortalLookupInput = {
  nome: string
  mesInicio?: number
  anoInicio?: number
}

/**
 * Identifica o professor só pelo nome (a maioria não tem e-mail cadastrado).
 * Se `ambiguo` voltar true, reenviar com nome mais completo e/ou mesInicio+anoInicio
 * como desempate — ver comentário de portal-agendamento-lookup/index.ts.
 */
export function usePortalLookup() {
  return useMutation({
    mutationFn: async (input: PortalLookupInput) => {
      const { data, error } = await supabase.functions.invoke('portal-agendamento-lookup', {
        body: input,
      })
      if (error) throw new Error(error.message)
      return data as PortalLookupResult
    },
  })
}

/** Professor declara que a última reunião vinculada (aviso de agendamento
 *  recente) não aconteceu de fato — libera um novo agendamento imediato. */
export function useDeclararNaoFezReuniao() {
  return useMutation({
    mutationFn: async (input: { professorId: string; reuniaoProfessorId: string }) => {
      const { data, error } = await supabase.functions.invoke('portal-agendamento-declarar-nao-fez', {
        body: input,
      })
      if (error) throw new Error(error.message)
      return data as { ok: true }
    },
  })
}
