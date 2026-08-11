// ─────────────────────────────────────────────────────────────────────────────
// Rótulos da solicitação de transferência de aluno — compartilhados entre o
// portal público (o professor escolhe), a fila do Suporte ao Aluno (agrupa e
// filtra) e a seção do perfil do professor.
//
// As CHAVES são contrato com o banco: `portal-transferencia` valida contra a
// mesma lista e a coluna `motivo` guarda a chave crua. Renomear uma chave
// invalida os pedidos já gravados — acrescente uma nova em vez disso.
// ─────────────────────────────────────────────────────────────────────────────

export type MotivoTransferencia =
  | 'incompatibilidade_horario'
  | 'nao_adaptacao_metodo'
  | 'perfil_nivel'
  | 'comportamento_aluno'
  | 'faltas_aluno'
  | 'pedido_do_aluno'
  | 'sobrecarga'
  | 'motivo_pessoal'
  | 'outro'

/** Ordem = ordem de exibição no formulário. O texto de apoio é o que faz o
 *  professor escolher a categoria certa em vez de cair sempre em "Outro". */
export const MOTIVOS_TRANSFERENCIA: {
  value: MotivoTransferencia
  label: string
  ajuda: string
}[] = [
  { value: 'incompatibilidade_horario', label: 'Conflito de horário',        ajuda: 'O horário do aluno não cabe mais na minha agenda.' },
  { value: 'pedido_do_aluno',           label: 'O próprio aluno pediu',      ajuda: 'O aluno manifestou que quer trocar de professor.' },
  { value: 'nao_adaptacao_metodo',      label: 'Não houve adaptação',        ajuda: 'A dinâmica das aulas não engrenou entre nós dois.' },
  { value: 'perfil_nivel',              label: 'Nível ou perfil do aluno',   ajuda: 'O aluno se beneficiaria mais de outro professor.' },
  { value: 'faltas_aluno',              label: 'Faltas recorrentes',         ajuda: 'O aluno falta com frequência ou não confirma as aulas.' },
  { value: 'comportamento_aluno',       label: 'Postura do aluno',           ajuda: 'Houve alguma situação de conduta na aula.' },
  { value: 'sobrecarga',                label: 'Sobrecarga de agenda',       ajuda: 'Estou com mais alunos do que consigo atender bem.' },
  { value: 'motivo_pessoal',            label: 'Motivo pessoal',             ajuda: 'Alguma questão minha, fora da relação com o aluno.' },
  { value: 'outro',                     label: 'Outro',                      ajuda: 'Explico no campo abaixo.' },
]

const MOTIVO_LABEL: Record<string, string> =
  Object.fromEntries(MOTIVOS_TRANSFERENCIA.map(m => [m.value, m.label]))

export function motivoTransferenciaLabel(m: string | null | undefined): string {
  if (!m) return 'Não informado'
  return MOTIVO_LABEL[m] ?? m
}

/** Motivos que apontam para o VÍNCULO (professor↔aluno) e não para logística.
 *  A fila destaca esses: são os que valem uma conversa antes de transferir. */
const MOTIVOS_RELACIONAIS = new Set<string>([
  'nao_adaptacao_metodo', 'comportamento_aluno', 'pedido_do_aluno',
])

export function motivoEhRelacional(m: string | null | undefined): boolean {
  return !!m && MOTIVOS_RELACIONAIS.has(m)
}

// ─── Prazo ───────────────────────────────────────────────────────────────────
// A urgência não é mais declarada pelo professor: ela sai da data da última aula.
// O compromisso da operação é transferir em até 7 dias úteis a partir do envio,
// então avisar com menos que isso é pedir fora do acordado.

/** Dias úteis de antecedência que a operação se compromete a cumprir. */
export const PRAZO_DIAS_UTEIS = 7

/** Antecedência mínima aceita no formulário (dias de calendário). */
export const ANTECEDENCIA_MIN_DIAS = 1

/** Teto de agendamento, para erro de digitação não virar pedido para 2031. */
export const FUTURO_MAX_DIAS = 180

export type SituacaoPrazo = 'vencido' | 'fora_do_prazo' | 'no_prazo'

export const PRAZO_META: Record<SituacaoPrazo, { label: string; cls: string }> = {
  vencido:       { label: 'Última aula já passou', cls: 'bg-urg-critBg text-urg-critFg' },
  fora_do_prazo: { label: 'Fora do prazo',         cls: 'bg-urg-highBg text-urg-highFg' },
  no_prazo:      { label: 'No prazo',              cls: 'bg-urg-lowBg  text-urg-lowFg'  },
}

