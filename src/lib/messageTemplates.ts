// ─────────────────────────────────────────────────────────────────────────────
// Templates de mensagem para contato diário com professores. Modelado como
// lista para permitir adicionar novos modelos (check-in, convite, feedback
// positivo etc.) sem reescrever quem consome — hoje só existe o padrão.
//
// Formato modelado para WhatsApp: 1ª linha em negrito com o *nome do coordenador*
// que vai enviá-la, saudação pelo primeiro nome do professor, corpo e emojis.
// ─────────────────────────────────────────────────────────────────────────────

export type MessageVars = {
  professorNome: string
  coordenadorNome: string
  dataUltimaReuniao: string | null // já formatada (ex.: "12/06/2026") ou null
  linkAgendamento: string | null   // link do portal público de agendamento (/agendar) ou null
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

      const linhas = [
        `*${coordenadorNome}*`,
        '',
        `Oi, ${primeiroNome(professorNome)}! Tudo bem? 😊`,
        '',
        `${referenciaReuniao} Passando para saber como você está e acompanhar de perto a sua jornada aqui na King. 💙`,
      ]
      if (linkAgendamento) {
        linhas.push('', 'Se quiser conversar, é só escolher um horário por aqui:', `🔗 ${linkAgendamento}`)
      }
      linhas.push('', 'Qualquer coisa, é só me chamar por aqui. Até já! 🙌')

      return linhas.join('\n')
    },
  },
]

export function getDefaultTemplate(): MessageTemplate {
  return MESSAGE_TEMPLATES[0]
}
