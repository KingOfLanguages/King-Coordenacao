export type RoleUsuario = 'admin' | 'coordenacao' | 'suporte' | 'suporte_aluno'
export type StatusReuniao = 'pendente' | 'concluida' | 'cancelada'
export type TipoObservacao = 'reuniao' | 'ocorrencia' | 'feedback_positivo' | 'feedback_negativo' | 'feedback_neutro'
export type StatusProfessor = 'ativo' | 'pausa' | 'desligado'

export interface Profile {
  id: string
  nome: string
  role: RoleUsuario
  is_lider: boolean
  is_admin: boolean
  ativo: boolean
  created_at: string
  koalendar_link: string | null
  google_appointment_link: string | null
}

export interface Grupo {
  id: string
  nome: string
  coordenador_id: string | null
  ativo: boolean
  created_at: string
}

export type GrupoComCoordenador = Grupo & {
  coordenador?: { id: string; nome: string } | null
}

export interface Professor {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  kms_id: string | null
  status: StatusProfessor
  grupo_id: string | null
  coordenador_id: string | null
  monitoramento: boolean
  data_inicio: string | null
  tempo_na_king: string | null
  pausa: boolean
  saiu: boolean
  status_manual: boolean
  despausado_em: string | null
  despausado_por: string | null
  renda: string | null
  data_ultima_reuniao: string | null
  cidade: string | null
  estado: string | null
  nivel_recomendado_alunos: string | null
  created_at: string
}

// ─── Pausa de professores ─────────────────────────────────────────────────────

export type PausaStatus = 'pendente' | 'em_atendimento' | 'concluida' | 'recusada'

export interface Pausa {
  id: string
  professor_id: string
  motivo: string
  /** Último dia de aula — a pausa ativa nesta data (se já concluída). */
  data_inicio: string
  /** Dia em que a coordenação precisa entrar em contato para encerrar. */
  data_fim: string
  status: PausaStatus
  assumido_por: string | null
  assumido_em: string | null
  concluido_por: string | null
  concluido_em: string | null
  recusado_por: string | null
  recusado_em: string | null
  motivo_recusa: string | null
  /** NULL = ainda não virou status=pausa no professor. */
  ativada_em: string | null
  encerrada_em: string | null
  encerrada_por: string | null
  observacao_id: string | null
  tarefa_fim_id: string | null
  origem: string
  created_at: string
}

// ─── Transferência de aluno ───────────────────────────────────────────────────

export type StatusTransferencia = 'pendente' | 'em_atendimento' | 'concluida' | 'recusada'
export type DesfechoTransferencia = 'transferido' | 'mantido' | 'saiu_da_escola' | 'outro'

/** Foto do aluno + do professor no instante do pedido. Congelada por trigger
 *  porque o roster (professor_alunos_kms) é reescrito a cada sync e o vínculo
 *  some exatamente quando a transferência é efetivada. Ver 20260760. */
export interface TransferenciaSnapshot {
  capturado_em?: string
  aluno_encontrado?: boolean
  aluno_primeiro_nome?: string | null
  aluno_data_adicao?: string | null
  aluno_dias_com_professor?: number | null
  aluno_data_matricula_escola?: string | null
  aluno_status?: string | null
  aluno_status_vinculo?: string | null
  aluno_tipo_vinculo?: string | null
  aluno_saidas_historicas?: number
  professor_nome?: string | null
  professor_status?: string | null
  professor_data_inicio?: string | null
  professor_grupo?: string | null
  professor_coordenador?: string | null
  professor_score?: number | null
  professor_score_faixa?: string | null
  professor_qtd_alunos?: number
  professor_pedidos_antes?: number
  /** Dias úteis de antecedência no momento do envio — congelado, porque
   *  "faltam 3 dias" envelhece e "avisou com 3 dias" não. */
  prazo_dias_uteis?: number
  prazo_minimo?: number
  dentro_do_prazo?: boolean
}

export interface TransferenciaAluno {
  id: string
  professor_id: string
  /** NULL = professor não achou o aluno na lista e digitou o nome. */
  aluno_id: number | null
  aluno_nome: string
  aluno_da_lista: boolean
  motivo: string
  detalhe: string
  /** Último dia em que o aluno terá aula com este professor. Define a urgência
   *  do pedido — não existe mais urgência declarada. */
  data_ultima_aula: string
  ja_conversou: boolean | null
  aceita_manter: boolean | null
  status: StatusTransferencia
  assumido_por: string | null
  assumido_em: string | null
  concluido_por: string | null
  concluido_em: string | null
  recusado_por: string | null
  recusado_em: string | null
  motivo_recusa: string | null
  desfecho: DesfechoTransferencia | null
  desfecho_nota: string | null
  destino_professor_id: string | null
  snapshot: TransferenciaSnapshot | null
  observacao_id: string | null
  origem: string
  created_at: string
}

export interface Reuniao {
  id: string
  professor_id: string | null
  coordenador_id: string | null
  data: string
  status: StatusReuniao
  google_event_id: string | null
  meet_link: string | null
  notas: string | null
  created_at: string
}

export interface Observacao {
  id: string
  professor_id: string
  reuniao_id: string | null
  coordenador_id: string | null
  tipo: TipoObservacao
  texto: string
  created_at: string
}

export interface ProfessorEmail {
  id: string
  professor_id: string
  email: string
  origem: string | null
  created_at: string
}

export type StatusReuniaoProfessor = 'pendente' | 'realizada' | 'cancelada'

export interface ReuniaoProfessor {
  id: string
  reuniao_id: string
  professor_id: string | null
  status: StatusReuniaoProfessor
  numero: number | null
  observacao: string | null
  confirmado_em: string | null
  confirmado_por: string | null
  created_at: string
}

// ─── Agendamento coletivo (auto-agendamento por e-mail) ────────────────────────

export interface AgendaReuniao {
  id: string
  titulo: string
  descricao: string | null
  coordenador_id: string | null
  meet_link: string | null
  grupos_autorizados: string[] | null
  ativo: boolean
  created_at: string
}

export interface AgendaHorario {
  id: string
  agenda_id: string
  recorrencia_id: string | null
  data_hora: string
  capacidade: number
  meet_link: string | null
  ativo: boolean
  created_at: string
}

/** Dia da semana: 0=domingo … 6=sábado (igual ao Date#getDay()). */
export interface AgendaRecorrencia {
  id: string
  agenda_id: string
  dia_semana: number
  hora: string
  capacidade: number
  meet_link: string | null
  ativo: boolean
  created_at: string
}

export type StatusAgendaInscricao = 'confirmada' | 'cancelada'

export interface AgendaInscricao {
  id: string
  horario_id: string
  professor_id: string
  email_usado: string
  status: StatusAgendaInscricao
  created_at: string
}