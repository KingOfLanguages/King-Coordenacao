import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Disparo de e-mails em massa (Edge Function enviar-email-massa).
//
// O client manda o corpo JÁ montado por professor (mesmo modelo do
// enviar-convite-email); o servidor resolve o e-mail de cada professor a partir
// de professores.email — o destino NUNCA vem do client — envia via Brevo e
// devolve o resultado por destinatário.
// ─────────────────────────────────────────────────────────────────────────────

// 'inativo' = a Edge Function barrou no envio porque o professor já não está
// ativo/pausado. A lista da tela só traz ativos, mas o status pode virar entre
// carregar a página e clicar em enviar — quem decide é o servidor.
// 'carencia' = recebeu e-mail nos últimos 15 dias (ver useEmailCarencia).
export type StatusDisparo = 'enviado' | 'falha' | 'sem_email' | 'inativo' | 'carencia'

export interface MensagemAlvo {
  professor_id: string
  corpo: string
}

export interface ResultadoDisparo {
  professor_id: string
  nome: string
  email: string | null
  status: StatusDisparo
  erro?: string | null
  /** Só em 'carencia': dia (YYYY-MM-DD) em que volta a poder receber. */
  libera_em?: string
}

export interface RespostaDisparo {
  lote_id: string
  total: number
  enviados: number
  falhas: number
  sem_email: number
  inativos: number
  em_carencia: number
  resultados: ResultadoDisparo[]
}

export interface ParamsDisparo {
  assunto: string
  tipo: 'convocacao' | 'personalizado'
  remetente_nome: string
  mensagens: MensagemAlvo[]
}

/** Extrai a mensagem de erro de uma Response embutida no error do functions.invoke. */
async function mensagemDeErro(error: unknown): Promise<string> {
  const base = error instanceof Error ? error.message : 'Falha no disparo.'
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body?.error) return String(body.error)
    } catch { /* mantém base */ }
  }
  return base
}

export function useEnviarEmailMassa() {
  const queryClient = useQueryClient()
  return useMutation<RespostaDisparo, Error, ParamsDisparo>({
    mutationFn: async (params) => {
      const { data, error } = await supabase.functions.invoke('enviar-email-massa', { body: params })
      if (error) throw new Error(await mensagemDeErro(error))
      if (data?.error) throw new Error(String(data.error))
      return data as RespostaDisparo
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-disparos'] })
      queryClient.invalidateQueries({ queryKey: ['email-quota-hoje'] })
      queryClient.invalidateQueries({ queryKey: ['email-carencia'] })
      // O servidor marca como contatado quem estava nas Mensagens do dia.
      queryClient.invalidateQueries({ queryKey: ['contatos-dia'] })
    },
  })
}

// ─── Carência de 15 dias ──────────────────────────────────────────────────────

/** Espelha a função email_carencia() do banco (migration 20260787) — aqui só
 *  para o texto da tela. Quem manda é o banco. */
export const CARENCIA_EMAIL_DIAS = 15

export interface CarenciaEmail {
  ultimo_envio: string   // ISO do último e-mail recebido
  libera_em: string      // YYYY-MM-DD — primeiro dia em que pode receber de novo
}

/** Professores que receberam e-mail nos últimos 15 dias, por professor_id.
 *  Tolerante: se a consulta falhar, volta vazio — as Edge Functions barram de
 *  qualquer jeito, a tela só deixa de avisar antes. */
export function useEmailCarencia(enabled = true) {
  return useQuery({
    queryKey: ['email-carencia'],
    enabled,
    queryFn: async (): Promise<Map<string, CarenciaEmail>> => {
      const { data, error } = await supabase.rpc('email_carencia')
      if (error) return new Map()
      return new Map(
        ((data ?? []) as ({ professor_id: string } & CarenciaEmail)[])
          .map(c => [c.professor_id, { ultimo_envio: c.ultimo_envio, libera_em: c.libera_em }]),
      )
    },
    staleTime: 60_000,
  })
}

/** "21/09" — data curta, para os avisos de carência. */
export function diaMes(isoOuDia: string): string {
  // Dia puro (YYYY-MM-DD) vira meio-dia local para não escorregar de fuso.
  const d = isoOuDia.length === 10 ? new Date(`${isoOuDia}T12:00:00`) : new Date(isoOuDia)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** Texto único de "por que não dá para mandar e-mail" (tooltip e avisos). */
export function textoCarencia(c: CarenciaEmail): string {
  return `Não pode receber e-mail: recebeu um em ${diaMes(c.ultimo_envio)} e só volta a poder em ${diaMes(c.libera_em)} (regra dos ${CARENCIA_EMAIL_DIAS} dias).`
}

/** Dias corridos até poder receber de novo (0 = já hoje). */
export function diasParaLiberar(liberaEm: string): number {
  const hoje = new Date()
  hoje.setHours(12, 0, 0, 0)
  const alvo = new Date(`${liberaEm}T12:00:00`)
  return Math.max(0, Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000))
}

/** "amanhã", "em 6 dias". */
export function quandoLibera(liberaEm: string): string {
  const n = diasParaLiberar(liberaEm)
  return n <= 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`
}

/** A regra, numa frase — a mesma em todas as telas de envio. */
export const REGRA_CARENCIA =
  `Quem recebeu e-mail da coordenação nos últimos ${CARENCIA_EMAIL_DIAS} dias não pode receber outro até completar os ${CARENCIA_EMAIL_DIAS} dias.`

// ─── Contador diário (limite auto-imposto de 200/dia) ────────────────────────

export interface QuotaHoje {
  usados: number | null      // e-mails já enviados hoje pela conta Brevo (todos os fluxos)
  limite: number             // limite diário auto-imposto (200)
  restantes: number | null   // limite − usados (null quando o Brevo não respondeu)
  data?: string
}

/** Quantos e-mails já saíram hoje e quantos ainda cabem (Edge Function
 *  email-quota-hoje). Visível a qualquer usuário logado. */
export function useEmailQuotaHoje() {
  return useQuery({
    queryKey: ['email-quota-hoje'],
    queryFn: async (): Promise<QuotaHoje> => {
      const { data, error } = await supabase.functions.invoke('email-quota-hoje', { body: {} })
      if (error || !data) return { usados: null, limite: 200, restantes: null }
      return data as QuotaHoje
    },
    staleTime: 60_000,
    refetchInterval: 120_000,   // mantém o contador vivo enquanto a página fica aberta
  })
}

// ─── Histórico (auditoria) ────────────────────────────────────────────────────

export interface DisparoRegistro {
  id: string
  professor_id: string | null
  email: string
  assunto: string
  tipo: string
  sucesso: boolean
  erro: string | null
  lote_id: string | null
  created_at: string
  professor: { nome: string } | { nome: string }[] | null
}

/** Últimos disparos do sistema de disparo (best-effort — vazio se a tabela ainda
 *  não subiu). Os convites 1-a-1 das Mensagens do dia ficam de fora. */
export function useHistoricoDisparos(limite = 50) {
  return useQuery({
    queryKey: ['email-disparos', limite],
    queryFn: async (): Promise<DisparoRegistro[]> => {
      const { data, error } = await supabase
        .from('email_disparos')
        .select('id, professor_id, email, assunto, tipo, sucesso, erro, lote_id, created_at, professor:professores(nome)')
        .eq('origem', 'disparo')
        .order('created_at', { ascending: false })
        .limit(limite)
      // Tabela ausente / sem permissão não deve derrubar a página — só some o painel.
      if (error) return []
      return (data ?? []) as unknown as DisparoRegistro[]
    },
    staleTime: 60_000,
  })
}
