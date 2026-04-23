import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MonitoramentoResultado = 'normal' | 'alta_prioridade' | 'baixa_prioridade'

export type ReuniaoCompleta = {
  id: string
  professor_id: string | null
  coordenador_id: string | null
  data: string
  status: 'pendente' | 'concluida' | 'cancelada'
  google_event_id: string | null
  meet_link: string | null
  notas: string | null
  titulo: string | null
  aconteceu: boolean | null
  monitoramento_resultado: MonitoramentoResultado | null
  created_at: string
  professores: {
    id: string
    nome: string
    monitoramento: boolean
    data_inicio: string | null
    tempo_na_king: string | null
  } | null
  coordenador: { nome: string } | null
  ultima_observacao?: {
    id: string
    tipo: string
    texto: string
    created_at: string
    profiles: { nome: string } | null
  } | null
}

const REUNIAO_SELECT = `
  *,
  professores (id, nome, monitoramento, data_inicio, tempo_na_king),
  coordenador:profiles!coordenador_id (nome)
`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): { inicio: string; fim: string } {
  const d = new Date()
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  const fim    = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}

async function enrichWithLastObs(reunioes: ReuniaoCompleta[]): Promise<ReuniaoCompleta[]> {
  if (!reunioes.length) return []
  const profIds = [...new Set(reunioes.map(r => r.professor_id).filter(Boolean))]
  if (!profIds.length) return reunioes

  const { data: obs } = await supabase
    .from('observacoes')
    .select('id, tipo, texto, created_at, professor_id, profiles(nome)')
    .in('professor_id', profIds)
    .order('created_at', { ascending: false })

  type ObsRow = NonNullable<typeof obs>[number]
  const lastMap: Record<string, ObsRow> = {}
  obs?.forEach(o => {
    if (!lastMap[o.professor_id]) lastMap[o.professor_id] = o
  })

  return reunioes.map(r => {
    const obs = r.professor_id ? (lastMap[r.professor_id] ?? null) : null
    const profiles = obs?.profiles
    return {
      ...r,
      ultima_observacao: obs
        ? {
            id:         obs.id         as string,
            tipo:       obs.tipo       as string,
            texto:      obs.texto      as string,
            created_at: obs.created_at as string,
            profiles:   Array.isArray(profiles) ? (profiles[0] ?? null) : (profiles ?? null),
          }
        : null,
    }
  })
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Reuniões of today for the current coordenador. */
export function useReunioesHoje() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['reunioes', 'hoje', profile?.id],
    queryFn: async () => {
      const { inicio, fim } = today()
      const { data, error } = await supabase
        .from('reunioes')
        .select(REUNIAO_SELECT)
        .eq('coordenador_id', profile!.id)
        .gte('data', inicio)
        .lte('data', fim)
        .order('data')
      if (error) throw error
      return enrichWithLastObs((data ?? []) as ReuniaoCompleta[])
    },
    enabled: !!profile?.id,
  })
}

/** Past meetings (before today) that are still 'pendente'. */
export function useReunioesAtrasadas() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['reunioes', 'atrasadas', profile?.id],
    queryFn: async () => {
      const { inicio } = today()
      const { data, error } = await supabase
        .from('reunioes')
        .select(REUNIAO_SELECT)
        .eq('coordenador_id', profile!.id)
        .eq('status', 'pendente')
        .lt('data', inicio)
        .order('data', { ascending: false })
        .limit(50)
      if (error) throw error
      return enrichWithLastObs((data ?? []) as ReuniaoCompleta[])
    },
    enabled: !!profile?.id,
  })
}

/** Create one meeting (manual or from Google Calendar). */
export function useCriarReuniao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (reuniao: {
      professor_id?: string | null
      coordenador_id: string
      data: string
      notas?: string
      titulo?: string
      google_event_id?: string
      meet_link?: string | null
    }) => {
      // Upsert on google_event_id to avoid duplicates when re-importing
      if (reuniao.google_event_id) {
        const { error } = await supabase
          .from('reunioes')
          .upsert(reuniao, { onConflict: 'google_event_id', ignoreDuplicates: true })
        if (error) throw error
      } else {
        const { error } = await supabase.from('reunioes').insert(reuniao)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes'] })
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}

/** Update meeting fields (status, aconteceu, monitoramento_resultado, notas). */
export function useAtualizarReuniao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      aconteceu,
      monitoramento_resultado,
      notas,
    }: {
      id: string
      status?: 'pendente' | 'concluida' | 'cancelada'
      aconteceu?: boolean
      monitoramento_resultado?: MonitoramentoResultado | null
      notas?: string
    }) => {
      const updates: Record<string, unknown> = {}
      if (status                   !== undefined) updates.status                   = status
      if (aconteceu                !== undefined) updates.aconteceu                = aconteceu
      if (monitoramento_resultado  !== undefined) updates.monitoramento_resultado  = monitoramento_resultado
      if (notas                    !== undefined) updates.notas                    = notas

      const { error } = await supabase.from('reunioes').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reunioes'] }),
  })
}

/**
 * Concludes a meeting in one shot:
 * - Sets status → 'concluida' (or 'cancelada' if !aconteceu)
 * - Saves the observation text
 * - Optionally updates professor.monitoramento
 */
export function useConcluirReuniao() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({
      reuniaoId,
      professorId,
      aconteceu,
      monitoramentoResultado,
      observacao,
    }: {
      reuniaoId:              string
      professorId:            string
      aconteceu:              boolean
      monitoramentoResultado: MonitoramentoResultado
      observacao:             string
    }) => {
      const novoStatus = aconteceu ? 'concluida' : 'cancelada'

      // 1 — Update reunion
      const { error: e1 } = await supabase
        .from('reunioes')
        .update({
          status:                  novoStatus,
          aconteceu,
          monitoramento_resultado: monitoramentoResultado,
        })
        .eq('id', reuniaoId)
      if (e1) throw e1

      // 2 — Save observation
      const { error: e2 } = await supabase.from('observacoes').insert({
        professor_id:   professorId,
        reuniao_id:     reuniaoId,
        coordenador_id: profile!.id,
        tipo:           aconteceu ? 'reuniao' : 'ocorrencia',
        texto:          observacao,
      })
      if (e2) throw e2

      // 3 — If monitoramento changed, update professor
      if (monitoramentoResultado === 'alta_prioridade') {
        await supabase
          .from('professores')
          .update({ monitoramento: true })
          .eq('id', professorId)
      } else if (monitoramentoResultado === 'baixa_prioridade') {
        await supabase
          .from('professores')
          .update({ monitoramento: false })
          .eq('id', professorId)
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['reunioes'] })
      queryClient.invalidateQueries({ queryKey: ['professores', vars.professorId] })
      queryClient.invalidateQueries({ queryKey: ['professores'] })
    },
  })
}

export function useSalvarObservacao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (obs: {
      professor_id: string
      reuniao_id?: string
      coordenador_id: string
      tipo: string
      texto: string
    }) => {
      const { error } = await supabase.from('observacoes').insert(obs)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['professores', vars.professor_id] })
    },
  })
}
