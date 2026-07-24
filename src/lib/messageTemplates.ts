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
  // Coordenador do grupo de coordenação do professor — quem assina a mensagem.
  coordenadorNome: string
  dataUltimaReuniao: string | null // já formatada (ex.: "9 de março") ou null
  linkAgendamento: string | null   // link do portal público de agendamento (/agendar) ou null
  // Estágio 2 da Central de Pendências (agenda bloqueada 3–4 dias, "dentro do
  // prazo"): adiciona uma linha lembrando de regularizar os lançamentos.
  avisoBloqueio?: boolean
  aulasPendentes?: number | null    // usado só no aviso de bloqueio, quando conhecido
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
    build: ({ professorNome, coordenadorNome, dataUltimaReuniao, linkAgendamento, avisoBloqueio, aulasPendentes }) => {
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
      if (avisoBloqueio) {
        const qtd = typeof aulasPendentes === 'number' && aulasPendentes > 0
          ? `${aulasPendentes} lançamento(s) de aula pendente(s)`
          : 'alguns lançamentos de aula pendentes'
        linhas.push(
          '',
          `Aproveitando: vi por aqui que há ${qtd}. Regularizando, sua agenda volta a receber novos alunos — se precisar de uma mão, é só falar. 🙏`,
        )
      }
      if (linkAgendamento) {
        linhas.push(
          '',
          'Precisamos agendar a nossa próxima reunião de acompanhamento, é só escolher um horário por aqui:',
          `🔗 ${linkAgendamento}`,
        )
      }
      linhas.push('', 'Qualquer coisa, é só me chamar por aqui. Até já! 🙌')

      return linhas.join('\n')
    },
  },
]

export function getDefaultTemplate(): MessageTemplate {
  return MESSAGE_TEMPLATES[0]
}
