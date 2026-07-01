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

/** Participação (reuniao_professores) do professor numa reunião de hoje — mesma tabela que a
 * plataforma web usa em Reuniões do Dia, então confirmar/anotar aqui aparece lá também. */
export interface ReuniaoHojeInfo {
  participanteId: string
  status: 'pendente' | 'realizada' | 'cancelada'
  numero: number | null
  observacao: string | null
}

export interface ObservacaoResumo {
  id: string
  tipo: string
  texto: string
  created_at: string
}

export interface ProfessorEncontrado {
  professor: ProfessorPerfil
  acompanhamento: AcompanhamentoResumo | null
  historicoReunioes: ReuniaoHistoricoItem[]
  totalReunioesRealizadas: number
  reuniaoHoje: ReuniaoHojeInfo | null
  observacoes: ObservacaoResumo[]
  motivo: 'email' | 'nome'
}

export interface SessaoArmazenada {
  nome: string
  email: string
}

// ─── Mensagens entre content script / popup e background ─────────────────────

export type MensagemParaBackground =
  | { tipo: 'BUSCAR_PROFESSOR'; nomes: string[]; emails: string[] }
  | { tipo: 'BUSCAR_PROFESSOR_POR_TEXTO'; texto: string }
  | { tipo: 'OBTER_SESSAO' }
  | { tipo: 'LOGIN'; email: string; senha: string }
  | { tipo: 'LOGOUT' }
  | { tipo: 'CRIAR_REUNIAO_AGORA'; professorId: string }
  | { tipo: 'CONFIRMAR_REUNIAO'; participanteId: string; professorId: string; aconteceu: boolean; observacao: string }
  | { tipo: 'SALVAR_OBSERVACAO_REUNIAO'; participanteId: string; observacao: string }

export type RespostaBuscarProfessor   = { ok: true; resultado: ProfessorEncontrado | null }
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
