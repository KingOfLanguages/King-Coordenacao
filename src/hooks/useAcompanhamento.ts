import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CoordenadorPerfil = {
  id: string
  nome: string
  role: string
}

export type ReuniaoAgenda = {
  id: string
  data: string
  status: 'pendente' | 'concluida' | 'cancelada'
  meet_link: string | null
  titulo: string | null
  professor_id: string | null
  aconteceu: boolean | null
  professores: { id: string; nome: string; monitoramento: boolean } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayRange() {
  const d = new Date()
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString()
  const fim    = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString()
  return { inicio, fim }
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

  return useQuery({
    queryKey: ['coordenadores-acompanhamento', profile?.role],
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

/**
 * Returns today's meetings for a specific coordinator.
 * Auto-refreshes every 2 minutes so status stays up to date.
 */
export function useAgendaDia(coordId: string | null) {
  return useQuery({
    queryKey: ['agenda-dia', coordId],
    queryFn: async (): Promise<ReuniaoAgenda[]> => {
      if (!coordId) return []
      const { inicio, fim } = todayRange()
      const { data, error } = await supabase
        .from('reunioes')
        .select('id, data, status, meet_link, titulo, professor_id, aconteceu, professores(id, nome, monitoramento)')
        .eq('coordenador_id', coordId)
        .gte('data', inicio)
        .lte('data', fim)
        .order('data')
      if (error) throw error
      return (data ?? []) as unknown as ReuniaoAgenda[]
    },
    enabled: !!coordId,
    refetchInterval: 2 * 60 * 1000, // live refresh every 2 minutes
  })
}
