import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * supabase-js só expõe `error.message` genérico ("non-2xx status code") em erro
 * HTTP de Edge Function — o corpo real ({ error: "…" }) vem em `error.context`.
 * As mensagens do portal de pausa são escritas para o professor ler, então
 * perdê-las custa caro.
 *
 * A extração acontece DENTRO do try, mas o throw é FORA: lançar lá dentro seria
 * capturado pelo próprio catch e o professor veria só o genérico (mesma
 * armadilha já documentada em useBookMeeting.ts).
 */
async function invocarPortalPausa<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('portal-pausa', { body })

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

export type PausaLookupResult = {
  professor: { id: string; nome: string } | null
  /** true = mais de um professor com o mesmo nome; o front pede mês/ano de início. */
  ambiguo: boolean
  /** Já existe solicitação pendente/em atendimento — não deixa duplicar. */
  pausaAberta: boolean
  jaPausado: boolean
}

export type PausaLookupInput = {
  email?: string
  nome?: string
  mesInicio?: number
  anoInicio?: number
  /** Id direto — reenviado com o e-mail confirmado para cadastrá-lo. */
  professorId?: string
}

/**
 * Identifica o professor pelo e-mail (exato) e, como reserva, pelo nome completo
 * — mesmos parâmetros do portal de agendamento. Ver portal-pausa/index.ts.
 */
export function usePausaLookup() {
  return useMutation({
    mutationFn: (input: PausaLookupInput) =>
      invocarPortalPausa<PausaLookupResult>({ acao: 'lookup', ...input }),
  })
}

export type SolicitarPausaInput = {
  professorId: string
  motivo: string
  /** ISO YYYY-MM-DD — último dia de aula. */
  dataInicio: string
  /** ISO YYYY-MM-DD — dia do contato da coordenação. */
  dataFim: string
}

/** Registra a solicitação de pausa. Erros de validação (data invertida, pausa já
 *  aberta, professor já pausado) voltam com mensagem pronta para exibir. */
export function useSolicitarPausa() {
  return useMutation({
    mutationFn: (input: SolicitarPausaInput) =>
      invocarPortalPausa<{ ok: true; pausaId: string }>({ acao: 'solicitar', ...input }),
  })
}
