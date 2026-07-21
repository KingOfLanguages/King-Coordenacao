import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Portal público do Welcome Path. Tudo passa pela Edge Function
// `portal-welcome-path` — o professor não tem sessão do Supabase, então o
// front nunca fala com as tabelas direto.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * supabase-js só expõe `error.message` genérico ("non-2xx status code") em erro
 * HTTP de Edge Function — o corpo real ({ error: "…" }) vem em `error.context`.
 * As mensagens aqui são escritas para o professor ler, então perdê-las custa
 * caro. Mesma armadilha documentada em usePortalPausa.ts e useBookMeeting.ts:
 * a extração acontece DENTRO do try, mas o throw é FORA — lançar lá dentro
 * seria capturado pelo próprio catch e devolveria o genérico.
 */
async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('portal-welcome-path', { body })

  if (error) {
    const ctx = (error as { context?: Response }).context
    let mensagem: string | null = null
    if (ctx?.clone) {
      try {
        const parsed = await ctx.clone().json()
        if (parsed?.error) mensagem = parsed.error
      } catch { /* corpo não era JSON — cai na mensagem genérica */ }
    }
    throw new Error(mensagem ?? error.message)
  }

  const corpo = data as (T & { error?: string }) | null
  if (corpo?.error) throw new Error(corpo.error)
  return corpo as T
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ProfessorPortal = { id: string; nome: string }

export type EstadoEtapa = 'concluida' | 'liberada' | 'bloqueada'

export type EtapaTrilha = {
  id: string
  ordem: number
  titulo: string
  descricao: string
  obrigatoria: boolean
  notaMinima: number
  notasCoordenacao: string | null
  estado: EstadoEtapa
  /** Só quando bloqueada: 'anterior' (falta concluir a anterior) ou 'data'. */
  motivoBloqueio: 'anterior' | 'data' | null
  /** ISO — quando a etapa abre, se estiver esperando data. */
  abreEm: string | null
  /** ISO — prazo sugerido pela coordenação. */
  prazoEm: string | null
  nota: number | null
  tentativas: number
  iniciadaEm: string | null
  concluidaEm: string | null
  tempoSegundos: number
  revisaoPendente: boolean
}

/** Espelha a área de materiais da King: h1/h2/text/video/callout são as mesmas
 *  chaves do KMS. `imagem` e `html` são extensões nossas. */
export type TipoBloco = 'h1' | 'h2' | 'text' | 'video' | 'imagem' | 'callout' | 'html'

export type BlocoEtapa = {
  id: string
  ordem: number
  tipo: TipoBloco
  titulo: string | null
  conteudo: string | null
  url: string | null
  meta: Record<string, unknown>
}

export type TipoQuestao =
  | 'multipla_escolha' | 'multipla_selecao' | 'verdadeiro_falso' | 'dissertativa'

/** Sem `corretas`: o gabarito não sai do servidor. `explicacao` só chega depois
 *  de o professor ter respondido ao menos uma vez. */
export type QuestaoEtapa = {
  id: string
  bloco_id: string | null
  ordem: number
  tipo: TipoQuestao
  enunciado: string
  opcoes: string[]
  peso: number
  obrigatoria: boolean
  explicacao?: string | null
}

export type MinhaResposta = {
  questao_id: string
  resposta: { opcoes?: number[]; texto?: string }
  correta: boolean | null
  comentario_revisao: string | null
}

export type EtapaDetalhe = {
  etapa: {
    id: string; ordem: number; titulo: string; descricao: string
    notaMinima: number; prazoEm: string | null; notasCoordenacao: string | null
  }
  blocos: BlocoEtapa[]
  questoes: QuestaoEtapa[]
  progresso: {
    iniciadaEm: string | null
    concluidaEm: string | null
    nota: number | null
    tentativas: number
    observacao: string
    revisaoPendente: boolean
    tempoSegundos: number
  }
  minhasRespostas: MinhaResposta[]
}

export type RespostaEnviada = { questaoId: string; opcoes?: number[]; texto?: string }

export type ResultadoEnvio = {
  nota: number | null
  aprovado: boolean
  notaMinima: number
  revisaoPendente: boolean
  tentativas: number
  resultado: { questaoId: string; correta: boolean | null; explicacao: string | null }[]
}

export type LookupResult = {
  professor: ProfessorPortal | null
  ambiguo: boolean
  token: string | null
  expiraEm?: string
}

// ─── Identificação ────────────────────────────────────────────────────────────

export type LookupInput = {
  email?: string
  nome?: string
  mesInicio?: number
  anoInicio?: number
  /** Id direto — reenviado com o e-mail confirmado para cadastrá-lo. */
  professorId?: string
}

/** Mesma identificação do /pausa: e-mail exato → nome completo → mês/ano. */
export function useWelcomePathLookup() {
  return useMutation({
    mutationFn: (input: LookupInput) => invocar<LookupResult>({ acao: 'lookup', ...input }),
  })
}

/** Revalida o token guardado no dispositivo. */
export function useWelcomePathSessao(token: string | null) {
  return useQuery({
    queryKey: ['wp', 'sessao', token],
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    queryFn: () => invocar<{ professor: ProfessorPortal }>({ acao: 'sessao', token }),
  })
}

// ─── Trilha e etapa ───────────────────────────────────────────────────────────

export function useTrilha(token: string | null) {
  return useQuery({
    queryKey: ['wp', 'trilha', token],
    enabled: !!token,
    retry: false,
    queryFn: () => invocar<{
      professor: ProfessorPortal & { dataInicio: string | null }
      etapas: EtapaTrilha[]
    }>({ acao: 'trilha', token }),
  })
}

export function useEtapa(token: string | null, etapaId: string | null) {
  return useQuery({
    queryKey: ['wp', 'etapa', token, etapaId],
    enabled: !!token && !!etapaId,
    retry: false,
    queryFn: () => invocar<EtapaDetalhe>({ acao: 'etapa', token, etapaId }),
  })
}

// ─── Ações ────────────────────────────────────────────────────────────────────

export function useIniciarEtapa() {
  return useMutation({
    mutationFn: (v: { token: string; etapaId: string }) =>
      invocar<{ ok: true }>({ acao: 'iniciar', ...v }),
  })
}

/** Acumula tempo de estudo. O servidor limita o delta por chamada, então bater
 *  de tempos em tempos é o único jeito de o total refletir a realidade. */
export function useRegistrarTempo() {
  return useMutation({
    mutationFn: (v: { token: string; etapaId: string; segundos: number }) =>
      invocar<{ ok: true }>({ acao: 'tempo', ...v }),
  })
}

export function useSalvarObservacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { token: string; etapaId: string; texto: string }) =>
      invocar<{ ok: true }>({ acao: 'observacao', ...v }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['wp', 'etapa', v.token, v.etapaId] })
    },
  })
}

export function useResponderEtapa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { token: string; etapaId: string; respostas: RespostaEnviada[] }) =>
      invocar<ResultadoEnvio>({ acao: 'responder', ...v }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['wp', 'trilha', v.token] })
      qc.invalidateQueries({ queryKey: ['wp', 'etapa', v.token, v.etapaId] })
    },
  })
}
