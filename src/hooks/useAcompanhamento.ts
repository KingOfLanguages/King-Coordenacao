import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CoordenadorPerfil = {
  id: string
  nome: string
  role: string
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns the list of active coordinators visible to the current user.
 * - Admin / suporte: all active coordenacao + admin profiles
 * - Coordenacao: only themselves (single-item list)
 */
export function useCoordenadores() {
  const { profile } = useAuth()
  const canSeeAll = profile?.role === 'admin'
    || profile?.role === 'suporte'
    || profile?.role === 'suporte_aluno'
    || profile?.is_admin === true
    || profile?.is_lider === true

  return useQuery({
    queryKey: ['coordenadores-acompanhamento', profile?.role, profile?.is_lider, profile?.is_admin],
    queryFn: async (): Promise<CoordenadorPerfil[]> => {
      if (canSeeAll) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, nome, role')
          .in('role', ['coordenacao', 'admin'])
          .eq('ativo', true)
          .order('nome')
        if (error) throw error
        return (data ?? []) as CoordenadorPerfil[]
      }
      // Coordinator sees only themselves
      if (profile) {
        return [{ id: profile.id, nome: profile.nome, role: profile.role }]
      }
      return []
    },
    enabled: !!profile,
    staleTime: 5 * 60 * 1000, // coordinator list doesn't change often
  })
}
