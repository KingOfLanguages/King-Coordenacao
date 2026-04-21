import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { UrgenciaNivel } from '@/types'

export interface PeriodoRelatorio {
  inicio: string   // ISO date-time
  fim:    string   // ISO date-time
}

const INCIDENTE_SELECT = `
  *,
  professores (nome),
  criador:profiles!incidentes_criado_por_fkey (nome)
`

export type IncidenteRel = {
  id:                     string
  tipo:                   string
  descricao:              string
  status:                 string
  urgencia:               UrgenciaNivel
  solucao:                string | null
  responsavel:            string | null
  precisa_acompanhamento: boolean
  created_at:             string
  updated_at?:            string
  professores:            { nome: string } | null
  criador:                { nome: string } | null
}

/**
 * Fetches incidentes filtered to a date range.
 * Used by RelatoriosPage to compute all metrics.
 */
export function useIncidentesPeriodo(periodo: PeriodoRelatorio) {
  return useQuery({
    queryKey: ['relatorios', 'incidentes', periodo.inicio, periodo.fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incidentes')
        .select(INCIDENTE_SELECT)
        .gte('created_at', periodo.inicio)
        .lte('created_at', periodo.fim)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as IncidenteRel[]
    },
    enabled: !!(periodo.inicio && periodo.fim),
  })
}
