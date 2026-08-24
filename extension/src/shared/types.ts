export interface ProfessorPerfil {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  status: string
  data_inicio: string | null
  data_ultima_reuniao: string | null
  monitoramento: boolean
  grupo: { id: string; nome: string } | null
  coordenador_nome: string | null
  cidade: string | null
  estado: string | null
  /** Nível de aluno recomendado (valor curado pela coordenação, não o cru da API). */
  nivel_recomendado_alunos: string | null
  /** Flag da API: o professor confirmou os dados cadastrais. false = telefone/e-mail podem estar velhos. */
  dados_atualizados: boolean | null
  /** Voltou de pausa manualmente — data do retorno. */
  despausado_em: string | null
}

/** Estado do professor no motor de Pendências de Lançamento do King (só quando
 *  ele está numa pendência aberta na fila). Base do desbloqueio direto no Meet. */
export interface PendenciaResumo {
  estagio: 1 | 2 | 3
  agendaBloqueada: boolean
  aulasPendentes: number
  dias: number
  qtdAlunos: number | null
  regularizado: boolean
  liberacaoManualExigida: boolean
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
  reuniao_ultima: string | null
  reuniao_proxima: string | null
  avaliacao_alunos: AvaliacaoAlunos | null
  /** `detalhe` traz as datas/motivos por trás do número (vai no title do chip). */
  alertas: { label: string; detalhe?: string }[]
  /** true só quando TODOS os horários estão bloqueados (professor fora de operação). */
  agenda_bloqueada: boolean | null
  motivos_bloqueio: { motivo: string; quantidade: number }[] | null
  /** Quando o King atualizou esses números pela última vez. */
  api_atualizado_em: string | null
}

/** Ponto mensal do score (professor_score_historico, ano_mes = YYYYMM). */
export interface ScorePonto {
  ano_mes: number
  score: number
}

/** Ponto da série de avaliação de alunos (professor_avaliacao_historico). */
export interface AvaliacaoPonto {
  dia: string
  media_estrelas: number | null
  total_avaliacoes: number | null
  comentarios_positivos: number | null
  comentarios_negativos: number | null
}

/** Um feedback datado, para a série de dois meses.
 *
 *  Duas fontes, com PRECISÃO DIFERENTE — por isso `origem` viaja junto:
 *   • `ktm`  = observação registrada pela coordenação (`observacoes.tipo`).
 *              Data exata, autor conhecido, texto disponível. É o dado bom.
 *   • `king` = variação do contador `avaliacao_alunos.comentarios_*` entre dois
 *              pontos de professor_avaliacao_historico. O King não expõe a data
 *              do comentário do aluno, só um acumulado; então a data aqui é o
 *              DIA EM QUE O NÚMERO MUDOU, que é o mais preciso possível. */
export interface FeedbackEvento {
  id: string
  /** YYYY-MM-DD. */
  dia: string
  tipo: 'positivo' | 'negativo' | 'neutro'
  origem: 'ktm' | 'king'
  /** Quantos feedbacks este ponto representa (o contador do King pode saltar mais de 1). */
  qtd: number
  /** Texto da observação (só existe na origem ktm). */
  texto: string | null
}

/** Série de feedbacks do mês corrente + o anterior. */
export interface FeedbacksJanela {
  /** Primeiro dia do mês anterior (YYYY-MM-DD). */
  inicio: string
  /** Primeiro dia do mês corrente (YYYY-MM-DD) — a divisa dos dois meses. */
  divisa: string
  eventos: FeedbackEvento[]
  /** true = existe histórico do King na janela (migration 20260771 aplicada e sincronizando). */
  temSerieKing: boolean
}

/** Aluno hoje na carteira do professor (roster KMS). */
export interface AlunoVinculado {
  aluno_id: number
  primeiro_nome: string | null
  data_adicao: string | null
  /** ativo | pausado | saiu | desconhecido */
  status_aluno: string | null
  /** vinculo_efetivado | aguardando_assinatura_contrato */
  status_vinculo_codigo: string | null
  data_matricula_escola: string | null
}

/** Aluno que SAIU deste professor (ciclo de vida — base do churn). */
export interface AlunoSaida {
  aluno_id: number
  primeiro_nome: string | null
  data_saida: string
  motivo_saida: string | null
  saiu_da_escola: boolean | null
}

export interface ReuniaoHistoricoItem {
  id: string
  data: string
  status: 'pendente' | 'realizada' | 'cancelada'
  numero: number | null
}

// ─── Ranking da reunião em grupo ─────────────────────────────────────────────

/** Um eixo do ranking (o "porquê" da posição) — espelha EixoRanking do app. */
export interface EixoRankingResumo {
  chave: 'score' | 'positivos' | 'incidentes' | 'negativos'
  titulo: string
  /** Contribuição em pontos: positiva soma, negativa desconta. */
  pontos: number
}

