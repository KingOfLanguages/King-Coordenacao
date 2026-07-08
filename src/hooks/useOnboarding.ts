import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Status de cada dia: 0 = vazio, 1 = agendado, 2 = enviado.
export type StatusDia = 0 | 1 | 2

export type OnboardingRow = {
  id: string
  professor_id: string
  data_inicio: string | null
  dias: StatusDia[]
  observacao: string | null
  professor: {
    id: string
    nome: string
    telefone: string | null
    data_inicio: string | null
    status: string
  } | null
}

/**
 * Lista de acompanhamento de onboarding (7 dias) dos professores recém-chegados.
 * Semeia a lista via RPC (idempotente — traz quem começou nos últimos 10 dias ou
 * começa nos próximos 14) e depois lê as linhas com os dados do professor.
 */
export function useOnboarding() {
  return useQuery({
    queryKey: ['onboarding'],
    queryFn: async (): Promise<OnboardingRow[]> => {
      const { error: rpcErr } = await supabase.rpc('gerar_onboarding_professores')
      if (rpcErr) throw rpcErr

      const { data, error } = await supabase
        .from('onboarding_professores')
        .select(
          'id, professor_id, data_inicio, dias, observacao, ' +
          'professor:professores(id, nome, telefone, data_inicio, status)',
        )
      if (error) throw error

      const rows = (data ?? []) as unknown as OnboardingRow[]
      // Mais recentes primeiro; quem não tem data cai no fim.
      return rows.sort((a, b) => {
        const da = a.professor?.data_inicio ?? a.data_inicio ?? ''
        const db = b.professor?.data_inicio ?? b.data_inicio ?? ''
        if (da !== db) return db.localeCompare(da)
        return (a.professor?.nome ?? '').localeCompare(b.professor?.nome ?? '')
      })
    },
  })
}

/** Atualiza o status dos 7 dias de uma linha (array completo). Otimista. */
export function useAtualizarDiasOnboarding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, dias }: { id: string; dias: StatusDia[] }) => {
      const { error } = await supabase
        .from('onboarding_professores')
        .update({ dias })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, dias }) => {
      await queryClient.cancelQueries({ queryKey: ['onboarding'] })
      const anterior = queryClient.getQueryData<OnboardingRow[]>(['onboarding'])
      queryClient.setQueryData<OnboardingRow[]>(['onboarding'], (old) =>
        (old ?? []).map(r => (r.id === id ? { ...r, dias } : r)),
      )
      return { anterior }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.anterior) queryClient.setQueryData(['onboarding'], ctx.anterior)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding'] })
    },
  })
}

/** Grava o telefone no cadastro do professor (via RPC — suporte também pode). */
export function useDefinirTelefone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ professorId, telefone }: { professorId: string; telefone: string }) => {
      const { error } = await supabase.rpc('definir_telefone_professor', {
        p_professor_id: professorId,
        p_telefone: telefone,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding'] })
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}

/** Adiciona manualmente um professor ao acompanhamento. */
export function useAdicionarOnboarding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ professorId, dataInicio }: { professorId: string; dataInicio: string | null }) => {
      const { error } = await supabase
        .from('onboarding_professores')
        .insert({ professor_id: professorId, data_inicio: dataInicio })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding'] })
    },
  })
}

/** Remove um professor do acompanhamento (não apaga o professor). */
export function useRemoverOnboarding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('onboarding_professores')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding'] })
    },
  })
}
