import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type RealizadaPt = { ts: number; professor_id: string | null }
export type DashCoordProf = { id: string; data_inicio: string | null }

export type DashboardCoordData = {
  realizadas: RealizadaPt[]
  profs: DashCoordProf[]
}

/**
 * Dados do Dashboard da Coordenação para um coordenador:
 *  - cada participação realizada (cada professor conta como 1 reunião)
 *  - professores ativos sob responsabilidade do coordenador (p/ as metas)
 */
export function useDashboardCoord(coordId: string | null) {
  return useQuery({
    queryKey: ['dashboard-coord', coordId],
    enabled: !!coordId,
    queryFn: async (): Promise<DashboardCoordData> => {
      const desde = new Date(Date.now() - 130 * 864e5).toISOString()
      const [reunioesRes, profsRes] = await Promise.all([
        supabase
          .from('reunioes')
          .select('id, data, participantes:reuniao_professores(status, professor_id)')
          .eq('coordenador_id', coordId)
          .gte('data', desde),
        supabase
          .from('professores')
          .select('id, data_inicio')
          .eq('coordenador_id', coordId)
          .eq('status', 'ativo'),
      ])
      if (reunioesRes.error) throw reunioesRes.error
      if (profsRes.error)    throw profsRes.error

      const realizadas: RealizadaPt[] = []
      for (const r of (reunioesRes.data ?? []) as {
        data: string
        participantes?: { status: string; professor_id: string | null }[]
      }[]) {
        const ts = new Date(r.data).getTime()
        for (const p of r.participantes ?? []) {
          if (p.status === 'realizada') realizadas.push({ ts, professor_id: p.professor_id })
        }
      }
      return { realizadas, profs: (profsRes.data ?? []) as DashCoordProf[] }
    },
  })
}
