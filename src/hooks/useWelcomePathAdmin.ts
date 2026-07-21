import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Lado da COORDENAÇÃO do Welcome Path — dentro do app, com sessão do Supabase.
//
// Leitura direta nas tabelas (RLS libera SELECT para qualquer autenticado).
// Escrita de conteúdo também é direta (a policy exige pode_gerir_welcome_path).
// Já o que mexe no progresso do professor passa por RPC SECURITY DEFINER: as
// tabelas de progresso/respostas não têm policy de INSERT/UPDATE nenhuma.
// ─────────────────────────────────────────────────────────────────────────────

/** Mesmas chaves da área de materiais da King (KMS) + `imagem` e `html`,
 *  extensões nossas. Ver a migration 20260740. */
export type TipoBlocoAdmin = 'h1' | 'h2' | 'text' | 'video' | 'imagem' | 'callout' | 'html'
export type TipoQuestaoAdmin =
  | 'multipla_escolha' | 'multipla_selecao' | 'verdadeiro_falso' | 'dissertativa'

export type EtapaAdmin = {
  id: string
  ordem: number
  titulo: string
  descricao: string
  ativa: boolean
  obrigatoria: boolean
  nota_minima: number
  prazo_dias: number | null
  liberacao_dia: number | null
  notas_coordenacao: string | null
}

export type BlocoAdmin = {
  id: string
  etapa_id: string
  ordem: number
  tipo: TipoBlocoAdmin
  titulo: string | null
  conteudo: string | null
  url: string | null
  meta: Record<string, unknown>
}

export type QuestaoAdmin = {
  id: string
  etapa_id: string
  bloco_id: string | null
  ordem: number
  tipo: TipoQuestaoAdmin
  enunciado: string
  opcoes: string[]
  corretas: number[]
  explicacao: string | null
  peso: number
  obrigatoria: boolean
}

export type ProgressoAdmin = {
  id: string
  professor_id: string
  etapa_id: string
  iniciada_em: string | null
  concluida_em: string | null
  tempo_segundos: number
  nota: number | null
  tentativas: number
  observacao: string | null
  liberada_manualmente: boolean
  revisao_pendente: boolean
}

export type RespostaAdmin = {
  id: string
  professor_id: string
  questao_id: string
  tentativa: number
  resposta: { opcoes?: number[]; texto?: string }
  correta: boolean | null
  comentario_revisao: string | null
  revisado_em: string | null
  created_at: string
  questao?: {
    id: string; etapa_id: string; ordem: number; tipo: TipoQuestaoAdmin
    enunciado: string; opcoes: string[]; corretas: number[]
  } | null
}

// ─── Conteúdo ─────────────────────────────────────────────────────────────────

/** Todas as etapas, inclusive as inativas — a coordenação precisa vê-las. */
export function useEtapasAdmin() {
  return useQuery({
    queryKey: ['wp-admin', 'etapas'],
    queryFn: async (): Promise<EtapaAdmin[]> => {
      const { data, error } = await supabase
        .from('welcome_path_etapas')
        .select('id, ordem, titulo, descricao, ativa, obrigatoria, nota_minima, prazo_dias, liberacao_dia, notas_coordenacao')
        .order('ordem', { ascending: true })
      if (error) throw error
      return (data ?? []) as EtapaAdmin[]
    },
  })
}

export function useBlocosAdmin(etapaId: string | null) {
  return useQuery({
    queryKey: ['wp-admin', 'blocos', etapaId],
    enabled: !!etapaId,
    queryFn: async (): Promise<BlocoAdmin[]> => {
      const { data, error } = await supabase
        .from('welcome_path_blocos')
        .select('*')
        .eq('etapa_id', etapaId!)
        .order('ordem', { ascending: true })
      if (error) throw error
      return (data ?? []) as BlocoAdmin[]
    },
  })
}

export function useQuestoesAdmin(etapaId: string | null) {
  return useQuery({
    queryKey: ['wp-admin', 'questoes', etapaId],
    enabled: !!etapaId,
    queryFn: async (): Promise<QuestaoAdmin[]> => {
      const { data, error } = await supabase
        .from('welcome_path_questoes')
        .select('*')
        .eq('etapa_id', etapaId!)
        .order('ordem', { ascending: true })
      if (error) throw error
      return (data ?? []) as QuestaoAdmin[]
    },
  })
}

/** Invalida tudo que depende do conteúdo da trilha (inclusive o que o portal lê). */
function useInvalidarConteudo() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['wp-admin'] })
    qc.invalidateQueries({ queryKey: ['wp'] })
  }
}

export function useSalvarEtapa() {
  const invalidar = useInvalidarConteudo()
  return useMutation({
    mutationFn: async ({ id, ...campos }: Partial<EtapaAdmin> & { id: string }) => {
      const { error } = await supabase.from('welcome_path_etapas').update(campos).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidar,
  })
}

export function useCriarEtapa() {
  const invalidar = useInvalidarConteudo()
  return useMutation({
    mutationFn: async (ordem: number) => {
      const { data, error } = await supabase
        .from('welcome_path_etapas')
        .insert({ ordem, titulo: `Etapa ${ordem}`, descricao: '' })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return data.id as string
    },
    onSuccess: invalidar,
  })
}

export function useExcluirEtapa() {
  const invalidar = useInvalidarConteudo()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('welcome_path_etapas').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidar,
  })
}

