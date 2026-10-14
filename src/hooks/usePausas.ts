import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Pausas (20260738). O formulário público e a fila saíram em 2026-10-14 — a
// pausa passou para a plataforma da King. Sobra o fim das pausas que já estavam
// em andamento: o cron king-cobrar-fim-pausa cria a tarefa "Encerrar pausa" na
// data de retorno, e a ficha e a Minha Área encerram por aqui.
// ─────────────────────────────────────────────────────────────────────────────

/** Dias inteiros de hoje até uma data ISO (YYYY-MM-DD). Negativo = passado.
 *  Compara só a parte de data, sem hora — evita o resultado mudar conforme a
 *  hora do dia em que a tela é aberta. */
export function diasAte(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = Date.UTC(a, m - 1, d)
  const agora = new Date()
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.round((alvo - hoje) / 86_400_000)
}

// Toda escrita passa por função SECURITY DEFINER: `pausas` não tem policy de
// INSERT/UPDATE. Ver 20260738_pausas.sql.

function useAcaoPausa<TInput>(rpc: string, args: (input: TInput) => Record<string, unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TInput) => {
      const { error } = await supabase.rpc(rpc, args(input))
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pausas'] })
      qc.invalidateQueries({ queryKey: ['professores'] })
      // Encerrar a pausa conclui a tarefa "Encerrar pausa" (20260786).
      qc.invalidateQueries({ queryKey: ['tarefas'] })
    },
  })
}

/** Encerra a pausa vigente do professor — o contato da coordenação aconteceu.
 *  Tira da pausa e fecha a linha de pausa numa transação só. Restrito à
 *  coordenação pela própria função no banco. */
export function useEncerrarPausa() {
  return useAcaoPausa<string>('encerrar_pausa', professorId => ({ p_professor_id: professorId }))
}
