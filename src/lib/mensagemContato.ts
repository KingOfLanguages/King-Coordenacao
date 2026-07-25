import { getDefaultTemplate } from '@/lib/messageTemplates'
import { mensagemDoEstagio } from '@/lib/centralPendencias'
import { reuniaoUltimaDe, type ContatoDia } from '@/hooks/useContatosDia'

// ─────────────────────────────────────────────────────────────────────────────
// Texto da mensagem de agendamento de reunião de acompanhamento, conforme a
// proveniência do contato do dia. Fonte única usada pelo painel lateral (Reuniões
// do Dia) e pelo board de Mensagens do dia (aba Reuniões de Tarefas).
//
//  • estágio 3 (bloqueada 5+ dias) → mensagem de reunião obrigatória + CTA de agendamento;
//  • estágio 2 (bloqueada 3–4 dias) → check-in com aviso de regularização;
//  • normal → check-in padrão.
// ─────────────────────────────────────────────────────────────────────────────

export function montarMensagemContato(
  c: ContatoDia,
  /** Nome do coordenador que assina (já resolvido pelo chamador). */
  coordNome: string,
  linkAgendamento: string | null,
  /** Canal de envio — muda só o fechamento (WhatsApp responde ali; e-mail
   *  direciona pro WhatsApp da coordenação). Padrão: WhatsApp. */
  canal: 'whatsapp' | 'email' = 'whatsapp',
): string {
  const nome = c.professor?.nome ?? 'professor(a)'

  if (c.estagio === 3) {
    const primeiro = nome.trim().split(/\s+/)[0] || nome
    const linhas = [`*${coordNome}*`, '', mensagemDoEstagio(3, primeiro, c.aulas_pendentes ?? 0)]
    if (linkAgendamento) {
      linhas.push('', 'Para agendar a reunião de acompanhamento, é só escolher um horário por aqui:', `🔗 ${linkAgendamento}`)
    }
    return linhas.join('\n')
  }

  const ultima = reuniaoUltimaDe(c)
  return getDefaultTemplate().build({
    professorNome: nome,
    coordenadorNome: coordNome,
    dataUltimaReuniao: ultima
      ? new Date(ultima).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
      : null,
    linkAgendamento,
    avisoBloqueio: c.estagio === 2,
    aulasPendentes: c.aulas_pendentes,
    canal,
  })
}

/**
 * Assunto do e-mail de convite (usado só na versão por e-mail da mensagem do dia).
 * Mais direto no estágio 3 (reunião obrigatória); convite leve nos demais.
 */
export function montarAssuntoContato(c: ContatoDia): string {
  return c.estagio === 3
    ? 'Reunião de acompanhamento — King'
    : 'Vamos agendar nossa próxima conversa? — King'
}
