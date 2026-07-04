import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const PROBLEM_TYPE_MES_ANALISE = 'Mês de análise'

/** Categorias fixas — mesma nomenclatura observada nos dados herdados do Nexus. */
export const CATEGORIAS_INCIDENTE = [
  'Aluno',
  'Administrativo',
  'Didático',
  'Dúvida',
  'Erros de lançamento',
  'Financeiro',
  'Muitas faltas',
  'Muitas pendências',
  'No-Show',
  'Ocorrência',
  'Organização',
  'Plataforma',
  'Profissionalismo',
  'Reclamação',
  'Suporte',
  'Outro',
] as const

export interface Incidente {
  id: string
  professor_id: string | null
  teacher_name: string
  coordinator: string
  problem_type: string
  urgency: string
  description: string
  solution: string
  needs_follow_up: boolean
  resolved: boolean
  resolved_at: string | null
  created_at: string
}

const SELECT_INCIDENTE = 'id, professor_id, teacher_name, coordinator, problem_type, urgency, description, solution, needs_follow_up, resolved, resolved_at, created_at'

/** Todos os incidentes — com ou sem professor vinculado ("desafios"). Mês de
 *  Análise fica de fora, já tem fluxo e tela própria (ver useMesAnalise.ts). */
export function useIncidentes() {
  return useQuery({
    queryKey: ['incidentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nexus_incidents')
        .select(SELECT_INCIDENTE)
        .neq('problem_type', PROBLEM_TYPE_MES_ANALISE)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Incidente[]
    },
  })
}

export function useCriarIncidente() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      problem_type: string
      urgency: string
      description: string
      needs_follow_up: boolean
      professor_id?: string | null
      /** Rótulo livre quando não há professor vinculado (o "desafio") — cai no problem_type se vazio. */
      titulo_livre?: string
    }) => {
      let teacherName: string
      if (input.professor_id) {
        const { data: professor, error: e0 } = await supabase
          .from('professores').select('nome').eq('id', input.professor_id).maybeSingle()
        if (e0) throw e0
        if (!professor) throw new Error('Professor não encontrado.')
        teacherName = professor.nome
      } else {
        teacherName = input.titulo_livre?.trim() || input.problem_type
      }

      const nowIso = new Date().toISOString()
      const { error } = await supabase.from('nexus_incidents').insert({
        id: crypto.randomUUID(),
        teacher_name: teacherName,
        coordinator: profile?.nome ?? 'KTM',
        problem_type: input.problem_type,
        urgency: input.urgency,
        description: input.description.trim(),
        solution: '',
        needs_follow_up: input.needs_follow_up,
        resolved: false,
        resolved_at: null,
        under_analysis: false,
        incident_mode: input.professor_id ? 'professor' : 'interno',
        image_urls: [],
        created_at: nowIso,
        professor_id: input.professor_id ?? null,
        synced_at: nowIso,
      })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['incidentes'] })
      if (vars.professor_id) qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}

export function useResolverIncidente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, solution }: { id: string; solution: string; professor_id?: string | null }) => {
      const { error } = await supabase
        .from('nexus_incidents')
        .update({ resolved: true, resolved_at: new Date().toISOString(), solution: solution.trim() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['incidentes'] })
      if (vars.professor_id) qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}

export function useReabrirIncidente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; professor_id?: string | null }) => {
      const { error } = await supabase
        .from('nexus_incidents')
        .update({ resolved: false, resolved_at: null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['incidentes'] })
      if (vars.professor_id) qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}
