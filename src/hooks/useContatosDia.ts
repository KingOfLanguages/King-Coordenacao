import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type ContatoDia = {
  id: string
  professor_id: string
  enviado: boolean
  enviado_em: string | null
  professor: { id: string; nome: string; email: string | null } | null
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Lista diária (até 20) de professores a contatar pelo coordenador.
 * Gera a lista via RPC (idempotente — 1x por dia) e depois lê os registros de hoje.
 */
export function useContatosHoje(coordenadorId: string | null) {
  return useQuery({
    queryKey: ['contatos-dia', coordenadorId],
    enabled: !!coordenadorId,
    queryFn: async (): Promise<ContatoDia[]> => {
      const { error: rpcErr } = await supabase.rpc('gerar_contatos_dia', {
        p_coordenador_id: coordenadorId,
      })
      if (rpcErr) throw rpcErr

      const { data, error } = await supabase
        .from('contatos_diarios')
        .select('id, professor_id, enviado, enviado_em, professor:professores(id, nome, email)')
        .eq('coordenador_id', coordenadorId)
        .eq('data', hojeISO())
      if (error) throw error

      const lista = (data ?? []) as unknown as ContatoDia[]
      return lista.sort((a, b) => {
        if (a.enviado !== b.enviado) return a.enviado ? 1 : -1
        return (a.professor?.nome ?? '').localeCompare(b.professor?.nome ?? '')
      })
    },
  })
}

export function useMarcarContato() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, enviado }: { id: string; enviado: boolean }) => {
      const { error } = await supabase
        .from('contatos_diarios')
        .update({ enviado, enviado_em: enviado ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contatos-dia'] })
    },
  })
}
