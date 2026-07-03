import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const PROBLEM_TYPE = 'Mês de análise'

// ─── Mês de Análise — lista (Pendentes / Concluídos) ──────────────────────────

export interface MesAnaliseIncidente {
  id: string
  professor_id: string | null
  teacher_name: string
  coordinator: string
  urgency: string
  description: string
  solution: string
  resolved: boolean
  resolved_at: string | null
  created_at: string
}

export function useMesAnaliseIncidentes() {
  return useQuery({
    queryKey: ['mes-analise', 'incidentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nexus_incidents')
        .select('id, professor_id, teacher_name, coordinator, urgency, description, solution, resolved, resolved_at, created_at')
        .eq('problem_type', PROBLEM_TYPE)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as MesAnaliseIncidente[]
    },
  })
}

// ─── Sugestões automáticas (mesma lógica do Nexus, agrupada por professor_id) ─

export const MES_ANALISE_TRIGGER_TYPES = [
  'No-Show', 'Muitas pendências', 'Muitas faltas', 'Reclamação', 'Profissionalismo', 'Organização',
] as const

const TYPE_WEIGHTS: Record<string, number> = { 'No-Show': 2, 'Reclamação': 2 }
function pesoPorTipo(tipo: string): number { return TYPE_WEIGHTS[tipo] ?? 1 }

export type MesAnaliseNivel = 'critico' | 'alerta' | 'observacao'

function nivelPorScore(score: number): MesAnaliseNivel | null {
  if (score >= 5) return 'critico'
  if (score >= 3) return 'alerta'
  if (score >= 2) return 'observacao'
  return null
}

export interface MesAnaliseSugestao {
  professor_id: string
  professor_nome: string
  totalCount: number
  score: number
  nivel: MesAnaliseNivel
  porTipo: { tipo: string; quantidade: number }[]
  ultimoIncidenteEm: string
  incidentes: MesAnaliseIncidente[]
}

export function useMesAnaliseSugestoes() {
  return useQuery({
    queryKey: ['mes-analise', 'sugestoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nexus_incidents')
        .select('id, professor_id, teacher_name, coordinator, problem_type, urgency, description, solution, resolved, resolved_at, created_at')
        .in('problem_type', [...MES_ANALISE_TRIGGER_TYPES, PROBLEM_TYPE])
      if (error) throw error
      const rows = (data ?? []) as (MesAnaliseIncidente & { problem_type: string })[]

      const jaEmAnalise = new Set(
        rows
          .filter(r => r.problem_type === PROBLEM_TYPE && !r.resolved && r.professor_id)
          .map(r => r.professor_id!),
      )

      const triggerSet = new Set<string>(MES_ANALISE_TRIGGER_TYPES)
      const negativos = rows.filter(r => triggerSet.has(r.problem_type))
      const semIdentificacao = negativos.filter(r => !r.professor_id).length

      const grupos = new Map<string, (MesAnaliseIncidente & { problem_type: string })[]>()
      for (const r of negativos) {
        if (!r.professor_id || jaEmAnalise.has(r.professor_id)) continue
        const arr = grupos.get(r.professor_id) ?? []
        arr.push(r)
        grupos.set(r.professor_id, arr)
      }

      const professorIds = [...grupos.keys()]
      let nomes = new Map<string, string>()
      if (professorIds.length) {
        const { data: profs } = await supabase.from('professores').select('id, nome').in('id', professorIds)
        nomes = new Map((profs ?? []).map(p => [p.id, p.nome]))
      }

      const sugestoes: MesAnaliseSugestao[] = []
      for (const [professorId, lista] of grupos) {
        const score = lista.reduce((s, i) => s + pesoPorTipo(i.problem_type), 0)
        const nivel = nivelPorScore(score)
        if (!nivel) continue

        const porTipoMap = new Map<string, number>()
        for (const i of lista) porTipoMap.set(i.problem_type, (porTipoMap.get(i.problem_type) ?? 0) + 1)
        const porTipo = [...porTipoMap.entries()]
          .map(([tipo, quantidade]) => ({ tipo, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade)

        const ordenados = [...lista].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        sugestoes.push({
          professor_id: professorId,
          professor_nome: nomes.get(professorId) ?? 'Professor não encontrado',
          totalCount: lista.length,
          score,
          nivel,
          porTipo,
          ultimoIncidenteEm: ordenados[0].created_at,
          incidentes: ordenados,
        })
      }
      sugestoes.sort((a, b) => b.score - a.score)

      return { sugestoes, semIdentificacao }
    },
  })
}

// ─── Alunos KMS em lote (evita N+1 na listagem) ───────────────────────────────

export interface AlunoKms {
  professor_id: string
  aluno_id: number
  primeiro_nome: string | null
  data_adicao: string | null
  status_vinculo: string | null
}

export function useAlunosKmsPorProfessores(professorIds: string[]) {
  return useQuery({
    queryKey: ['mes-analise', 'alunos-kms', [...professorIds].sort()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professor_alunos_kms')
        .select('professor_id, aluno_id, primeiro_nome, data_adicao, status_vinculo')
        .in('professor_id', professorIds)
      if (error) throw error
      return (data ?? []) as AlunoKms[]
    },
    enabled: professorIds.length > 0,
  })
}

// ─── Mutations — escrevem no Nexus via Edge Function ──────────────────────────

/** supabase-js só expõe error.message genérico em erros HTTP da function —
 *  o corpo JSON real ({error: "..."}) vem em error.context (a Response). */
async function invocarMesAnalise<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('nexus-mes-analise', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx) {
      try {
        const parsed = await ctx.clone().json()
        if (parsed?.error) throw new Error(parsed.error)
      } catch { /* corpo não era JSON — usa error.message abaixo */ }
    }
    throw new Error(error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}

export function useColocarEmMesAnalise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { professor_id: string; descricao: string; urgencia?: string }) =>
      invocarMesAnalise<{ ok: true; incident: unknown }>({ action: 'colocar', ...input }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['mes-analise'] })
      qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}

export function useResolverMesAnalise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { incident_id: string; resultado: string; professor_id?: string }) =>
      invocarMesAnalise<{ ok: true; incident: unknown }>({ action: 'resolver', ...input }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['mes-analise'] })
      if (vars.professor_id) qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}

export function useReabrirMesAnalise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { incident_id: string; professor_id?: string }) =>
      invocarMesAnalise<{ ok: true; incident: unknown }>({ action: 'reabrir', ...input }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['mes-analise'] })
      if (vars.professor_id) qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}
