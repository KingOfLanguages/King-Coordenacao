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

// ─────────────────────────────────────────────────────────────────────────────
// Reunião do dia — mensagem de confirmação personalizada, modelada para WhatsApp
// (negrito com *asteriscos*, quebras de linha e emojis). A 1ª linha é sempre o
// nome do coordenador que vai enviá-la, em negrito, conforme combinado.
// ─────────────────────────────────────────────────────────────────────────────

export type ReuniaoDoDiaVars = {
  professorNome: string
  coordenadorNome: string
  hora: string | null        // já formatada (ex.: "15:30") ou null
  numeroReuniao: number | null
  meetLink: string | null
}

export function buildMensagemReuniaoDoDia(v: ReuniaoDoDiaVars): string {
  const nome = primeiroNome(v.professorNome)
  const n = v.numeroReuniao

  const corpo =
    n === 1
      ? 'Passando para confirmar a nossa *primeira conversa*, marcada para hoje. Vai ser um prazer te conhecer melhor e entender como está sendo a sua experiência aqui na King. 💙'
      : n && n > 1
        ? `Passando para confirmar a nossa *${n}ª conversa*, marcada para hoje. Quero saber como você está e acompanhar de perto a sua jornada com a gente. 💙`
        : 'Passando para confirmar a nossa *conversa de hoje*. Quero saber como você está e acompanhar de perto a sua jornada aqui na King. 💙'

  const linhas = [
    `*${v.coordenadorNome}*`,
    '',
    `Oi, ${nome}! Tudo bem? 😊`,
    '',
    corpo,
    '',
    v.hora ? `🗓️ *Hoje às ${v.hora}*` : '🗓️ *Hoje*',
  ]
  if (v.meetLink) linhas.push(`🔗 ${v.meetLink}`)
  linhas.push('', 'Qualquer coisa, é só me chamar por aqui. Até já! 🙌')

  return linhas.join('\n')
}

/**
 * Normaliza um telefone brasileiro (só dígitos, prefixo 55 quando ausente) e
 * monta o link do WhatsApp com a mensagem já pré-preenchida. Retorna null se
 * não houver telefone cadastrado.
 */
export function linkWhatsApp(telefone: string | null, mensagem: string): string | null {
  if (!telefone) return null
  let dig = telefone.replace(/\D/g, '')
  if (!dig) return null
  if (dig.length <= 11 && !dig.startsWith('55')) dig = `55${dig}`
  return `https://wa.me/${dig}?text=${encodeURIComponent(mensagem)}`
}
