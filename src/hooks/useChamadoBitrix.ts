import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { invocarFuncao } from '@/lib/invocarFuncao'

// ─────────────────────────────────────────────────────────────────────────────
// Chamado no Bitrix a partir de um incidente (20260799 + Edge Function
// bitrix-chamado). A leitura do vínculo é direta na tabela; tudo que fala com o
// Bitrix passa pela função, que é a única que conhece o webhook.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChamadoBitrix {
  incidente_id: string
  /** NULL enquanto a tarefa está sendo criada. */
  bitrix_task_id: number | null
  bitrix_url: string | null
  responsavel_bitrix_id: number
  responsavel_nome: string
  observadores: { id: number; nome: string }[]
  aberto_por: string | null
  aberto_em: string
}

export interface PessoaBitrix { id: number; nome: string; cargo: string }
export interface MembroSuporte extends PessoaBitrix {
  lider: boolean
  /** Líder(es) do time desta pessoa — entram sempre como observadoras. */
  lideres: number[]
}
export interface OpcoesBitrix {
  equipe: MembroSuporte[]
  coordenacao: PessoaBitrix[]
  /** Dono do webhook: as tarefas saem criadas por esta pessoa. */
  criador: { id: number; nome: string } | null
  eu: { id: number; nome: string } | null
  /** Só vem quando `eu` é null: a lista para a pessoa se achar. */
  todos?: PessoaBitrix[]
}

export function useChamadoDoIncidente(incidenteId: string | null | undefined) {
  return useQuery({
    queryKey: ['chamado-bitrix', incidenteId],
    enabled: !!incidenteId,
    queryFn: async (): Promise<ChamadoBitrix | null> => {
      const { data, error } = await supabase
        .from('incidente_chamados_bitrix')
        .select('*')
        .eq('incidente_id', incidenteId!)
        .maybeSingle()
      if (error) throw error
      return data as ChamadoBitrix | null
    },
  })
}

/** Equipe de suporte, coordenação e quem sou eu no Bitrix — vem ao vivo de lá. */
export function useOpcoesBitrix(enabled: boolean) {
  return useQuery({
    queryKey: ['bitrix', 'opcoes'],
    enabled,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: () => invocarFuncao<OpcoesBitrix>('bitrix-chamado', { acao: 'opcoes' }),
  })
}

export function useVincularBitrix() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (bitrixUserId: number) =>
      invocarFuncao<{ eu: { id: number; nome: string } }>('bitrix-chamado', { acao: 'vincular', bitrixUserId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bitrix', 'opcoes'] }),
  })
}

export function useAbrirChamadoBitrix() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { incidenteId: string; responsavelId: number; observadores: number[] }) =>
      invocarFuncao<{ taskId: number; url: string; anexos: number; falhasAnexo: number }>(
        'bitrix-chamado', { acao: 'abrir', ...v },
      ),
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: ['chamado-bitrix', v.incidenteId] }),
  })
}
