import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Professor } from '@/types'

// ─── Basic list ───────────────────────────────────────────────────────────────

export function useProfessores() {
  return useQuery({
    queryKey: ['professores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select('*')
        .order('nome')
      if (error) throw error
      return data as Professor[]
    },
  })
}

export function useProfessoresAtivos() {
  return useQuery({
    queryKey: ['professores', 'ativos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select('*')
        .eq('saiu', false)
        .eq('pausa', false)
        .order('nome')
      if (error) throw error
      return data as Professor[]
    },
  })
}

// ─── List with counters ───────────────────────────────────────────────────────

export type ProfessorComContadores = Professor & {
  _negativos:  number
  grupo?:       { id: string; nome: string } | null
  coordenador?: { id: string; nome: string } | null
}

export function useProfessoresComContadores() {
  return useQuery({
    queryKey: ['professores', 'contadores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select(`
          *,
          grupo:grupos!grupo_id (id, nome),
          coordenador:profiles!coordenador_id (id, nome),
          observacoes (id, tipo)
        `)
        .eq('saiu', false)
        .eq('pausa', false)
        .order('nome')
      if (error) throw error

      return (data ?? []).map(p => {
        const obs = (p.observacoes ?? []) as { id: string; tipo: string }[]
        return {
          ...p,
          _negativos: obs.filter(o => o.tipo === 'feedback_negativo').length,
        } as ProfessorComContadores
      })
    },
  })
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export function useProfessor(id: string) {
  return useQuery({
    queryKey: ['professores', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select(`
          *,
          grupo:grupos!grupo_id (id, nome),
          coordenador:profiles!coordenador_id (id, nome),
          reuniao_professores (
            id, status, numero, observacao, confirmado_em,
            confirmado_por:profiles!confirmado_por (nome),
            reuniao:reunioes!reuniao_id (id, data, titulo)
          ),
          observacoes (
            id, tipo, texto, created_at, snapshot, resolvido, resolvido_em,
            profiles (nome)
          )
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

// ─── Professores em pausa (BUG-14) ───────────────────────────────────────────

/** Dados da pausa vigente, quando ela veio pelo sistema de pausas (20260738).
 *  Pausas antigas, herdadas direto do KMS, não têm linha em `pausas` — por isso
 *  tudo aqui é opcional. */
export type ProfessorEmPausa = ProfessorComContadores & {
  _pausa: { motivo: string; data_inicio: string; data_fim: string } | null
}

export function useProfessoresEmPausa() {
  return useQuery({
    queryKey: ['professores', 'pausa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select(`
          *,
          grupo:grupos!grupo_id (id, nome),
          coordenador:profiles!coordenador_id (id, nome),
          observacoes (id, tipo),
          pausas (motivo, data_inicio, data_fim, ativada_em, encerrada_em)
        `)
        .eq('saiu', false)
        .eq('pausa', true)
        .order('nome')
      if (error) throw error

      type PausaEmbutida = {
        motivo: string; data_inicio: string; data_fim: string
        ativada_em: string | null; encerrada_em: string | null
      }

      return (data ?? []).map(p => {
        const obs = (p.observacoes ?? []) as { id: string; tipo: string }[]
        const pausas = (p.pausas ?? []) as PausaEmbutida[]
        const vigente = pausas.find(x => x.ativada_em && !x.encerrada_em) ?? null
        return {
          ...p,
          _negativos: obs.filter(o => o.tipo === 'feedback_negativo').length,
          _pausa: vigente
            ? { motivo: vigente.motivo, data_inicio: vigente.data_inicio, data_fim: vigente.data_fim }
            : null,
        } as ProfessorEmPausa
      })
    },
  })
}

// ─── Retorno de pausa ─────────────────────────────────────────────────────────
//
// Tirar da pausa virou a RPC `encerrar_pausa` (useEncerrarPausa, em usePausas.ts).
// O UPDATE direto que existia aqui deixou de funcionar: com o sistema de pausas
// (20260738), o professor pausado tem `status_manual = true`, e nesse estado o
// trigger `sync_professor_status` reverte qualquer mudança de status. A RPC solta
// a trava antes de gravar e ainda fecha a linha em `pausas` na mesma transação.

/** Encerra o acompanhamento: libera a trava (o KMS volta a governar o status). */
export function useConcluirAcompanhamentoPausa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('professores')
        .update({ status_manual: false, despausado_em: null, despausado_por: null })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Nada foi atualizado — sem permissão para encerrar o acompanhamento.')
      }
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['professores'] })
      queryClient.invalidateQueries({ queryKey: ['professores', id] })
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCriarProfessor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (professor: {
      nome: string
      data_inicio?: string | null
      tempo_na_king?: string | null
      renda?: string | null
    }) => {
      const { error } = await supabase.from('professores').insert({
        ...professor,
        monitoramento: false,
        pausa:         false,
        saiu:          false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}

export function useAtualizarMonitoramento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, monitoramento }: { id: string; monitoramento: boolean }) => {
      const { error } = await supabase
        .from('professores')
        .update({ monitoramento })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}

// ─── Troca de grupo (herda o coordenador do novo grupo) ───────────────────────

export function useAtualizarGrupoProfessor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, grupo_id }: { id: string; grupo_id: string }) => {
      // Busca o coordenador do grupo de destino para herdar como responsável.
      const { data: grupo, error: gErr } = await supabase
        .from('grupos')
        .select('coordenador_id')
        .eq('id', grupo_id)
        .single()
      if (gErr) throw gErr

      const { error } = await supabase
        .from('professores')
        .update({ grupo_id, coordenador_id: grupo?.coordenador_id ?? null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}
