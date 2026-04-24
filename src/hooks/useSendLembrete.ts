import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── useSendLembretesGeral ────────────────────────────────────────────────────
// Envia lembretes para TODAS as reuniões pendentes de hoje

export function useSendLembretesGeral() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-reminders', {
        body: {},
      })
      if (error) throw new Error(error.message)
      return data as { sent: number; skipped: number; date: string }
    },
  })
}

// ─── useSendLembreteIndividual ────────────────────────────────────────────────
// Envia lembrete para UMA reunião específica (por ID)

export function useSendLembreteIndividual() {
  return useMutation({
    mutationFn: async (reuniaoId: string) => {
      const { data, error } = await supabase.functions.invoke('send-reminders', {
        body: { reuniao_id: reuniaoId },
      })
      if (error) throw new Error(error.message)
      return data as { sent: number; skipped: number; date: string }
    },
  })
}
