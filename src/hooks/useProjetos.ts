import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type {
  ProjetoFase, ProjetoNatureza, ProjetoOnde, ProjetoStatus, ProjetoTipo, ProjetoUrgencia,
} from '@/lib/projetos'

// ─────────────────────────────────────────────────────────────────────────────
// Projetos da King — migrations 20260776 e 20260777.
//
// Nada aqui faz join em `profiles`: a RLS da tabela só libera a própria linha,
// então join aninhado volta NULL SEM ERRO ([[ktm-perfis-publicos-rls]]). Os
// nomes são resolvidos na tela pelo mapa de `perfis_publicos`
// (useNomesPorPerfilId), que é a view feita pra isso.
//
// Fluxo de escrita: o projeto NASCE rascunho (o trigger força), recebe etapas e
// anexos, e só então é ENVIADO — um update de status que o banco só aceita com
// a ficha completa. Por isso não existe "criar já enviando".
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET_PROJETOS = 'projetos'

export interface Projeto {
  id: string
  titulo: string
  descricao: string
  tipo: ProjetoTipo
  /** Coluna `prioridade` no banco; na tela se chama Urgência. */
  prioridade: ProjetoUrgencia
  status: ProjetoStatus
  fase: ProjetoFase
  onde_aplicado: ProjetoOnde | null
  caminho: string | null
  objetivo: string | null
  natureza: ProjetoNatureza
  diferenca_hoje: string | null
  passo_a_passo: string | null
  resultado_esperado: string | null
  data_entrega: string | null
  responsavel_id: string | null
  criado_por: string | null
  decidido_por: string | null
  decidido_em: string | null
  motivo_decisao: string | null
  concluido_em: string | null
  created_at: string
  updated_at: string
}

export interface EtapaProjeto {
  id: string
  projeto_id: string
  ordem: number
  titulo: string
  detalhe: string | null
  quem_faz: string | null
  concluida: boolean
  concluida_em: string | null
  created_at: string
}

export interface AnexoProjeto {
  id: string
  projeto_id: string
  nome: string
  caminho: string
  tamanho_bytes: number | null
  autor_id: string | null
  created_at: string
}

export interface PedidoInfo {
  id: string
  projeto_id: string
  pergunta: string
  solicitado_por: string | null
  destinatario_id: string | null
  resposta: string | null
  respondido_por: string | null
  respondido_em: string | null
  created_at: string
}

export interface AtualizacaoProjeto {
  id: string
  projeto_id: string
  texto: string
  autor_id: string | null
  created_at: string
}

const SELECT_PROJETO = `
  id, titulo, descricao, tipo, prioridade, status, fase,
  onde_aplicado, caminho, objetivo, natureza, diferenca_hoje,
  passo_a_passo, resultado_esperado,
  data_entrega, responsavel_id, criado_por, decidido_por, decidido_em,
  motivo_decisao, concluido_em, created_at, updated_at
`

const SELECT_ETAPA  = 'id, projeto_id, ordem, titulo, detalhe, quem_faz, concluida, concluida_em, created_at'
const SELECT_ANEXO  = 'id, projeto_id, nome, caminho, tamanho_bytes, autor_id, created_at'
const SELECT_PEDIDO = `
  id, projeto_id, pergunta, solicitado_por, destinatario_id,
  resposta, respondido_por, respondido_em, created_at
`

// ─── Consultas ───────────────────────────────────────────────────────────────

/** Todos os projetos visíveis (a RLS esconde rascunho dos outros). */
export function useProjetos() {
  return useQuery({
    queryKey: ['projetos'],
    queryFn: async (): Promise<Projeto[]> => {
      const { data, error } = await supabase
        .from('projetos')
        .select(SELECT_PROJETO)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Projeto[]
    },
  })
}

export function useProjeto(id: string | null | undefined) {
  return useQuery({
    queryKey: ['projetos', 'um', id],
    enabled: !!id,
    queryFn: async (): Promise<Projeto | null> => {
      const { data, error } = await supabase
        .from('projetos')
        .select(SELECT_PROJETO)
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return (data as Projeto) ?? null
    },
  })
}

