export interface ProfessorPerfil {
  id: string
  nome: string
  email: string | null
  status: string
  data_inicio: string | null
  data_ultima_reuniao: string | null
  monitoramento: boolean
  grupo: { id: string; nome: string } | null
  coordenador_nome: string | null
}

export interface AvaliacaoAlunos {
  media_estrelas?: number
  total_avaliacoes?: number
  comentarios_positivos?: number
  comentarios_negativos?: number
  estrelas_5?: number
  estrelas_4?: number
  estrelas_3?: number
  estrelas_2?: number
  estrelas_1?: number
}

export interface AcompanhamentoResumo {
  score_atual: number | null
  score_faixa: string | null
  elegivel_alocacao: boolean | null
  reuniao_status: string | null
  reuniao_proxima: string | null
  avaliacao_alunos: AvaliacaoAlunos | null
  alertas: { label: string }[]
}

export interface ReuniaoHistoricoItem {
  id: string
  data: string
  status: 'pendente' | 'realizada' | 'cancelada'
  numero: number | null
}

/** Participante de uma reunião de grupo. */
export interface ParticipanteReuniao {
  reuniao_professor_id: string
  professor_id: string
  professor_nome: string
  status: 'pendente' | 'realizada' | 'cancelada'
  presente?: boolean  // Local state na extensão (não salvo; presente = realizada)
}

/** Participação (reuniao_professores) do professor numa reunião de hoje — mesma tabela que a
 * plataforma web usa em Reuniões do Dia, então confirmar/anotar aqui aparece lá também. */
export interface ReuniaoHojeInfo {
  participanteId: string
  reuniao_id?: string  // Necessário pra atualizar grupo; undefined se reunião 1:1 legada
  tipo_reuniao?: 'professor' | 'grupo'  // Detecta se é 1:1 ou grupo (Fase 3)
  status: 'pendente' | 'realizada' | 'cancelada'
  numero: number | null
  observacao: string | null
  participantes?: ParticipanteReuniao[]  // Preenchido só se tipo_reuniao='grupo'
}

export interface ObservacaoResumo {
  id: string
  tipo: string
  texto: string
  created_at: string
  resolvido: boolean
}

/** Incidente aberto de Mês de Análise (nexus_incidents, problem_type = 'Mês de análise'). */
export interface MesAnaliseResumo {
  id: string
  description: string
  urgency: string
  created_at: string
}

/** Ocorrências do King Nexus vinculadas ao professor — ver [[ktm-nexus-sync]]. */
export interface NexusOcorrencia {
  id: string
  problem_type: string
  urgency: string
  description: string
  resolved: boolean
  created_at: string
}

export interface NexusTrackingResumo {
  first_message_sent: boolean
  second_message_sent: boolean
  third_message_sent: boolean
  next_message_due: string | null
  forwarded_to_coordination: boolean
  problem_resolved: boolean
  recurrence_count: number
}

export interface NexusAlertaResumo {
  level: string
  total_count: number
}

export interface NexusResumo {
  ocorrencias: NexusOcorrencia[]
  ocorrenciasAbertasTotal: number
  tracking: NexusTrackingResumo | null
  alertas: NexusAlertaResumo[]
}

export interface ProfessorEncontrado {
  professor: ProfessorPerfil
  acompanhamento: AcompanhamentoResumo | null
  historicoReunioes: ReuniaoHistoricoItem[]
  totalReunioesRealizadas: number
  reuniaoHoje: ReuniaoHojeInfo | null
  observacoes: ObservacaoResumo[]
  observacoesAbertasTotal: number
  nexus: NexusResumo
  mesAnalise: MesAnaliseResumo | null
  motivo: 'email' | 'nome'
  /** Confiança do match automático por nome (0..1). null quando identificado por e-mail ou escolhido à mão. */
  confianca: number | null
}

export interface SessaoArmazenada {
  nome: string
  email: string
}

// ─── Mensagens entre content script / popup e background ─────────────────────

export type SugestaoProfessor = { id: string; nome: string; score: number }

export type MensagemParaBackground =
  | { tipo: 'BUSCAR_PROFESSOR'; nomes: string[]; emails: string[] }
  | { tipo: 'BUSCAR_PROFESSOR_POR_TEXTO'; texto: string }
  | { tipo: 'CARREGAR_PROFESSOR'; professorId: string }
  | { tipo: 'OBTER_SESSAO' }
  | { tipo: 'LOGIN'; email: string; senha: string }
  | { tipo: 'LOGOUT' }
  | { tipo: 'CRIAR_REUNIAO_AGORA'; professorId: string }
  | { tipo: 'CONFIRMAR_REUNIAO'; participanteId: string; professorId: string; aconteceu: boolean; observacao: string }
  | { tipo: 'SALVAR_OBSERVACAO_REUNIAO'; participanteId: string; observacao: string }
  | { tipo: 'CONFIRMAR_GRUPO'; reuniaoId: string; presentesIds: string[]; observacao: string; professorId: string }
  | { tipo: 'COLOCAR_MES_ANALISE'; professorId: string; descricao: string; urgencia?: string }
  | { tipo: 'RESOLVER_MES_ANALISE'; professorId: string; incidentId: string; resultado: string }
  | { tipo: 'RESOLVER_OBSERVACAO'; professorId: string; id: string; resolvido: boolean }
  | { tipo: 'CRIAR_OBSERVACAO'; professorId: string; tipoObs: string; texto: string }
  | { tipo: 'ABRIR_INCIDENTE'; professorId: string; problemType: string; urgency: string; description: string }

export type RespostaBuscarProfessor   = { ok: true; resultado: ProfessorEncontrado | null; sugestoes?: SugestaoProfessor[] }
export type RespostaSessao            = { ok: true; sessao: SessaoArmazenada | null }
export type RespostaLogin             = { ok: true } | { ok: false; erro: string }
export type RespostaLogout            = { ok: true }
export type RespostaReuniaoHoje       = { ok: true; reuniaoHoje: ReuniaoHojeInfo }
export type RespostaErro              = { ok: false; erro: string }

export type RespostaDoBackground =
  | RespostaBuscarProfessor
  | RespostaSessao
  | RespostaLogin
  | RespostaLogout
  | RespostaReuniaoHoje
  | RespostaErro
