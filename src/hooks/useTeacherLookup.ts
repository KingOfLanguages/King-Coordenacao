import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type HorarioDisponivel = {
  id: string
  data_hora: string
  capacidade: number
  meet_link: string | null
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

/** Identifica o professor (por e-mail ou por id já resolvido) e retorna as agendas coletivas disponíveis para ele. */
export function useTeacherLookup() {
  return useMutation({
    mutationFn: async (input: { email: string } | { professorId: string }) => {
      const { data, error } = await supabase.functions.invoke('teacher-lookup', {
        body: input,
      })
      if (error) throw new Error(error.message)
      return data as TeacherLookupResult
    },
  })
}