export function useEtapasProjeto(projetoId: string | null | undefined) {
  return useQuery({
    queryKey: ['projetos', 'etapas', projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<EtapaProjeto[]> => {
      const { data, error } = await supabase
        .from('projeto_etapas')
        .select(SELECT_ETAPA)
        .eq('projeto_id', projetoId!)
        .order('ordem', { ascending: true })
      if (error) throw error
      return (data ?? []) as EtapaProjeto[]
    },
  })
}

export function useAnexosProjeto(projetoId: string | null | undefined) {
  return useQuery({
    queryKey: ['projetos', 'anexos', projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<AnexoProjeto[]> => {
      const { data, error } = await supabase
        .from('projeto_anexos')
        .select(SELECT_ANEXO)
        .eq('projeto_id', projetoId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as AnexoProjeto[]
    },
  })
}

/** Pedidos de informação de TODOS os projetos — contam pendência no cabeçalho
 *  e montam a conversa dentro da ficha. */
export function usePedidosInfo() {
  return useQuery({
    queryKey: ['projetos', 'pedidos-info'],
    queryFn: async (): Promise<PedidoInfo[]> => {
      const { data, error } = await supabase
        .from('projeto_pedidos_info')
        .select(SELECT_PEDIDO)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as PedidoInfo[]
    },
  })
}

export function useAtualizacoesProjeto(projetoId: string | null | undefined) {
  return useQuery({
    queryKey: ['projetos', 'atualizacoes', projetoId],
    enabled: !!projetoId,
    queryFn: async (): Promise<AtualizacaoProjeto[]> => {
      const { data, error } = await supabase
        .from('projeto_atualizacoes')
        .select('id, projeto_id, texto, autor_id, created_at')
        .eq('projeto_id', projetoId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as AtualizacaoProjeto[]
    },
  })
}

/** Quantas etapas cada projeto tem — a fila precisa disso pra dizer se a ficha
 *  está completa sem abrir projeto por projeto. */
export function useContagemEtapas() {
  return useQuery({
    queryKey: ['projetos', 'etapas', 'contagem'],
    queryFn: async (): Promise<Map<string, { total: number; feitas: number }>> => {
      const { data, error } = await supabase
        .from('projeto_etapas')
        .select('projeto_id, concluida')
      if (error) throw error
      const m = new Map<string, { total: number; feitas: number }>()
      for (const e of (data ?? []) as { projeto_id: string; concluida: boolean }[]) {
        const at = m.get(e.projeto_id) ?? { total: 0, feitas: 0 }
        at.total += 1
        if (e.concluida) at.feitas += 1
        m.set(e.projeto_id, at)
      }
      return m
    },
  })
}

/** O que a Minha Área mostra: meus projetos (sugeridos ou sob minha
 *  responsabilidade), meus rascunhos e as perguntas esperando resposta minha. */
export function useMeusProjetos() {
  const { profile } = useAuth()
  const meuId = profile?.id ?? null
  const projetos = useProjetos()
  const pedidos = usePedidosInfo()

  const meus = (projetos.data ?? []).filter(
    p => p.criado_por === meuId || p.responsavel_id === meuId,
  )
  const meusIds = new Set(meus.map(p => p.id))
  const todosPedidos = pedidos.data ?? []

  return {
    projetos: meus.filter(p => p.status !== 'rascunho'),
    rascunhos: meus.filter(p => p.status === 'rascunho'),
    /** Perguntas endereçadas a mim e ainda sem resposta. */
    pedidosAbertos: todosPedidos.filter(q => q.destinatario_id === meuId && !q.resposta),
    /** Perguntas (respondidas ou não) dos projetos que são meus. */
    pedidosDosMeus: todosPedidos.filter(q => meusIds.has(q.projeto_id)),
    isLoading: projetos.isLoading || pedidos.isLoading,
  }
}

// ─── Rascunho e ficha ────────────────────────────────────────────────────────

/** Campos da ficha que o autor preenche. Todos opcionais: o rascunho existe
 *  justamente para ser salvo pela metade. */
export interface FichaInput {
  titulo?: string
  descricao?: string
  tipo?: ProjetoTipo
  prioridade?: ProjetoUrgencia
  onde_aplicado?: ProjetoOnde | null
  caminho?: string | null
  objetivo?: string | null
  natureza?: ProjetoNatureza
  diferenca_hoje?: string | null
  passo_a_passo?: string | null
  resultado_esperado?: string | null
  data_entrega?: string | null
}

function limpar(input: FichaInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    patch[k] = typeof v === 'string' ? (v.trim() || null) : v
  }
  // titulo e descricao são NOT NULL no banco — nunca viram null.
  if (patch.titulo === null)    patch.titulo = ''
  if (patch.descricao === null) patch.descricao = ''
  return patch
}

/** Abre um rascunho vazio e devolve o id — é ele que segura etapas e anexos. */
export function useCriarRascunho() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: FichaInput = {}): Promise<Projeto> => {
      const { data, error } = await supabase
        .from('projetos')
        .insert({
          titulo: '', descricao: '',
          ...limpar(input),
          criado_por: profile?.id ?? null,
        })
        .select(SELECT_PROJETO)
        .single()
      if (error) throw error
      return data as Projeto
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

/** Salva o que já foi preenchido, sem enviar. */
export function useSalvarFicha() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: { id: string } & FichaInput) => {
      const patch = limpar(campos)
      if (!Object.keys(patch).length) return
      const { error } = await supabase.from('projetos').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

/** Envia para a liderança. O banco recusa se a ficha estiver incompleta — a
 *  mensagem de erro já vem com a lista do que falta. */
export function useEnviarProjeto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projetos').update({ status: 'proposto' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

// ─── Etapas ──────────────────────────────────────────────────────────────────

export function useAdicionarEtapa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      projetoId: string; titulo: string; detalhe?: string | null; quem_faz?: string | null; ordem: number
    }) => {
      const { error } = await supabase.from('projeto_etapas').insert({
        projeto_id: input.projetoId,
        titulo: input.titulo.trim(),
        detalhe: input.detalhe?.trim() || null,
        quem_faz: input.quem_faz?.trim() || null,
        ordem: input.ordem,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

export function useEditarEtapa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: {
      id: string; titulo?: string; detalhe?: string | null; quem_faz?: string | null
      ordem?: number; concluida?: boolean
    }) => {
      const { error } = await supabase.from('projeto_etapas').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

export function useExcluirEtapa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projeto_etapas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

/** Troca duas etapas de lugar. Sem drag-and-drop: a lista é curta e as setas
 *  funcionam no celular, onde arrastar dentro de um diálogo é sofrível. */
export function useTrocarOrdemEtapas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (par: { a: EtapaProjeto; b: EtapaProjeto }) => {
      const r1 = await supabase.from('projeto_etapas').update({ ordem: par.b.ordem }).eq('id', par.a.id)
      if (r1.error) throw r1.error
      const r2 = await supabase.from('projeto_etapas').update({ ordem: par.a.ordem }).eq('id', par.b.id)
      if (r2.error) throw r2.error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

// ─── Anexos (PDF) ────────────────────────────────────────────────────────────

export const TAMANHO_MAX_ANEXO = 10 * 1024 * 1024
export const MAX_ANEXOS = 3

/** Sobe o PDF pro bucket privado e registra a linha. O caminho leva o id do
 *  projeto na frente pra ficar óbvio a quem pertence o arquivo. */
export function useEnviarAnexo() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ projetoId, file }: { projetoId: string; file: File }) => {
      if (file.type !== 'application/pdf') throw new Error('Só PDF por aqui.')
      if (file.size > TAMANHO_MAX_ANEXO) throw new Error('O arquivo passa de 10 MB.')

      const caminho = `${projetoId}/${crypto.randomUUID()}.pdf`
      const up = await supabase.storage
        .from(BUCKET_PROJETOS)
        .upload(caminho, file, { contentType: 'application/pdf', upsert: false })
      if (up.error) throw up.error

      const { error } = await supabase.from('projeto_anexos').insert({
        projeto_id: projetoId,
        nome: file.name,
        caminho,
        tamanho_bytes: file.size,
        autor_id: profile?.id ?? null,
      })
      // Linha não gravou: tira o arquivo órfão do bucket.
      if (error) {
        await supabase.storage.from(BUCKET_PROJETOS).remove([caminho])
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

export function useExcluirAnexo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (anexo: AnexoProjeto) => {
      const { error } = await supabase.from('projeto_anexos').delete().eq('id', anexo.id)
      if (error) throw error
      await supabase.storage.from(BUCKET_PROJETOS).remove([anexo.caminho])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

/** URL temporária pra abrir o PDF — o bucket é privado de propósito. */
export async function urlAnexo(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_PROJETOS)
    .createSignedUrl(caminho, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

// ─── Decisão e condução ──────────────────────────────────────────────────────

/** Decisão da liderança. O trigger recusa quem não é líder/admin. */
export function useDecidirProjeto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      status: Extract<ProjetoStatus, 'aprovado' | 'recusado' | 'cancelado'>
      motivo?: string | null
      data_entrega?: string | null
      responsavel_id?: string | null
    }) => {
      const patch: Record<string, unknown> = {
        status: input.status,
        motivo_decisao: input.motivo?.trim() || null,
      }
      // Aprovar já define prazo/responsável quando a liderança informou.
      if (input.data_entrega !== undefined)   patch.data_entrega = input.data_entrega || null
      if (input.responsavel_id !== undefined) patch.responsavel_id = input.responsavel_id || null

      const { error } = await supabase.from('projetos').update(patch).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

/** Prazo e responsável — liderança ou o próprio responsável. */
export function useAtualizarConducao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; data_entrega?: string | null; responsavel_id?: string | null }) => {
      const patch: Record<string, unknown> = {}
      if (input.data_entrega !== undefined)   patch.data_entrega = input.data_entrega || null
      if (input.responsavel_id !== undefined) patch.responsavel_id = input.responsavel_id || null
      if (!Object.keys(patch).length) return
      const { error } = await supabase.from('projetos').update(patch).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

export function useMoverFase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fase }: { id: string; fase: ProjetoFase }) => {
      const { error } = await supabase.from('projetos').update({ fase }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

export function useExcluirProjeto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projetos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

// ─── Pedidos de informação e diário ──────────────────────────────────────────

/** Liderança pergunta. Sem destinatário, o trigger manda pro responsável ou
 *  pro autor — e o aviso cai na Minha Área dele. */
export function usePedirInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { projetoId: string; pergunta: string; destinatarioId?: string | null }) => {
      const { error } = await supabase.from('projeto_pedidos_info').insert({
        projeto_id: input.projetoId,
        pergunta: input.pergunta.trim(),
        destinatario_id: input.destinatarioId || null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

export function useResponderInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, resposta }: { id: string; resposta: string }) => {
      const { error } = await supabase
        .from('projeto_pedidos_info')
        .update({ resposta: resposta.trim() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

export function useAdicionarAtualizacao() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ projetoId, texto }: { projetoId: string; texto: string }) => {
      const { error } = await supabase.from('projeto_atualizacoes').insert({
        projeto_id: projetoId,
        texto: texto.trim(),
        autor_id: profile?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  })
}

// ─── Permissões de tela ──────────────────────────────────────────────────────

/** Quem decide (aprovar/recusar, pedir informação, mexer em qualquer projeto). */
export function useSouLideranca(): boolean {
  const { profile } = useAuth()
  return profile?.is_lider === true || profile?.is_admin === true || profile?.role === 'admin'
}
