import { useMutation } from '@tanstack/react-query'
import { invocarFuncao } from '@/lib/invocarFuncao'

export type ReuniaoConfirmada = {
  titulo: string
  data_hora: string
  coordenador_nome: string
  meet_link: string | null
  email_enviado: boolean
}

export type BookMeetingInput = { token: string; horarioId: string }

/** Confirma a inscrição do professor da sessão num horário de agenda coletiva. */
export function useBookMeeting() {
  return useMutation({
    mutationFn: (input: BookMeetingInput) =>
      invocarFuncao<{ reuniao: ReuniaoConfirmada }>('create-booking', {
        token: input.token, horario_id: input.horarioId,
      }),
  })
}
