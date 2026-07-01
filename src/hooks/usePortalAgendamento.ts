import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type OpcaoLink = { elegivel: boolean; link: string | null }
export type OpcaoGrupo = { elegivel: boolean; recomendada: boolean }

export type PortalLookupResult = {
  professor: { id: string; nome: string } | null
  coordenador: { id: string; nome: string } | null
  opcoes: {
    primeira_reuniao: OpcaoLink
    acompanhamento: OpcaoLink
    reuniao_grupo: OpcaoGrupo
  }
}

/** Identifica o professor por nome + e-mail e retorna as opções de agendamento elegíveis. */
export function usePortalLookup() {
  return useMutation({
    mutationFn: async ({ nome, email }: { nome: string; email: string }) => {
      const { data, error } = await supabase.functions.invoke('portal-agendamento-lookup', {
        body: { nome, email },
      })
      if (error) throw new Error(error.message)
      return data as PortalLookupResult
    },
  })
}
