import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type ReuniaoConfirmada = {
  titulo: string
  data_hora: string
  coordenador_nome: string
  meet_link: string | null
  email_enviado: boolean
}

export type BookMeetingInput =
  | { email: string; horarioId: string }
  | { professorId: string; horarioId: string }

/** Confirma a inscrição do professor num horário de agenda coletiva. */
export function useBookMeeting() {
  return useMutation({
    mutationFn: async (input: BookMeetingInput) => {
      const body = 'email' in input
        ? { email: input.email, horario_id: input.horarioId }
        : { professor_id: input.professorId, horario_id: input.horarioId }
      const { data, error } = await supabase.functions.invoke('create-booking', { body })
      if (error) {
        // supabase-js empacota o corpo do erro em error.context; extrai a mensagem
        // amigável do JSON ({ error }) que a Edge Function retorna nos 4xx/5xx.
        // IMPORTANTE: extrair a mensagem DENTRO do try, mas só lançar FORA dele —
        // um throw dentro do try era capturado pelo próprio catch e o usuário
        // acabava vendo só o genérico "Edge function returned a non-2xx status code".
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
        let mensagem: string | null = null
        if (ctx?.json) {
          try {
            const parsed = await ctx.json()
            if (parsed?.error) mensagem = parsed.error
          } catch {
            // corpo não-JSON — cai na mensagem genérica abaixo
          }
        }
        throw new Error(mensagem ?? error.message)
      }
      return data as { reuniao: ReuniaoConfirmada }
    },
  })
}
