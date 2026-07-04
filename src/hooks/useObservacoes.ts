import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ProfessorAcompanhamento } from '@/hooks/useProfessorAcompanhamento'

/** Foto do professor_acompanhamento + contagem de alunos, congelada no momento
 *  da criação da observação (trigger `capturar_snapshot_observacao`, ver
 *  migration 20260703_observacoes_snapshot.sql). Nunca é re-consultada ao vivo. */
export interface ObservacaoSnapshot extends Omit<ProfessorAcompanhamento, 'professor_id'> {
  quantidade_alunos: number
  acompanhamento_encontrado: boolean
  capturado_em: string
}

export interface ObservacaoDetalhe {
  id: string
  tipo: string
  texto: string
  created_at: string
  resolvido: boolean
  resolvido_em: string | null
  snapshot: ObservacaoSnapshot | null
  professor: { id: string; nome: string } | null
  autor: { nome: string } | null
}

export function useObservacao(id?: string) {
  return useQuery({
    queryKey: ['observacoes', id],
    queryFn: async (): Promise<ObservacaoDetalhe> => {
      const { data, error } = await supabase
        .from('observacoes')
        .select(`
          id, tipo, texto, created_at, snapshot, resolvido, resolvido_em,
          professor:professores!professor_id (id, nome),
          autor:profiles!coordenador_id (nome)
        `)
        .eq('id', id!)
        .single()
      if (error) throw error

      const professor = Array.isArray(data.professor) ? data.professor[0] : data.professor
      const autor = Array.isArray(data.autor) ? data.autor[0] : data.autor

      return {
        id: data.id,
        tipo: data.tipo,
        texto: data.texto,
        created_at: data.created_at,
        resolvido: data.resolvido,
        resolvido_em: data.resolvido_em,
        snapshot: data.snapshot as ObservacaoSnapshot | null,
        professor: professor ?? null,
        autor: autor ?? null,
      }
    },
    enabled: !!id,
  })
}

/** Marca (ou reabre) uma ocorrência — só faz sentido para tipo = 'ocorrencia'. */
export function useResolverObservacao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, resolvido }: { id: string; resolvido: boolean }) => {
      const { error } = await supabase
        .from('observacoes')
        .update({ resolvido, resolvido_em: resolvido ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['observacoes', vars.id] })
      queryClient.invalidateQueries({ queryKey: ['professores'] })
      queryClient.invalidateQueries({ queryKey: ['problemas-abertos'] })
    },
  })
}

/** Professores com questões em aberto — ocorrências criadas no KTM (não
 *  resolvidas) + incidentes do King Nexus (não resolvidos, já com professor
 *  identificado). Alimenta o painel lateral de Acompanhamento. */
export interface ProfessorComProblema {
  professor_id: string
  nome: string
  ocorrencias_abertas: number
  incidentes_abertos: number
  total: number
  ultima_data: string
}

export function useProblemasAbertos() {
  return useQuery({
    queryKey: ['problemas-abertos'],
    queryFn: async (): Promise<ProfessorComProblema[]> => {
      const [{ data: ocorrencias, error: e1 }, { data: incidentes, error: e2 }] = await Promise.all([
        supabase
          .from('observacoes')
          .select('id, created_at, professor:professores!professor_id (id, nome)')
          .eq('tipo', 'ocorrencia')
          .eq('resolvido', false),
        supabase
          .from('nexus_incidents')
          .select('id, created_at, professor:professores!professor_id (id, nome)')
          .eq('resolved', false)
          .not('professor_id', 'is', null),
      ])
      if (e1) throw e1
      if (e2) throw e2

      const porProfessor = new Map<string, ProfessorComProblema>()

      function acumular(rows: { created_at: string; professor: unknown }[], campo: 'ocorrencias_abertas' | 'incidentes_abertos') {
        for (const row of rows) {
          const professor = Array.isArray(row.professor) ? row.professor[0] : row.professor
          const p = professor as { id: string; nome: string } | null
          if (!p) continue

          const atual = porProfessor.get(p.id) ?? {
            professor_id: p.id,
            nome: p.nome,
            ocorrencias_abertas: 0,
            incidentes_abertos: 0,
            total: 0,
            ultima_data: row.created_at,
          }
          atual[campo] += 1
          atual.total += 1
          if (row.created_at > atual.ultima_data) atual.ultima_data = row.created_at
          porProfessor.set(p.id, atual)
        }
      }

      acumular(ocorrencias ?? [], 'ocorrencias_abertas')
      acumular(incidentes ?? [], 'incidentes_abertos')

      return [...porProfessor.values()].sort((a, b) =>
        b.total - a.total || (b.ultima_data > a.ultima_data ? 1 : -1),
      )
    },
  })
}
