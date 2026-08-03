// Rótulos do ciclo de vida do aluno (saídas — retenção/turnover), vindos da API
// de Acompanhamento. Compartilhado entre a seção do professor e a página /retencao.

export const MOTIVO_SAIDA_LABEL: Record<string, string> = {
  nao_se_adaptou_metodologia:    'Não se adaptou à metodologia',
  mudanca_horario:               'Mudança de horário',
  prefere_mudar_professor:       'Preferiu mudar de professor',
  sem_motivo:                    'Sem motivo',
  motivo_financeiro:             'Financeiro',
  pausou_curso:                  'Pausou o curso',
  desligamento_da_escola:        'Desligamento da escola',
  aluno_adiou_data_inicio:       'Adiou a data de início',
  professor_recusou_aluno:       'Professor recusou o aluno',
  transferencia_outro_professor: 'Transferência p/ outro professor',
  mudanca_plano_aulas:           'Mudança de plano de aulas',
  nao_informado:                 'Não informado',
}

export function motivoSaidaLabel(m: string | null | undefined): string {
  if (!m) return 'Não informado'
  return MOTIVO_SAIDA_LABEL[m] ?? m
}