/** Troca a etapa de lugar com a vizinha. RPC porque a troca precisa das duas
 *  linhas atualizadas na mesma transação. */
export function useMoverEtapa() {
  const invalidar = useInvalidarConteudo()
  return useMutation({
    mutationFn: async ({ id, direcao }: { id: string; direcao: -1 | 1 }) => {
      const { error } = await supabase.rpc('wp_mover_etapa', { p_id: id, p_direcao: direcao })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidar,
  })
}

export function useSalvarBloco() {
  const invalidar = useInvalidarConteudo()
  return useMutation({
    mutationFn: async (bloco: Partial<BlocoAdmin> & { etapa_id: string }) => {
      const { id, ...campos } = bloco
      const { error } = id
        ? await supabase.from('welcome_path_blocos').update(campos).eq('id', id)
        : await supabase.from('welcome_path_blocos').insert(campos)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidar,
  })
}

export function useExcluirBloco() {
  const invalidar = useInvalidarConteudo()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('welcome_path_blocos').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidar,
  })
}

export function useSalvarQuestao() {
  const invalidar = useInvalidarConteudo()
  return useMutation({
    mutationFn: async (questao: Partial<QuestaoAdmin> & { etapa_id: string }) => {
      const { id, ...campos } = questao
      const { error } = id
        ? await supabase.from('welcome_path_questoes').update(campos).eq('id', id)
        : await supabase.from('welcome_path_questoes').insert(campos)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidar,
  })
}

export function useExcluirQuestao() {
  const invalidar = useInvalidarConteudo()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('welcome_path_questoes').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidar,
  })
}

// ─── Progresso dos professores ────────────────────────────────────────────────

/** Todo o progresso da trilha, de todos os professores. A tabela é pequena
 *  (professores em onboarding × etapas), então uma leitura só evita N queries. */
export function useProgressoTodos() {
  return useQuery({
    queryKey: ['wp-admin', 'progresso'],
    queryFn: async (): Promise<ProgressoAdmin[]> => {
      const { data, error } = await supabase
        .from('welcome_path_progresso')
        .select('*')
      if (error) throw error
      return (data ?? []) as ProgressoAdmin[]
    },
  })
}

/** Respostas de um professor numa etapa, com a questão junto — é o que a
 *  coordenação lê para revisar dissertativa e ver onde ele tropeçou. */
export function useRespostasProfessor(professorId: string | null, etapaId: string | null) {
  return useQuery({
    queryKey: ['wp-admin', 'respostas', professorId, etapaId],
    enabled: !!professorId && !!etapaId,
    queryFn: async (): Promise<RespostaAdmin[]> => {
      const { data: questoes, error: errQ } = await supabase
        .from('welcome_path_questoes')
        .select('id, etapa_id, ordem, tipo, enunciado, opcoes, corretas')
        .eq('etapa_id', etapaId!)
        .order('ordem', { ascending: true })
      if (errQ) throw errQ
      if (!questoes?.length) return []

      const { data, error } = await supabase
        .from('welcome_path_respostas')
        .select('*')
        .eq('professor_id', professorId!)
        .in('questao_id', questoes.map(q => q.id))
        .order('tentativa', { ascending: false })
      if (error) throw error

      const porId = new Map(questoes.map(q => [q.id, q]))
      return ((data ?? []) as RespostaAdmin[]).map(r => ({ ...r, questao: porId.get(r.questao_id) ?? null }))
    },
  })
}

function useAcaoProgresso<T>(rpc: string, args: (input: T) => Record<string, unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: T) => {
      const { error } = await supabase.rpc(rpc, args(input))
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wp-admin'] }),
  })
}

/** Destrava uma etapa fora da ordem para um professor específico. */
export function useLiberarEtapa() {
  return useAcaoProgresso<{ professorId: string; etapaId: string }>(
    'wp_liberar_etapa',
    ({ professorId, etapaId }) => ({ p_professor_id: professorId, p_etapa_id: etapaId }),
  )
}

/** Zera a etapa para o professor refazer (apaga as respostas). */
export function useResetarEtapa() {
  return useAcaoProgresso<{ professorId: string; etapaId: string }>(
    'wp_resetar_etapa',
    ({ professorId, etapaId }) => ({ p_professor_id: professorId, p_etapa_id: etapaId }),
  )
}

/** Corrige uma dissertativa; a própria função recalcula a nota da etapa. */
export function useRevisarResposta() {
  return useAcaoProgresso<{ respostaId: string; correta: boolean; comentario?: string }>(
    'wp_revisar_resposta',
    ({ respostaId, correta, comentario }) => ({
      p_resposta_id: respostaId,
      p_correta: correta,
      p_comentario: comentario ?? null,
    }),
  )
}
