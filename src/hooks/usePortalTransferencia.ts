import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MotivoTransferencia } from '@/lib/transferenciaLabels'

/**
 * supabase-js só expõe `error.message` genérico ("non-2xx status code") em erro
 * HTTP de Edge Function — o corpo real ({ error: "…" }) vem em `error.context`.
 * As mensagens deste portal são escritas para o professor ler, então perdê-las
 * custa caro.
 *
 * A extração acontece DENTRO do try, mas o throw é FORA: lançar lá dentro seria
 * capturado pelo próprio catch e o professor veria só o genérico (mesma
 * armadilha já documentada em useBookMeeting.ts e usePortalPausa.ts).
 */
async function invocarPortalTransferencia<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('portal-transferencia', { body })

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

/** Um aluno da carteira do professor, como o portal o enxerga. */
export type AlunoPortal = {
  alunoId: number
  nome: string
  dataAdicao: string | null
  status: string | null
  /** Já existe pedido em andamento para este aluno — a opção fica travada. */
  pedidoAberto: boolean
}

export type TransferenciaLookupResult = {
  professor: { id: string; nome: string } | null
  /** true = mais de um professor com o mesmo nome; o front pede mês/ano de início. */
  ambiguo: boolean
  /** Carteira do professor (só vínculos individuais, turmas ficam de fora). */
  alunos: AlunoPortal[]
  jaPausado: boolean
}

export type TransferenciaLookupInput = {
  email?: string
  nome?: string
  mesInicio?: number
  anoInicio?: number
  /** Id direto — reenviado com o e-mail confirmado para cadastrá-lo. */
  professorId?: string
}

/**
 * Identifica o professor pelo e-mail (exato) e, como reserva, pelo nome completo
 * — mesmos parâmetros do portal de pausa — e já devolve a carteira de alunos
 * dele, que é o que o formulário usa para o professor escolher quem transferir.
 */
export function useTransferenciaLookup() {
  return useMutation({
    mutationFn: (input: TransferenciaLookupInput) =>
      invocarPortalTransferencia<TransferenciaLookupResult>({ acao: 'lookup', ...input }),
  })
}

export type SolicitarTransferenciaInput = {
  professorId: string
  /** null quando o professor não achou o aluno na lista e digitou o nome. */
  alunoId: number | null
  alunoNome: string
  motivo: MotivoTransferencia
  detalhe: string
  /** ISO YYYY-MM-DD — último dia em que o aluno terá aula. Define a urgência
   *  do pedido; não existe mais urgência declarada. */
  dataUltimaAula: string
  jaConversou: boolean | null
  aceitaManter: boolean | null
}

/** Registra o pedido. Erros de validação (aluno fora da carteira, pedido já
 *  aberto para o mesmo aluno) voltam com mensagem pronta para exibir. */
export function useSolicitarTransferencia() {
  return useMutation({
    mutationFn: (input: SolicitarTransferenciaInput) =>
      invocarPortalTransferencia<{ ok: true; transferenciaId: string }>({
        acao: 'solicitar', ...input,
      }),
  })
}
