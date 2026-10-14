import { somarDiasUteis } from '@/lib/diasUteis'

// ─────────────────────────────────────────────────────────────────────────────
// Saída de professor (2026-10). O professor avisa que vai sair, a equipe
// registra na ficha dele e manda a mensagem padrão abaixo; o pedido fica na
// Minha Área da coordenação e do suporte até alguém confirmar quem fez o
// desligamento no King. Ver 20260797_saidas_professor.sql.
// ─────────────────────────────────────────────────────────────────────────────

export type SaidaStatus = 'aguardando' | 'concluida' | 'cancelada'
/** Quem preencheu o desligamento no King: o próprio professor ou nós. */
export type QuemFinalizou = 'professor' | 'equipe'

/** Texto para o WhatsApp (os *asteriscos* são o negrito de lá). */
export const MENSAGEM_SAIDA = `Para dar continuidade ao processo de desligamento, há duas opções de procedimento:

*SAÍDA FUTURA* - Você dá aulas até o último dia informado à coordenação.
1 - Informar a atendente no chat qual será a data de sua última aula.
2 - Aguardar até o dia final
3 - Depois da última aula: lançar TODAS as aulas do sistema. Verificar se ainda há pendências e lançar.
4 - Preencher os dados no link a seguir https://app.kingmanagementsystem.com.br/desligamento-professor

*OBS.:* O sistema tenta realocar os alunos 5 dias úteis antes da data inserida como último dia, por isso, deixe para preencher o link somente DEPOIS de finalizar todas as aulas desejadas. Se você preencher o link ANTES, o sistema pode REALOCAR seus alunos antes da data. Essa transferência será imediata e automática, e não haverá mais aulas após a saída dos alunos.

*SAÍDA HOJE* - Os alunos saem *imediatamente* da agenda. NÃO haverá mais aulas.

1 - Lançar TODAS as aulas pendentes já dadas no dia, e também as que ainda seriam dadas e não serão mais.
2 - Preencher os dados no link a seguir https://app.kingmanagementsystem.com.br/desligamento-professor

Atenção: Você tem até 1 DIA ÚTIL para *informar a data da última aula OU preencher a saída imediata*. Passado o prazo, a escola faz a remoção dos alunos automaticamente.`

/**
 * Dia de voltar à ficha para conferir se o professor saiu: a data que ele
 * informou ou, sem data, o dia útil seguinte ao registro — é o prazo que a
 * mensagem padrão dá para ele dizer a data.
 */
export function prazoDaSaida(s: { data_saida: string | null; created_at: string }): string {
  if (s.data_saida) return s.data_saida
  const d = new Date(s.created_at)
  d.setDate(d.getDate() + 1)
  const amanha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return somarDiasUteis(amanha, 1)
}

/** Dias de calendário de hoje até `iso` (negativo = já passou). */
export function diasAteData(iso: string, hojeIso: string): number {
  const [a, b] = [hojeIso, iso].map(s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) })
  return Math.round((b - a) / 86_400_000)
}

/** "faltam 12 dias" · "amanhã" · "hoje" · "venceu ontem" · "venceu há 3 dias". */
export function contagemSaida(prazo: string, hojeIso: string): string {
  const n = diasAteData(prazo, hojeIso)
  if (n > 1) return `faltam ${n} dias`
  if (n === 1) return 'amanhã'
  if (n === 0) return 'hoje'
  if (n === -1) return 'venceu ontem'
  return `venceu há ${-n} dias`
}

/** Situação de uma saída aberta: o prazo, a contagem e o que o King já mostra. */
export function situacaoSaida(s: {
  data_saida: string | null
  created_at: string
  professor: { status: string } | null
}) {
  const n = new Date()
  const hojeIso = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  const prazo = prazoDaSaida(s)
  const dias = diasAteData(prazo, hojeIso)
  return {
    prazo, dias,
    vencida: dias < 0,
    contagem: contagemSaida(prazo, hojeIso),
    desligadoNoKing: s.professor?.status === 'desligado',
  }
}

/** "30/10/2026" a partir de "2026-10-30". */
export function dataBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export const QUEM_FINALIZOU_LABEL: Record<QuemFinalizou, string> = {
  professor: 'o professor preencheu o desligamento',
  equipe: 'a equipe fez o desligamento',
}
