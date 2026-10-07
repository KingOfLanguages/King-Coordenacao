import { supabase } from '@/lib/supabase'

/** Erro de Edge Function com o status HTTP — 401 nos portais = sessão vencida. */
export class ErroFuncao extends Error {
  status: number | null
  corpo: Record<string, unknown> | null

  constructor(mensagem: string, status: number | null, corpo: Record<string, unknown> | null) {
    super(mensagem)
    this.status = status
    this.corpo = corpo
  }
}

/**
 * Chama uma Edge Function e devolve o corpo, ou lança com a mensagem que ELA
 * escreveu. supabase-js só expõe `error.message` genérico ("non-2xx status
 * code") — o corpo real ({ error: "…" }) vem em `error.context`. As mensagens
 * dos portais são escritas para o professor ler, então perdê-las custa caro.
 *
 * A extração acontece DENTRO do try, mas o throw é FORA: lançar lá dentro seria
 * capturado pelo próprio catch e devolveria o genérico.
 */
export async function invocarFuncao<T>(nome: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body })

  if (error) {
    const ctx = (error as { context?: Response }).context
    let corpo: Record<string, unknown> | null = null
    if (ctx?.clone) {
      try {
        corpo = await ctx.clone().json()
      } catch { /* corpo não era JSON — cai na mensagem genérica */ }
    }
    const mensagem = typeof corpo?.error === 'string' ? corpo.error : error.message
    throw new ErroFuncao(mensagem, ctx?.status ?? null, corpo)
  }

  const resposta = data as (T & { error?: string }) | null
  if (resposta?.error) throw new ErroFuncao(resposta.error, 200, resposta as Record<string, unknown>)
  return resposta as T
}

/** O servidor recusou o token (expirou, foi revogado, cadastro desligado). */
export function sessaoRecusada(e: unknown): boolean {
  return e instanceof ErroFuncao && e.status === 401
}
