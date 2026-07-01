import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useAtualizarMeusLinks() {
  return useMutation({
    mutationFn: async (links: { koalendar_link: string | null; google_appointment_link: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessão expirada.')

      const { error } = await supabase
        .from('profiles')
        .update(links)
        .eq('id', user.id)
      if (error) throw error
    },
  })
}
