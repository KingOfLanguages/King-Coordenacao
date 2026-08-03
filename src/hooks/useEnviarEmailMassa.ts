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

export type StatusDisparo = 'enviado' | 'falha' | 'sem_email'

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
}

export interface RespostaDisparo {
  lote_id: string
  total: number
  enviados: number
  falhas: number
  sem_email: number
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
    },
  })
}

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

/** Últimos disparos registrados (best-effort — vazio se a tabela ainda não subiu). */
export function useHistoricoDisparos(limite = 50) {
  return useQuery({
    queryKey: ['email-disparos', limite],
    queryFn: async (): Promise<DisparoRegistro[]> => {
      const { data, error } = await supabase
        .from('email_disparos')
        .select('id, professor_id, email, assunto, tipo, sucesso, erro, lote_id, created_at, professor:professores(nome)')
        .order('created_at', { ascending: false })
        .limit(limite)
      // Tabela ausente / sem permissão não deve derrubar a página — só some o painel.
      if (error) return []
      return (data ?? []) as unknown as DisparoRegistro[]
    },
    staleTime: 60_000,
  })
}