/**
 * Situação do pedido em relação ao prazo, a partir dos dias úteis restantes até
 * a última aula. `restantes` vindo de `diasUteisEntre(hoje, dataUltimaAula)`.
 *
 * 0 = a data já passou (a função de dias úteis devolve 0 para intervalo negativo)
 * — nesse caso o aluno já parou e ninguém processou, que é o pior cenário.
 */
export function situacaoPrazo(restantes: number, dataJaPassou: boolean): SituacaoPrazo {
  if (dataJaPassou) return 'vencido'
  return restantes >= PRAZO_DIAS_UTEIS ? 'no_prazo' : 'fora_do_prazo'
}

/** "7 dias úteis" / "1 dia útil" — concordância no singular. */
export function diasUteisLabel(n: number): string {
  return n === 1 ? '1 dia útil' : `${n} dias úteis`
}

// ─── Status do pedido na fila ────────────────────────────────────────────────

export type StatusTransferencia = 'pendente' | 'em_atendimento' | 'concluida' | 'recusada'

export const STATUS_TRANSFERENCIA_META: Record<StatusTransferencia, { label: string; cls: string }> = {
  pendente:       { label: 'Pendente',       cls: 'bg-urg-medBg text-urg-medFg' },
  em_atendimento: { label: 'Em atendimento', cls: 'bg-accentBlue-soft text-accentBlue' },
  concluida:      { label: 'Concluída',      cls: 'bg-urg-lowBg text-urg-lowFg' },
  recusada:       { label: 'Recusada',       cls: 'bg-surface-subtle text-ink-muted' },
}

// ─── Desfecho (preenchido por quem atende) ───────────────────────────────────
// Nem todo pedido de transferência vira transferência: parte é resolvida na
// conversa e parte esbarra num aluno que já estava de saída. Separar isso é o
// que permite medir depois quanto do pedido era, de fato, transferência.

export type DesfechoTransferencia = 'transferido' | 'mantido' | 'saiu_da_escola' | 'outro'

export const DESFECHOS_TRANSFERENCIA: {
  value: DesfechoTransferencia
  label: string
  ajuda: string
  cls: string
}[] = [
  { value: 'transferido',    label: 'Transferido',      ajuda: 'O aluno passou para outro professor.',        cls: 'bg-accentBlue-soft text-accentBlue' },
  { value: 'mantido',        label: 'Mantido',          ajuda: 'Resolvemos e o aluno segue com o professor.', cls: 'bg-urg-lowBg text-urg-lowFg' },
  { value: 'saiu_da_escola', label: 'Saiu da escola',   ajuda: 'O aluno deixou a escola antes da troca.',     cls: 'bg-urg-highBg text-urg-highFg' },
  { value: 'outro',          label: 'Outro',            ajuda: 'Explico na nota.',                            cls: 'bg-surface-subtle text-ink-secondary' },
]

const DESFECHO_META: Record<string, { label: string; cls: string }> =
  Object.fromEntries(DESFECHOS_TRANSFERENCIA.map(d => [d.value, { label: d.label, cls: d.cls }]))

export function desfechoMeta(d: string | null | undefined): { label: string; cls: string } | null {
  if (!d) return null
  return DESFECHO_META[d] ?? { label: d, cls: 'bg-surface-subtle text-ink-secondary' }
}

// ─── Status do aluno no roster ───────────────────────────────────────────────

export const STATUS_ALUNO_LABEL: Record<string, string> = {
  ativo:        'Ativo',
  pausado:      'Pausado',
  saiu:         'Saiu',
  desconhecido: 'Desconhecido',
}

export function statusAlunoLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return STATUS_ALUNO_LABEL[s] ?? s
}

/** "há 3 meses" / "há 12 dias" — tempo do aluno com o professor, que é o número
 *  que muda a leitura do pedido (2 semanas ≠ 2 anos). */
export function tempoDeVinculo(dias: number | null | undefined): string | null {
  if (dias == null || dias < 0) return null
  if (dias < 31)  return dias <= 1 ? 'há 1 dia' : `há ${dias} dias`
  const meses = Math.floor(dias / 30)
  if (meses < 12) return meses === 1 ? 'há 1 mês' : `há ${meses} meses`
  const anos = Math.floor(dias / 365)
  const resto = Math.floor((dias % 365) / 30)
  if (anos >= 1 && resto === 0) return anos === 1 ? 'há 1 ano' : `há ${anos} anos`
  return anos === 1 ? `há 1 ano e ${resto} m` : `há ${anos} anos e ${resto} m`
}
