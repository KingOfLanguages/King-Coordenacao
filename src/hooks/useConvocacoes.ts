// ─────────────────────────────────────────────────────────────────────────────
// Convocações (tabela `convocacoes`) — o kanban de convocação de reunião foi
// desligado em 2026-09-21 (migration 20260786): 209 de 212 estavam paradas em
// "pendente de contato". A convocação de verdade acontece pelas Mensagens do
// dia e pelo e-mail do Índice de atenção. Sobraram só os rótulos, para a ficha
// do professor mostrar o histórico.
// ─────────────────────────────────────────────────────────────────────────────

export type EtapaConvocacao   = 'pendente_contato' | 'aguardando_resposta' | 'agendada' | 'realizada'
export type OrigemConvocacao  = 'incidente' | 'observacao' | 'feedback' | 'periodica' | 'coordenacao'

export const ETAPAS_CONVOCACAO: { id: EtapaConvocacao; titulo: string; emoji: string }[] = [
  { id: 'pendente_contato',    titulo: 'Pendente de contato', emoji: '📥' },
  { id: 'aguardando_resposta', titulo: 'Aguardando resposta', emoji: '📨' },
  { id: 'agendada',            titulo: 'Reunião agendada',     emoji: '📅' },
  { id: 'realizada',           titulo: 'Reunião realizada',    emoji: '✅' },
]

export const ORIGEM_LABEL: Record<OrigemConvocacao, string> = {
  incidente:   'Incidente',
  observacao:  'Observação',
  feedback:    'Feedback',
  periodica:   'Reunião periódica',
  coordenacao: 'Solicitação da coordenação',
}
