import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type PerfilPublico = {
  id: string
  nome: string
  role: string
  ativo: boolean
}

/**
 * Nome/cargo do time interno a partir da view `perfis_publicos`.
 *
 * `profiles` é restrito à própria linha (ou admin) pela RLS, então quem é
 * suporte não consegue resolver o nome de um coordenador por join — a view
 * existe justamente pra isso. Ver migration 20260742_perfis_publicos.sql.
 */
export function usePerfisPublicos() {
  return useQuery({
    queryKey: ['perfis-publicos'],
    queryFn: async (): Promise<PerfilPublico[]> => {
      const { data, error } = await supabase
        .from('perfis_publicos')
        .select('id, nome, role, ativo')
        .order('nome')
      if (error) throw error
      return (data ?? []) as PerfilPublico[]
    },
    staleTime: 10 * 60 * 1000, // o time interno muda raramente
  })
}

/** Mapa id → nome, pra resolver responsável sem join bloqueado por RLS. */
export function useNomesPorPerfilId() {
  const { data, ...rest } = usePerfisPublicos()
  const mapa = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of data ?? []) m.set(p.id, p.nome)
    return m
  }, [data])
  return { mapa, ...rest }
}
