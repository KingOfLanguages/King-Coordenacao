export type RoleUsuario = 'admin' | 'coordenacao' | 'suporte' | 'suporte_aluno'
export type StatusReuniao = 'pendente' | 'concluida' | 'cancelada'
export type TipoObservacao = 'reuniao' | 'ocorrencia' | 'feedback_positivo' | 'feedback_negativo'
export type StatusIncidente = 'pendente' | 'aprovado' | 'rejeitado'

export interface Profile {
  id: string
  nome: string
  role: RoleUsuario
  ativo: boolean
  created_at: string
}

export interface Professor {
  id: string
  nome: string
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
  professor_id: string
  coordenador_id: string | null
  data: string
  status: StatusReuniao
  google_event_id: string | null
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

export type UrgenciaNivel = 'baixa' | 'media' | 'alta'

export interface Incidente {
  id: string
  professor_id: string | null
  tipo: string
  descricao: string
  status: StatusIncidente
  urgencia: UrgenciaNivel
  solucao: string | null
  responsavel: string | null
  precisa_acompanhamento: boolean
  imagens: string[]
  criado_por: string | null
  aprovado_por: string | null
  created_at: string
}