/** Um professor da chamada em grupo, já posicionado. */
export interface ItemRankingGrupo {
  professorId: string
  nome: string
  posicao: number
  pontos: number
  nivel: 'destaque' | 'regular' | 'atencao'
  eixos: EixoRankingResumo[]
  semScore: boolean
  score: number | null
  incidentes: number
  feedbacksPositivos: number
  feedbacksNegativos: number
  /** Como este professor entrou na lista. */
  origem: 'reuniao' | 'chamada'
  /** Confiança do match por nome, quando veio da chamada. */
  confianca: number | null
}

export interface RankingGrupo {
  itens: ItemRankingGrupo[]
  /** Nomes vistos na chamada que não casaram com nenhum professor ativo. */
  naoIdentificados: string[]
  /** Janela usada nos incidentes e feedbacks, em dias. */
  janelaDias: number
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
  /** Minha anotação PRIVADA desta reunião (reuniao_anotacoes_internas, RLS dono-apenas). */
  anotacaoInterna: string
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
  /** informe = registro; desafio = chamado com prazo. Linha antiga (null) vale como desafio. */
  natureza: 'informe' | 'desafio' | null
  aluno_nome: string | null
  prazo_resolucao: string | null
  /** Chamado espelhado no app do TI. */
  ti_status: string | null
  /** Quando alguém assumiu o chamado (null = ninguém pegou ainda). */
  assumido_em: string | null
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

// ─── Situação do professor fora do King (tabelas do próprio KTM) ─────────────

/** Pausa mais recente do professor (portal /pausa + fila do Suporte ao Aluno). */
export interface PausaResumo {
  id: string
  motivo: string
  /** Último dia de aula — o dia em que ele para. */
  data_inicio: string
  /** Dia do contato da coordenação para retomar. */
  data_fim: string
  status: 'pendente' | 'em_atendimento' | 'concluida' | 'recusada'
  ativada_em: string | null
  encerrada_em: string | null
  created_at: string
}

/** Pedido de transferência de aluno feito por este professor. */
export interface TransferenciaResumo {
  id: string
  aluno_nome: string
  motivo: string
  urgencia: string
  status: 'pendente' | 'em_atendimento' | 'concluida' | 'recusada'
  data_ultima_aula: string | null
  desfecho: string | null
  created_at: string
}

/** Convocação em aberto (Central de Convocações). */
export interface ConvocacaoResumo {
  id: string
  origem: string
  motivo: string | null
  etapa: 'pendente_contato' | 'aguardando_resposta' | 'agendada' | 'realizada'
  ultima_mensagem_em: string | null
  created_at: string
}

/** Tarefa aberta ligada a um incidente deste professor. */
export interface TarefaResumo {
  id: string
  titulo: string
  status: string
  atribuido_time: string | null
  created_at: string
}

/** Episódio de silêncio aberto (Central de Pendências / régua do King). */
export interface SilencioResumo {
  status: string
  dias_pendente: number | null
  dias_pico: number | null
  aulas_pendentes: number | null
  qtd_alunos: number | null
  precisa_mes_analise: boolean | null
  reuniao_solicitada: boolean | null
  aberto_em: string | null
}

/** Acompanhamento dos primeiros dias (página /onboarding). */
export interface OnboardingResumo {
  data_inicio: string | null
  /** 7 posições: 0 = não feito, 1 = feito. */
  dias: number[]
  observacao: string | null
  tag_texto: string | null
  tag_cor: string | null
}

/** Progresso na trilha de boas-vindas. */
export interface WelcomePathResumo {
  concluidas: number
  total: number
  revisaoPendente: number
  ultimaConclusao: string | null
}

/** Último e-mail que o sistema disparou para o professor. */
export interface EmailDisparoResumo {
  assunto: string
  tipo: string
  sucesso: boolean
  created_at: string
}

/** Tudo que está "em aberto" sobre o professor fora do King. */
export interface SituacaoResumo {
  pausa: PausaResumo | null
  transferencias: TransferenciaResumo[]
  convocacoes: ConvocacaoResumo[]
  tarefas: TarefaResumo[]
  silencio: SilencioResumo | null
  onboarding: OnboardingResumo | null
  welcomePath: WelcomePathResumo | null
  /** Está na lista de Mensagens do Dia de hoje? (e se já foi contatado) */
  contatoHoje: { enviado: boolean } | null
  ultimoEmail: EmailDisparoResumo | null
}

/** Um sinal do diagnóstico de confiabilidade (src/lib/confiabilidade.ts). */
export interface SinalResumo {
  titulo: string
  detalhe?: string
  tom: 'ok' | 'warn' | 'crit'
}

/** Veredito de risco operacional dos últimos 90 dias — mesma conta da tela do Comercial. */
export interface ConfiabilidadeResumo {
  veredito: 'confiavel' | 'atencao' | 'risco'
  pontos: number
  alertas: SinalResumo[]
  positivos: SinalResumo[]
}

/** Índice de Prioridade — a mesma nota que ordena a fila do Acompanhamento. */
export interface PrioridadeResumo {
  valor: number
  nivel: 'critica' | 'alta' | 'media' | 'baixa'
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
  /** Pendência de lançamento aberta na fila do King, se houver (habilita o desbloqueio). */
  pendencia: PendenciaResumo | null
  /** Total de alunos vinculados (roster KMS). */
  alunosTotal: number
  /** Carteira atual, com nome do aluno. */
  alunos: AlunoVinculado[]
  /** Saídas recentes (ciclo de vida) — quem deixou este professor. */
  alunosSaidas: AlunoSaida[]
  /** Série mensal do score, mais antigo → mais recente. */
  scoreHistorico: ScorePonto[]
  /** Série da avaliação de alunos, mais antigo → mais recente. */
  avaliacaoHistorico: AvaliacaoPonto[]
  /** Feedbacks datados do mês corrente + o anterior. */
  feedbacks: FeedbacksJanela
  /** Pausa, transferências, convocações, tarefas, silêncio, onboarding, trilha… */
  situacao: SituacaoResumo
  /** Veredito de 90 dias (null quando não há acompanhamento do King). */
  confiabilidade: ConfiabilidadeResumo | null
  prioridade: PrioridadeResumo
  /** id do professor no King (kms_id) — necessário pra ação de liberar agenda. */
  kmsId: number | null
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
  | { tipo: 'RANKEAR_GRUPO'; nomes: string[]; emails: string[]; reuniaoId?: string }
  | { tipo: 'CARREGAR_PROFESSOR'; professorId: string }
  | { tipo: 'OBTER_SESSAO' }
  | { tipo: 'LOGIN'; email: string; senha: string }
  | { tipo: 'LOGOUT' }
  | { tipo: 'CRIAR_REUNIAO_AGORA'; professorId: string }
  | { tipo: 'CONFIRMAR_REUNIAO'; participanteId: string; professorId: string; aconteceu: boolean; observacao: string }
  | { tipo: 'SALVAR_OBSERVACAO_REUNIAO'; participanteId: string; observacao: string }
  | { tipo: 'SALVAR_ANOTACAO_INTERNA'; reuniaoId: string; participanteId: string; texto: string }
  | { tipo: 'CONFIRMAR_GRUPO'; reuniaoId: string; presentesIds: string[]; observacao: string; professorId: string }
  | { tipo: 'COLOCAR_MES_ANALISE'; professorId: string; descricao: string; urgencia?: string }
  | { tipo: 'RESOLVER_MES_ANALISE'; professorId: string; incidentId: string; resultado: string }
  | { tipo: 'RESOLVER_OBSERVACAO'; professorId: string; id: string; resolvido: boolean }
  | { tipo: 'CRIAR_OBSERVACAO'; professorId: string; tipoObs: string; texto: string }
  | {
      tipo: 'ABRIR_INCIDENTE'; professorId: string; problemType: string; urgency: string; description: string
      /** informe = registro sem fluxo de resolução; desafio = chamado com prazo. Padrão: desafio. */
      natureza?: 'informe' | 'desafio'
      /** Aluno citado (vem do roster carregado no painel, ou digitado). */
      alunoNome?: string | null
      /** Data-limite (ISO). Sugerida pela urgência; só vale para natureza=desafio. */
      prazoResolucao?: string | null
    }
  | { tipo: 'LIBERAR_AGENDA'; professorId: string; idProfessor: number }

export type RespostaBuscarProfessor   = { ok: true; resultado: ProfessorEncontrado | null; sugestoes?: SugestaoProfessor[] }
export type RespostaRankingGrupo      = { ok: true; ranking: RankingGrupo }
export type RespostaSessao            = { ok: true; sessao: SessaoArmazenada | null }
export type RespostaLogin             = { ok: true } | { ok: false; erro: string }
export type RespostaLogout            = { ok: true }
export type RespostaReuniaoHoje       = { ok: true; reuniaoHoje: ReuniaoHojeInfo }
export type RespostaErro              = { ok: false; erro: string }

export type RespostaDoBackground =
  | RespostaBuscarProfessor
  | RespostaRankingGrupo
  | RespostaSessao
  | RespostaLogin
  | RespostaLogout
  | RespostaReuniaoHoje
  | RespostaErro
