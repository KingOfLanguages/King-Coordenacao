import { getDefaultTemplate } from '@/lib/messageTemplates'
import { linkAgendamentoPublico } from '@/lib/portal'

// ─────────────────────────────────────────────────────────────────────────────
// Montagem do corpo dos e-mails da página de Disparo de E-mails (/emails).
//
// Dois modos:
//  • Convocação padrão → reaproveita o MESMO template de check-in usado nas
//    "Mensagens do dia" (src/lib/messageTemplates), personalizado por professor,
//    com data da última reunião, link de agendamento e aviso de bloqueio.
//  • Personalizada → texto livre escrito pela coordenação, com tokens que são
//    substituídos por professor ({primeiro_nome}, {nome}, {coordenador}, {grupo}).
//
// O corpo é montado no client (igual ao enviar-convite-email); só o DESTINO é
// resolvido no servidor pela Edge Function, nunca aqui.
// ─────────────────────────────────────────────────────────────────────────────

/** Dados mínimos de um professor para montar a mensagem. */
export interface AlvoEmail {
  nome: string
  coordenador_nome: string | null
  grupo_nome: string | null
  data_ultima_reuniao: string | null
  elegivel_alocacao: boolean | null
  aulas_pendentes_qtd: number
}

export const ASSUNTO_CONVOCACAO_PADRAO = 'Vamos agendar nossa reunião de acompanhamento? — King'
export const ASSUNTO_PERSONALIZADO_PADRAO = 'Um recado da coordenação — King'

export function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.trim().split(/\s+/)[0] || nomeCompleto
}

function dataPorExtenso(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
}

/**
 * Assinatura efetiva de um professor: quando "assinar como coordenador de cada
 * grupo" está ligado, usa o coordenador do professor; senão, a assinatura fixa
 * escolhida no compositor. Cai pra "Coordenação" se nada estiver disponível.
 */
export function assinaturaDe(
  alvo: AlvoEmail,
  assinaturaFixa: string,
  comoCoordenador: boolean,
): string {
  if (comoCoordenador) return alvo.coordenador_nome?.trim() || assinaturaFixa.trim() || 'Coordenação'
  return assinaturaFixa.trim() || alvo.coordenador_nome?.trim() || 'Coordenação'
}

/** Opções compartilhadas pelos dois modos de montagem. */
export interface OpcoesMontagem {
  /** Assinatura fixa (nome de quem dispara). */
  assinatura: string
  /** Assina como o coordenador do grupo de cada professor. */
  comoCoordenador: boolean
}

/** Corpo da convocação padrão para um professor (formato WhatsApp/e-mail). */
export function montarCorpoConvocacao(
  alvo: AlvoEmail,
  opts: OpcoesMontagem & { incluirLink: boolean },
): string {
  return getDefaultTemplate().build({
    professorNome: alvo.nome,
    coordenadorNome: assinaturaDe(alvo, opts.assinatura, opts.comoCoordenador),
    dataUltimaReuniao: dataPorExtenso(alvo.data_ultima_reuniao),
    linkAgendamento: opts.incluirLink ? linkAgendamentoPublico() : null,
    avisoBloqueio: alvo.elegivel_alocacao === false,
    aulasPendentes: alvo.aulas_pendentes_qtd,
    canal: 'email',
  })
}

// ─── Modo personalizado (texto livre + tokens) ───────────────────────────────

export const TOKENS: { token: string; descricao: string }[] = [
  { token: '{primeiro_nome}', descricao: 'Primeiro nome do professor' },
  { token: '{nome}',          descricao: 'Nome completo' },
  { token: '{coordenador}',   descricao: 'Assinatura (você ou o coordenador do grupo)' },
  { token: '{grupo}',         descricao: 'Coordenação do professor' },
]

/** Substitui os tokens do texto livre pelos dados do professor. */
export function aplicarTokens(texto: string, alvo: AlvoEmail, opts: OpcoesMontagem): string {
  const assinatura = assinaturaDe(alvo, opts.assinatura, opts.comoCoordenador)
  return texto
    .split('{primeiro_nome}').join(primeiroNome(alvo.nome))
    .split('{nome}').join(alvo.nome)
    .split('{coordenador}').join(assinatura)
    .split('{grupo}').join(alvo.grupo_nome ?? '')
}

/**
 * Corpo personalizado para um professor: aplica os tokens e, se pedido, prefixa
 * a linha de assinatura em negrito (mesmo padrão visual das mensagens do dia).
 */
export function montarCorpoPersonalizado(
  texto: string,
  alvo: AlvoEmail,
  opts: OpcoesMontagem & { prefixarAssinatura: boolean },
): string {
  const corpo = aplicarTokens(texto, alvo, opts)
  if (!opts.prefixarAssinatura) return corpo
  const assinatura = assinaturaDe(alvo, opts.assinatura, opts.comoCoordenador)
  return `*${assinatura}*\n\n${corpo}`
}
