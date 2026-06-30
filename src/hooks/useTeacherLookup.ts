import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type HorarioDisponivel = {
  id: string
  data_hora: string
  capacidade: number
  vagas: number
  ja_inscrito: boolean
}

export type AgendaDisponivel = {
  id: string
  titulo: string
  descricao: string | null
  meet_link: string | null
  coordenador: { id: string; nome: string } | null
  horarios: HorarioDisponivel[]
}

export type TeacherLookupResult = {
  professor: { id: string; nome: string } | null
  agendas: AgendaDisponivel[]
}

/** Identifica o professor pelo e-mail e retorna as agendas coletivas disponíveis para ele. */
export function useTeacherLookup() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.functions.invoke('teacher-lookup', {
        body: { email },
      })
      if (error) throw new Error(error.message)
      return data as TeacherLookupResult
    },
  })
}
