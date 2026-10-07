// ─────────────────────────────────────────────────────────────────────────────
// Prazo do Welcome Path (2026-10-07): 120h corridas desde o 1º acesso à trilha.
//
// A regra mora no banco (`wp_abrir_jornada`, migration 20260794) — aqui só tem
// o que portal e tela de controle precisam para MOSTRAR o prazo do mesmo jeito.
// ─────────────────────────────────────────────────────────────────────────────

const MIN = 60_000
const HORA = 60 * MIN
const DIA = 24 * HORA

/** Abaixo disso o contador muda de cor e a tela de controle destaca a linha. */
export const ULTIMAS_HORAS_MS = 24 * HORA

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`
}

/** "3 dias e 4 horas" · "5 horas e 12 minutos" · "12 minutos". */
export function fmtRestante(ms: number): string {
  if (ms < MIN) return 'menos de 1 minuto'
  const dias = Math.floor(ms / DIA)
  const horas = Math.floor((ms % DIA) / HORA)
  const minutos = Math.floor((ms % HORA) / MIN)
  if (dias > 0) return horas ? `${plural(dias, 'dia', 'dias')} e ${plural(horas, 'hora', 'horas')}` : plural(dias, 'dia', 'dias')
  if (horas > 0) return minutos ? `${plural(horas, 'hora', 'horas')} e ${plural(minutos, 'minuto', 'minutos')}` : plural(horas, 'hora', 'horas')
  return plural(minutos, 'minuto', 'minutos')
}

/** "3d 4h" · "5h 12min" · "12 min" — para chips e tabelas. */
export function fmtRestanteCurto(ms: number): string {
  if (ms < MIN) return '< 1 min'
  const dias = Math.floor(ms / DIA)
  const horas = Math.floor((ms % DIA) / HORA)
  const minutos = Math.floor((ms % HORA) / MIN)
  if (dias > 0) return horas ? `${dias}d ${horas}h` : `${dias}d`
  if (horas > 0) return minutos ? `${horas}h ${minutos}min` : `${horas}h`
  return `${minutos} min`
}

/** "há 5 min" · "há 3 h" · "há 2 dias". */
export function fmtHaQuanto(ms: number): string {
  if (ms < MIN) return 'agora'
  if (ms < HORA) return `há ${Math.floor(ms / MIN)} min`
  if (ms < DIA) return `há ${Math.floor(ms / HORA)} h`
  const dias = Math.floor(ms / DIA)
  return `há ${plural(dias, 'dia', 'dias')}`
}

const FMT_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

/** "sex., 10/10 às 14:32", no fuso de quem está olhando. */
export function dataHoraBR(iso: string): string {
  const partes = FMT_DATA_HORA.formatToParts(new Date(iso))
  const v = (t: Intl.DateTimeFormatPartTypes) => partes.find(p => p.type === t)?.value ?? ''
  return `${v('weekday')}, ${v('day')}/${v('month')} às ${v('hour')}:${v('minute')}`
}

/** Onde o professor está, na visão da tela de controle. Ordem = urgência. */
export type SituacaoTrilha =
  | 'bloqueado' | 'acabando' | 'falta_reuniao' | 'nao_acessou' | 'andamento' | 'finalizado'

type CamposSituacao = {
  primeiro_acesso_em: string | null
  prazo_em: string | null
  concluida_em: string | null
  so_falta_revisao: boolean
  primeira_reuniao_em: string | null
}

/** Mesma regra do bloqueio da Edge Function: prazo vencido trava, a não ser
 *  que tudo o que falta esteja esperando revisão da coordenação. */
export function situacaoTrilha(l: CamposSituacao, agora: number): SituacaoTrilha {
  if (l.concluida_em) return l.primeira_reuniao_em ? 'finalizado' : 'falta_reuniao'
  if (!l.primeiro_acesso_em || !l.prazo_em) return 'nao_acessou'
  const restante = new Date(l.prazo_em).getTime() - agora
  if (restante <= 0) return l.so_falta_revisao ? 'andamento' : 'bloqueado'
  if (restante <= ULTIMAS_HORAS_MS) return 'acabando'
  return 'andamento'
}

/** Texto já escrito no WhatsApp do pedido de desbloqueio. */
export function mensagemDesbloqueio(nome: string, etapa: { numero: number; titulo: string } | null, total: number): string {
  const onde = etapa ? ` Parei na etapa ${etapa.numero} de ${total} (${etapa.titulo}).` : ''
  return `Olá! Sou ${nome}. Meu prazo do Welcome Path terminou e quero continuar a trilha.${onde} Podem desbloquear, por favor?`
}
