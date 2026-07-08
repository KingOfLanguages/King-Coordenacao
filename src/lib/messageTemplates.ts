// ─────────────────────────────────────────────────────────────────────────────
// Templates de mensagem para contato diário com professores. Modelado como
// lista para permitir adicionar novos modelos (check-in, convite, feedback
// positivo etc.) sem reescrever quem consome — hoje só existe o padrão.
// ─────────────────────────────────────────────────────────────────────────────

export type MessageVars = {
  professorNome: string
  coordenadorNome: string
  dataUltimaReuniao: string | null // já formatada (ex.: "12/06/2026") ou null
  linkAgendamento: string | null   // link de agendamento do coordenador (Koalendar/Google) ou null
}

export type MessageTemplate = {
  id: string
  label: string
  build: (vars: MessageVars) => string
}

function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.trim().split(/\s+/)[0] ?? nomeCompleto
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'checkin-padrao',
    label: 'Check-in padrão',
    build: ({ professorNome, coordenadorNome, dataUltimaReuniao, linkAgendamento }) => {
      const referenciaReuniao = dataUltimaReuniao
        ? `Nossa última conversa foi em ${dataUltimaReuniao}.`
        : 'Ainda não tivemos nossa primeira conversa.'

      const convite = linkAgendamento
        ? `\n\nSe quiser conversar, é só escolher um horário por aqui: ${linkAgendamento}`
        : ''

      return `Oi, ${primeiroNome(professorNome)}! Tudo bem? Aqui é ${coordenadorNome}, da Coordenação da King of Languages. ${referenciaReuniao} Passando para saber como você está e se precisa de algo por aqui. 😊${convite}`
    },
  },
]

export function getDefaultTemplate(): MessageTemplate {
  return MESSAGE_TEMPLATES[0]
}
