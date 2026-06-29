export type RoleUsuario = 'admin' | 'coordenacao' | 'suporte' | 'suporte_aluno'
export type StatusReuniao = 'pendente' | 'concluida' | 'cancelada'
export type TipoObservacao = 'reuniao' | 'ocorrencia' | 'feedback_positivo' | 'feedback_negativo' | 'feedback_neutro'
export type StatusProfessor = 'ativo' | 'pausa' | 'desligado'

export interface Profile {
  id: string
  nome: string
  role: RoleUsuario
  ativo: boolean
  created_at: string
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
  kms_id: string | null
  status: StatusProfessor
  grupo_id: string | null
  coordenador_id: string | null
  monitoramento: boolean
  data_inicio: string | null
  tempo_na_king: string | null
  pausa: boolean
  saiu: boolean
  renda: string | null
  data_ultima_reuniao: string | null
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