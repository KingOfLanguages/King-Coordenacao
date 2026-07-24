import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// Central de Convocações — fila Kanban de convocação de REUNIÃO (tabela
// `convocacoes`). O fluxo de agendas bloqueadas NÃO passa por aqui: vem da API
// King / Central de Pendências ([[usePendencias]]).
// ─────────────────────────────────────────────────────────────────────────────

export type EtapaConvocacao   = 'pendente_contato' | 'aguardando_resposta' | 'agendada' | 'realizada'
export type OrigemConvocacao  = 'incidente' | 'observacao' | 'feedback' | 'periodica' | 'coordenacao'

export const ETAPAS_CONVOCACAO: { id: EtapaConvocacao; titulo: string; emoji: string }[] = [
  { id: 'pendente_contato',    titulo: 'Pendente de contato', emoji: '📥' },
  { id: 'aguardando_resposta', titulo: 'Aguardando resposta', emoji: '📨' },
  { id: 'agendada',            titulo: 'Reunião agendada',     emoji: '📅' },
  { id: 'realizada',           titulo: 'Reunião realizada',    emoji: '✅' },
]

export const ORIGEM_LABEL: Record<OrigemConvocacao, string> = {
  incidente:   'Incidente',
  observacao:  'Observação',
  feedback:    'Feedback',
  periodica:   'Reunião periódica',
  coordenacao: 'Solicitação da coordenação',
}

export interface Convocacao {
  id: string
  professor_id: string
  professor_nome: string
  professor_telefone: string | null
  origem: OrigemConvocacao
  motivo: string | null
  etapa: EtapaConvocacao
  coordenador_id: string | null
  ultima_mensagem_em: string | null
  created_at: string
}

type ProfRaw = { nome: string; telefone: string | null }
type ConvRaw = {
  id: string; professor_id: string; origem: OrigemConvocacao; motivo: string | null
  etapa: EtapaConvocacao; coordenador_id: string | null
  ultima_mensagem_em: string | null; created_at: string
  professor: ProfRaw | ProfRaw[] | null
}
const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

export function useConvocacoes() {
  return useQuery({
    queryKey: ['convocacoes'],
    queryFn: async (): Promise<Convocacao[]> => {
      const { data, error } = await supabase
        .from('convocacoes')
        .select(`
          id, professor_id, origem, motivo, etapa, coordenador_id, ultima_mensagem_em, created_at,
          professor:professores!professor_id ( nome, telefone )
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as ConvRaw[]).map((r): Convocacao => {
        const p = um(r.professor)
        return {
          id: r.id,
          professor_id: r.professor_id,
          professor_nome: p?.nome ?? '—',
          professor_telefone: p?.telefone ?? null,
          origem: r.origem,
          motivo: r.motivo,
          etapa: r.etapa,
          coordenador_id: r.coordenador_id,
          ultima_mensagem_em: r.ultima_mensagem_em,
          created_at: r.created_at,
        }
      })
    },
  })
}

export function useCriarConvocacao() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (v: { professor_id: string; origem: OrigemConvocacao; motivo?: string | null }) => {
      const { error } = await supabase.from('convocacoes').insert({
        professor_id: v.professor_id,
        origem: v.origem,
        motivo: v.motivo?.trim() || null,
        criado_por: profile?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['convocacoes'] }),
  })
}

export function useMoverEtapaConvocacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; etapa: EtapaConvocacao }) => {
      const { error } = await supabase.from('convocacoes').update({ etapa: v.etapa }).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['convocacoes'] }),
  })
}

/** Marca a mensagem como enviada (agora) e, se ainda pendente, avança para "aguardando resposta". */
export function useMarcarMensagemConvocacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; etapaAtual: EtapaConvocacao }) => {
      const patch: Record<string, unknown> = { ultima_mensagem_em: new Date().toISOString() }
      if (v.etapaAtual === 'pendente_contato') patch.etapa = 'aguardando_resposta'
      const { error } = await supabase.from('convocacoes').update(patch).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['convocacoes'] }),
  })
}

export function useExcluirConvocacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('convocacoes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['convocacoes'] }),
  })
}
