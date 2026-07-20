import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface NexusIncidente {
  id: string
  problem_type: string
  urgency: string
  description: string
  solution: string
  needs_follow_up: boolean
  resolved: boolean
  resolved_at: string | null
  under_analysis: boolean
  incident_mode: string
  created_at: string
  /** null em linhas antigas — tratado como 'desafio' (ver useIncidentes.natureza). */
  natureza: 'informe' | 'desafio' | null
}

export interface NexusTracking {
  message_stage: number
  first_message_sent: boolean
  first_message_date: string | null
  second_message_sent: boolean
  second_message_date: string | null
  third_message_sent: boolean
  third_message_date: string | null
  next_message_due: string | null
  forwarded_to_coordination: boolean
  forwarded_to_coordination_date: string | null
  problem_resolved: boolean
  resolved_at: string | null
  recurrence_count: number
  last_recurrence_at: string | null
}

export interface NexusAlerta {
  id: string
  level: string
  total_count: number
  created_at: string
}

/** Dados do King Nexus (app de ocorrências) para um professor — ver [[ktm-nexus-sync]]. */
export function useNexusDados(professorId?: string) {
  return useQuery({
    queryKey: ['nexus-dados', professorId],
    queryFn: async () => {
      const [{ data: incidentes, error: e1 }, { data: tracking, error: e2 }, { data: alertas, error: e3 }] =
        await Promise.all([
          supabase
            .from('nexus_incidents')
            .select('id, problem_type, urgency, description, solution, needs_follow_up, resolved, resolved_at, under_analysis, incident_mode, created_at, natureza')
            .eq('professor_id', professorId!)
            .order('created_at', { ascending: false }),
          supabase
            .from('nexus_teacher_tracking')
            .select('message_stage, first_message_sent, first_message_date, second_message_sent, second_message_date, third_message_sent, third_message_date, next_message_due, forwarded_to_coordination, forwarded_to_coordination_date, problem_resolved, resolved_at, recurrence_count, last_recurrence_at')
            .eq('professor_id', professorId!)
            .order('updated_at', { ascending: false })
            .limit(1),
          supabase
            .from('nexus_mes_analise_alerts')
            .select('id, level, total_count, created_at')
            .eq('professor_id', professorId!)
            .order('created_at', { ascending: false }),
        ])
      if (e1) throw e1
      if (e2) throw e2
      if (e3) throw e3

      return {
        incidentes: (incidentes ?? []) as NexusIncidente[],
        tracking: (tracking?.[0] ?? null) as NexusTracking | null,
        alertas: (alertas ?? []) as NexusAlerta[],
      }
    },
    enabled: !!professorId,
  })
}
