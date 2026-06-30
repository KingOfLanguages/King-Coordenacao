export interface ProfessorPerfil {
  id: string
  nome: string
  status: string
  data_inicio: string | null
  grupo: { id: string; nome: string } | null
}

export interface ObservacaoResumo {
  id: string
  tipo: string
  texto: string
  created_at: string
}

export interface ProfessorEncontrado {
  professor: ProfessorPerfil
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

export type RespostaBuscarProfessor   = { ok: true; resultado: ProfessorEncontrado | null }
export type RespostaSessao            = { ok: true; sessao: SessaoArmazenada | null }
export type RespostaLogin             = { ok: true } | { ok: false; erro: string }
export type RespostaLogout            = { ok: true }
export type RespostaErro              = { ok: false; erro: string }

export type RespostaDoBackground =
  | RespostaBuscarProfessor
  | RespostaSessao
  | RespostaLogin
  | RespostaLogout
  | RespostaErro
