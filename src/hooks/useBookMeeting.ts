import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type ReuniaoConfirmada = {
  titulo: string
  data_hora: string
  coordenador_nome: string
  meet_link: string | null
}

/** Confirma a inscrição do professor num horário de agenda coletiva. */
export function useBookMeeting() {
  return useMutation({
    mutationFn: async ({ email, horarioId }: { email: string; horarioId: string }) => {
      const { data, error } = await supabase.functions.invoke('create-booking', {
        body: { email, horario_id: horarioId },
      })
      if (error) {
        // supabase-js empacota o corpo do erro em error.context; tenta extrair a mensagem amigável.
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
        if (ctx?.json) {
          try {
            const body = await ctx.json()
            if (body?.error) throw new Error(body.error)
          } catch {
            // ignora e cai no throw genérico abaixo
          }
        }
        throw new Error(error.message)
      }
      return data as { reuniao: ReuniaoConfirmada }
    },
  })
}
