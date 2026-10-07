import { useMutation } from '@tanstack/react-query'
import { invocarFuncao } from '@/lib/invocarFuncao'

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

/** Agendas coletivas disponíveis para o professor da sessão do portal. */
export function useTeacherLookup() {
  return useMutation({
    mutationFn: (input: { token: string }) =>
      invocarFuncao<TeacherLookupResult>('teacher-lookup', input),
  })
}
