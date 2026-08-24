import { supabase } from '../shared/supabase'
import {
  matchProfessorPorNome, matchProfessorPorEmail, sugerirProfessores, confiancaMatch, matchTodosPorNome,
} from '../shared/match'
// Regras de negócio compartilhadas com a plataforma web — importadas do app, e não
// copiadas, pra não existirem duas versões da mesma conta. Os dois módulos são puros
// (zero import de react/supabase), por isso entram no bundle da extensão sem arrastar
// a aplicação inteira junto.
import { diagnosticar, inicioJanela, dentroDaJanela, contarNaJanela } from '../../../src/lib/confiabilidade'
import { calcularPrioridade, nivelIdPara, INFORME_JANELA, REINCIDENCIA_MIN } from '../../../src/lib/prioridade'
import { ranquear, JANELA_DIAS as JANELA_RANKING } from '../../../src/lib/rankingProfessores'
import type {
  MensagemParaBackground, RespostaDoBackground, ProfessorEncontrado, ReuniaoHistoricoItem, ReuniaoHojeInfo,
  PendenciaResumo, SituacaoResumo, ConfiabilidadeResumo, PrioridadeResumo, NexusOcorrencia,
  WelcomePathResumo, SinalResumo, FeedbacksJanela, FeedbackEvento,
} from '../shared/types'

const PROBLEM_TYPE_MES_ANALISE = 'Mês de análise'

/** supabase-js só expõe error.message genérico em erros HTTP da function — o corpo
 *  JSON real ({error: "..."}) vem em error.context (a Response). Mesmo parser usado
 *  em src/hooks/useMesAnalise.ts na plataforma web (não compartilha módulo com a extensão). */
async function invocarMesAnalise(body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { data, error } = await supabase.functions.invoke('nexus-mes-analise', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx) {
      try {
        const parsed = await ctx.clone().json()
        if (parsed?.error) return { ok: false, erro: parsed.error }
      } catch { /* corpo não era JSON — usa error.message abaixo */ }
    }
    return { ok: false, erro: error.message }
  }
  if (data?.error) return { ok: false, erro: data.error }
  return { ok: true }
}

function limitesDeHoje(): { inicio: string; fim: string } {
  const inicio = new Date(); inicio.setHours(0, 0, 0, 0)
  const fim    = new Date(); fim.setHours(23, 59, 59, 999)
  return { inicio: inicio.toISOString(), fim: fim.toISOString() }
}

/** Participação (reuniao_professores) de hoje para este professor, se existir — mesma tabela
 * usada por Reuniões do Dia na plataforma web, então o que a extensão grava aparece lá também. */
async function buscarReuniaoHoje(professorId: string): Promise<ReuniaoHojeInfo | null> {
  const { inicio, fim } = limitesDeHoje()
  const { data } = await supabase
    .from('reuniao_professores')
    .select('id, reuniao_id, status, numero, observacao, reuniao:reunioes!reuniao_id!inner (data)')
    .eq('professor_id', professorId)
    .gte('reuniao.data', inicio)
    .lte('reuniao.data', fim)
    .order('created_at', { ascending: false })
    .limit(1)

  const row = data?.[0]
  if (!row) return null

  // Se reunião tem múltiplos participantes, é do tipo 'grupo'
  let tipoReuniao: 'professor' | 'grupo' | undefined
  let participantes: { reuniao_professor_id: string; professor_id: string; professor_nome: string; status: 'pendente' | 'realizada' | 'cancelada' }[] | undefined

  if (row.reuniao_id) {
    const { data: rpDados } = await supabase
      .from('reuniao_professores')
      .select('id, professor_id, professor:professores!professor_id (nome), status')
      .eq('reuniao_id', row.reuniao_id)

    if (rpDados && rpDados.length > 1) {
      tipoReuniao = 'grupo'
      participantes = rpDados.map(rp => {
        // O embed aninhado (professor:professores…) vem tipado como array pelo supabase-js.
        const prof = Array.isArray(rp.professor) ? rp.professor[0] : rp.professor
        return {
          reuniao_professor_id: rp.id,
          professor_id: rp.professor_id,
          professor_nome: (prof as { nome?: string } | null)?.nome ?? '—',
          status: rp.status as 'pendente' | 'realizada' | 'cancelada',
        }
      })
    }
  }

  return {
    participanteId: row.id,
    reuniao_id: row.reuniao_id,
    tipo_reuniao: tipoReuniao,
    status: row.status,
    numero: row.numero,
    observacao: row.observacao,
    participantes,
    anotacaoInterna: row.reuniao_id ? await buscarAnotacaoInterna(row.reuniao_id) : '',
  }
}

/** Minha anotação privada da reunião. A RLS de reuniao_anotacoes_internas é dono-apenas,
 *  então a consulta já volta só a minha — ninguém lê a anotação do outro nem aqui. */
async function buscarAnotacaoInterna(reuniaoId: string): Promise<string> {
  const { data } = await supabase
    .from('reuniao_anotacoes_internas')
    .select('texto')
    .eq('reuniao_id', reuniaoId)
    .maybeSingle()
  return data?.texto ?? ''
}

async function handleLogin(email: string, senha: string): Promise<RespostaDoBackground> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error || !data.session) {
    return { ok: false, erro: error?.message === 'Invalid login credentials'
      ? 'E-mail ou senha inválidos.'
      : (error?.message ?? 'Erro ao entrar.') }
  }
  return { ok: true }
}

async function handleLogout(): Promise<RespostaDoBackground> {
  await supabase.auth.signOut()
  return { ok: true }
}

async function handleObterSessao(): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: true, sessao: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('nome')
    .eq('id', session.user.id)
    .maybeSingle()

  return {
    ok: true,
    sessao: { nome: profile?.nome ?? session.user.email ?? 'Usuário', email: session.user.email ?? '' },
  }
}

/** "2026-08-21" → "21/08". Usado nos detalhes dos alertas (lista de datas). */
function diaMes(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function listaDeDatas(datas: string[] | undefined, max = 6): string | undefined {
  if (!datas?.length) return undefined
  const mostradas = datas.slice(0, max).map(diaMes).join(', ')
  return datas.length > max ? `${mostradas} +${datas.length - max}` : mostradas
}

/** Monta a lista de alertas ativos a partir do snapshot de acompanhamento (mesma regra da tela web).
 *  `detalhe` é o que estava se perdendo até agora: as datas das faltas/no-shows e os motivos
 *  do bloqueio, que é o que a coordenação precisa citar na conversa. */
function montarAlertas(acomp: {
  aulas_pendentes_qtd: number
  aulas_pendentes_data_mais_antiga: string | null
  faltas_professor: { quantidade?: number; datas?: string[] } | null
  no_show_primeira_aula: { quantidade?: number; datas?: string[] } | null
  agendas_bloqueadas: { quantidade_horarios?: number; motivos?: { motivo: string; quantidade: number }[] } | null
  trocas_professor: { aluno_id?: number; tipo?: string; data?: string; motivo?: string }[] | null
}): { label: string; detalhe?: string }[] {
  return [
    acomp.aulas_pendentes_qtd > 0 && {
      label: `${acomp.aulas_pendentes_qtd} aula(s) pendente(s)`,
      detalhe: acomp.aulas_pendentes_data_mais_antiga
        ? `mais antiga em ${diaMes(acomp.aulas_pendentes_data_mais_antiga)}`
        : undefined,
    },
    (acomp.faltas_professor?.quantidade ?? 0) > 0 && {
      label: `${acomp.faltas_professor!.quantidade} falta(s) do professor`,
      detalhe: listaDeDatas(acomp.faltas_professor?.datas),
    },
    (acomp.no_show_primeira_aula?.quantidade ?? 0) > 0 && {
      label: `${acomp.no_show_primeira_aula!.quantidade} no-show de 1ª aula`,
      detalhe: listaDeDatas(acomp.no_show_primeira_aula?.datas),
    },
    (acomp.agendas_bloqueadas?.quantidade_horarios ?? 0) > 0 && {
      label: `${acomp.agendas_bloqueadas!.quantidade_horarios} horário(s) bloqueado(s)`,
      detalhe: acomp.agendas_bloqueadas?.motivos?.map(m => `${m.motivo} (${m.quantidade})`).join(' · '),
    },
    (acomp.trocas_professor?.length ?? 0) > 0 && {
      label: `${acomp.trocas_professor!.length} troca(s) de professor`,
      detalhe: acomp.trocas_professor
        ?.slice(0, 4)
        .map(t => [t.data && diaMes(t.data), t.motivo].filter(Boolean).join(': '))
        .filter(Boolean)
        .join(' · ') || undefined,
    },
  ].filter(Boolean) as { label: string; detalhe?: string }[]
}

/** "YYYY-MM-DD" no fuso local (toISOString jogaria pro dia anterior à noite). */
function diaLocal(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

/** Primeiro dia do mês corrente e do anterior — a janela fixa do gráfico de feedbacks. */
function janelaDoisMeses(): { inicio: string; divisa: string; inicioISO: string } {
  const hoje = new Date()
  const divisa = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  return { inicio: diaLocal(inicio), divisa: diaLocal(divisa), inicioISO: inicio.toISOString() }
}

/** Feedbacks datados do mês corrente + o anterior, das duas fontes.
 *
 *  Os do KTM (`observacoes`) são eventos com data exata. Os do King são
 *  derivados da VARIAÇÃO do contador `comentarios_*` entre dois pontos do
 *  histórico: o King só publica um acumulado, então o dia em que o número subiu
 *  é o mais perto que dá pra chegar da data real do comentário do aluno.
 *  Queda no contador (aluno apagou o comentário, recontagem) é ignorada. */
async function buscarFeedbacks(professorId: string): Promise<FeedbacksJanela> {
  const { inicio, divisa, inicioISO } = janelaDoisMeses()

  const [obsRes, histRes] = await Promise.all([
    supabase
      .from('observacoes')
      .select('id, tipo, texto, created_at')
      .eq('professor_id', professorId)
      .in('tipo', ['feedback_positivo', 'feedback_negativo', 'feedback_neutro'])
      .gte('created_at', inicioISO)
      .order('created_at', { ascending: true }),
    // Um ponto ANTES da janela também vem: sem ele não há base pra calcular a
    // primeira variação, e o 1º dia do mês anterior nasceria sempre zerado.
    supabase
      .from('professor_avaliacao_historico')
      .select('dia, comentarios_positivos, comentarios_negativos')
      .eq('professor_id', professorId)
      .order('dia', { ascending: false })
      .limit(140),
  ])

  const eventos: FeedbackEvento[] = (obsRes.data ?? []).map(o => ({
    id: o.id,
    dia: diaLocal(new Date(o.created_at)),
    tipo: o.tipo === 'feedback_negativo' ? 'negativo' : o.tipo === 'feedback_positivo' ? 'positivo' : 'neutro',
    origem: 'ktm' as const,
    qtd: 1,
    texto: o.texto ?? null,
  }))

  const hist = [...(histRes.data ?? [])].reverse() as {
    dia: string; comentarios_positivos: number | null; comentarios_negativos: number | null
  }[]
  const naJanela = hist.filter(h => h.dia >= inicio)

  for (let i = 1; i < hist.length; i++) {
    const antes = hist[i - 1], agora = hist[i]
    if (agora.dia < inicio) continue
    const dNeg = (agora.comentarios_negativos ?? 0) - (antes.comentarios_negativos ?? 0)
    const dPos = (agora.comentarios_positivos ?? 0) - (antes.comentarios_positivos ?? 0)
    if (dNeg > 0) eventos.push({ id: `k-neg-${agora.dia}`, dia: agora.dia, tipo: 'negativo', origem: 'king', qtd: dNeg, texto: null })
    if (dPos > 0) eventos.push({ id: `k-pos-${agora.dia}`, dia: agora.dia, tipo: 'positivo', origem: 'king', qtd: dPos, texto: null })
  }

  eventos.sort((a, b) => a.dia.localeCompare(b.dia))
  return { inicio, divisa, eventos, temSerieKing: naJanela.length > 0 }
}

/** Categorias da aba Plataforma — chamados de TI "sobre" o professor, que não são
 *  falha dele e por isso ficam fora do veredito. Espelha CATEGORIAS_PLATAFORMA
 *  em src/hooks/useIncidentes.ts (que não dá pra importar: arrasta react-query junto). */
const CATEGORIAS_PLATAFORMA = new Set(['Bugs', 'Melhorias'])

/** Tudo que está em aberto sobre o professor FORA do King: pausa, transferência,
 *  convocação, tarefa, silêncio, onboarding, trilha, mensagem do dia e e-mail.
 *  Cada consulta é independente e falha em silêncio (RLS de cargo pode barrar
 *  qualquer uma delas — quem não enxerga a fila simplesmente não vê o bloco). */
async function buscarSituacao(professorId: string, incidenteIds: string[]): Promise<SituacaoResumo> {
  const hojeISO = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local

  const [
    pausaRes, transfRes, convocRes, tarefasRes, silencioRes,
    onboardingRes, wpProgressoRes, wpEtapasRes, contatoRes, emailRes,
  ] = await Promise.all([
    supabase
      .from('pausas')
      .select('id, motivo, data_inicio, data_fim, status, ativada_em, encerrada_em, created_at')
      .eq('professor_id', professorId)
      .neq('status', 'recusada')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('transferencias_aluno')
      .select('id, aluno_nome, motivo, urgencia, status, data_ultima_aula, desfecho, created_at')
      .eq('professor_id', professorId)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('convocacoes')
      .select('id, origem, motivo, etapa, ultima_mensagem_em, created_at')
      .eq('professor_id', professorId)
      .neq('etapa', 'realizada')
      .order('created_at', { ascending: false })
      .limit(4),
    // tarefas não tem professor_id — o vínculo é pelo incidente que a originou.
    incidenteIds.length
      ? supabase
          .from('tarefas')
          .select('id, titulo, status, atribuido_time, created_at')
          .in('incidente_id', incidenteIds)
          .neq('status', 'concluido')
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    supabase
      .from('acompanhamento_silencio')
      .select('status, dias_pendente, dias_pico, aulas_pendentes, qtd_alunos, precisa_mes_analise, reuniao_solicitada, aberto_em')
      .eq('professor_id', professorId)
      .maybeSingle(),
    supabase
      .from('onboarding_professores')
      .select('data_inicio, dias, observacao, tag_texto, tag_cor')
      .eq('professor_id', professorId)
      .maybeSingle(),
    supabase
      .from('welcome_path_progresso')
      .select('etapa_id, concluida_em, revisao_pendente')
      .eq('professor_id', professorId),
    supabase
      .from('welcome_path_etapas')
      .select('id', { count: 'exact', head: true })
      .eq('ativa', true),
    supabase
      .from('contatos_diarios')
      .select('enviado')
      .eq('professor_id', professorId)
      .eq('data', hojeISO)
      .limit(1),
    supabase
      .from('email_disparos')
      .select('assunto, tipo, sucesso, created_at')
      .eq('professor_id', professorId)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  const progresso = wpProgressoRes.data ?? []
  const concluidas = progresso.filter(p => p.concluida_em)
  const welcomePath: WelcomePathResumo | null = progresso.length || (wpEtapasRes.count ?? 0) > 0
    ? {
        concluidas: concluidas.length,
        total: wpEtapasRes.count ?? progresso.length,
        revisaoPendente: progresso.filter(p => p.revisao_pendente).length,
        ultimaConclusao: concluidas.map(p => p.concluida_em as string).sort().pop() ?? null,
      }
    : null

  return {
    pausa: pausaRes.data?.[0] ?? null,
    transferencias: transfRes.data ?? [],
    convocacoes: convocRes.data ?? [],
    tarefas: tarefasRes.data ?? [],
    silencio: silencioRes.data ?? null,
    onboarding: onboardingRes.data ?? null,
    welcomePath,
    contatoHoje: contatoRes.data?.[0] ? { enviado: contatoRes.data[0].enviado } : null,
    ultimoEmail: emailRes.data?.[0] ?? null,
  }
}

/** Acompanhamento cru como vem do select (só o que estas duas contas usam). */
type AcompLinha = {
  score_atual: number | null
  score_faixa: string | null
  aulas_pendentes_qtd: number
  aulas_pendentes_data_mais_antiga: string | null
  faltas_professor: { quantidade?: number; datas?: string[] } | null
  no_show_primeira_aula: { quantidade?: number; datas?: string[] } | null
  trocas_professor: { data?: string }[] | null
  agenda_bloqueada: boolean | null
} | null

/** Veredito de risco dos últimos 90 dias — chama o MESMO diagnosticar() da tela do
 *  Comercial, com as mesmas entradas de useConfiabilidadeProfessor. */
function montarConfiabilidade(
  incidentes: NexusOcorrencia[],
  acomp: AcompLinha,
  feedbacksNegativos: number,
): ConfiabilidadeResumo | null {
  if (!acomp && incidentes.length === 0) return null

  const corte = inicioJanela()
  const corteIso = corte.toISOString()

  const janela = incidentes
    .filter(i => i.problem_type !== PROBLEM_TYPE_MES_ANALISE && i.created_at >= corteIso)
    .map(i => ({
      id: i.id,
      problem_type: i.problem_type,
      urgency: i.urgency,
      description: i.description ?? '',
      aluno_nome: i.aluno_nome,
      // natureza nula = linha antiga: o app inteiro trata como desafio.
      natureza: (i.natureza === 'informe' ? 'informe' : 'desafio') as 'informe' | 'desafio',
      resolved: i.resolved,
      created_at: i.created_at,
      plataforma: CATEGORIAS_PLATAFORMA.has(i.problem_type),
    }))

  const d = diagnosticar({
    incidentes: janela,
    feedbacksNegativos,
    faltas: contarNaJanela(acomp?.faltas_professor, corte),
    noShowPrimeiraAula: contarNaJanela(acomp?.no_show_primeira_aula, corte),
    trocas: (acomp?.trocas_professor ?? []).filter(t => dentroDaJanela(t?.data, corte)).length,
    aulasPendentes: acomp?.aulas_pendentes_qtd ?? 0,
    agendaBloqueada: acomp?.agenda_bloqueada === true,
    scoreFaixa: acomp?.score_faixa ?? null,
  })

  const enxugar = (s: { titulo: string; detalhe?: string; tom: SinalResumo['tom'] }): SinalResumo =>
    ({ titulo: s.titulo, detalhe: s.detalhe, tom: s.tom })

  return {
    veredito: d.veredito,
    pontos: d.pontos,
    alertas: d.alertas.map(enxugar),
    positivos: d.positivos.map(enxugar),
  }
}

/** Índice de Prioridade — mesma conta que ordena a fila do Acompanhamento
 *  (usePainelProfessores). Serve pra saber POR QUE este professor está no topo. */
function montarPrioridade(
  acomp: AcompLinha,
  incidentes: NexusOcorrencia[],
  situacao: SituacaoResumo,
): PrioridadeResumo {
  const desdeInformes = new Date(Date.now() - INFORME_JANELA * 86_400_000).toISOString()
  const informes = incidentes.filter(i => i.natureza === 'informe' && i.created_at >= desdeInformes)

  const porCategoria = new Map<string, number>()
  for (const i of informes) porCategoria.set(i.problem_type, (porCategoria.get(i.problem_type) ?? 0) + 1)
  const reincidente = [...porCategoria.values()].some(n => n >= REINCIDENCIA_MIN)

  // Pausa vigente cujo contato de encerramento já venceu (mesma regra do painel web).
  const p = situacao.pausa
  const vigente = p && p.ativada_em && !p.encerrada_em ? p : null
  const fimMs = vigente ? new Date(`${vigente.data_fim}T00:00:00`).getTime() : null
  const pausaVencidaDias = fimMs != null && fimMs <= Date.now()
    ? Math.floor((Date.now() - fimMs) / 86_400_000)
    : null

  const dias = acomp?.aulas_pendentes_data_mais_antiga
    ? Math.max(0, Math.floor((Date.now() - new Date(acomp.aulas_pendentes_data_mais_antiga).getTime()) / 86_400_000))
    : 0

  const valor = calcularPrioridade(
    acomp?.score_atual ?? null,
    acomp?.aulas_pendentes_qtd ?? 0,
    dias,
    informes.length,
    reincidente,
    pausaVencidaDias,
  )

  return { valor: Math.round(valor), nivel: nivelIdPara(valor) }
}

/** Busca todas as infos relevantes do professor (perfil, acompanhamento, reuniões, observações). */
async function montarResultado(
  professorId: string,
  motivo: 'email' | 'nome',
  confianca: number | null = null,
): Promise<ProfessorEncontrado | null> {
  const [
    profRes, acompRes, historicoRes, totalRes, obsRes, obsAbertasRes, negativos90Res, reuniaoHoje,
    nexusIncidentesRes, nexusTrackingRes, nexusAlertasRes,
    alunosRes, saidasRes, scoreHistRes, avaliacaoHistRes,
  ] = await Promise.all([
    supabase
      .from('professores')
      .select('id, nome, email, telefone, kms_id, status, data_inicio, data_ultima_reuniao, monitoramento, cidade, estado, nivel_recomendado_alunos, dados_atualizados, despausado_em, grupo:grupos!grupo_id (id, nome), coordenador:profiles!coordenador_id (nome)')
      .eq('id', professorId)
      .maybeSingle(),
    supabase
      .from('professor_acompanhamento')
      .select('score_atual, score_faixa, elegivel_alocacao, reuniao_status, reuniao_ultima, reuniao_proxima, avaliacao_alunos, aulas_pendentes_qtd, aulas_pendentes_data_mais_antiga, faltas_professor, no_show_primeira_aula, agendas_bloqueadas, trocas_professor, agenda_bloqueada, motivos_bloqueio, api_atualizado_em')
      .eq('professor_id', professorId)
      .maybeSingle(),
    supabase
      .from('reuniao_professores')
      .select('id, status, numero, created_at, reuniao:reunioes!reuniao_id (data)')
      .eq('professor_id', professorId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('reuniao_professores')
      .select('id', { count: 'exact', head: true })
      .eq('professor_id', professorId)
      .eq('status', 'realizada'),
    supabase
      .from('observacoes')
      .select('id, tipo, texto, created_at, resolvido')
      .eq('professor_id', professorId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('observacoes')
      .select('id', { count: 'exact', head: true })
      .eq('professor_id', professorId)
      .eq('tipo', 'ocorrencia')
      .eq('resolvido', false),
    // Feedbacks negativos na janela de 90 dias — entram no veredito de confiabilidade.
    supabase
      .from('observacoes')
      .select('id', { count: 'exact', head: true })
      .eq('professor_id', professorId)
      .eq('tipo', 'feedback_negativo')
      .gte('created_at', inicioJanela().toISOString()),
    buscarReuniaoHoje(professorId),
    // UMA consulta de incidentes serve a tudo: lista do painel, contagem de abertos,
    // Mês de Análise, veredito de confiabilidade (90d) e as tarefas ligadas a eles.
    supabase
      .from('nexus_incidents')
      .select('id, problem_type, urgency, description, resolved, created_at, natureza, aluno_nome, prazo_resolucao, ti_status, assumido_em')
      .eq('professor_id', professorId)
      .order('created_at', { ascending: false }),
    supabase
      .from('nexus_teacher_tracking')
      .select('first_message_sent, second_message_sent, third_message_sent, next_message_due, forwarded_to_coordination, problem_resolved, recurrence_count')
      .eq('professor_id', professorId)
      .order('updated_at', { ascending: false })
      .limit(1),
    supabase
      .from('nexus_mes_analise_alerts')
      .select('level, total_count')
      .eq('professor_id', professorId)
      .order('created_at', { ascending: false }),
    // Carteira com NOME do aluno (antes só a contagem). O kms-api-sync já grava
    // apenas tipo_vinculo=aluno aqui — turmas (aluno_id 0) ficam de fora.
    supabase
      .from('professor_alunos_kms')
      .select('aluno_id, primeiro_nome, data_adicao, status_aluno, status_vinculo_codigo, data_matricula_escola')
      .eq('professor_id', professorId)
      .order('data_adicao', { ascending: false }),
    // Quem SAIU deste professor (ciclo de vida) — o churn que a extensão não enxergava.
    supabase
      .from('professor_ciclo_vida_alunos')
      .select('aluno_id, primeiro_nome, data_saida, motivo_saida, saiu_da_escola')
      .eq('professor_id', professorId)
      .order('data_saida', { ascending: false })
      .limit(12),
    // Séries dos gráficos: score mensal (YYYYMM) e avaliação de alunos ao longo do tempo.
    supabase
      .from('professor_score_historico')
      .select('ano_mes, score')
      .eq('professor_id', professorId)
      .order('ano_mes', { ascending: false })
      .limit(18),
    // professor_avaliacao_historico nasceu na migration 20260771 — enquanto ela não
    // roda em produção o erro é engolido e o gráfico simplesmente não aparece.
    supabase
      .from('professor_avaliacao_historico')
      .select('dia, media_estrelas, total_avaliacoes, comentarios_positivos, comentarios_negativos')
      .eq('professor_id', professorId)
      .order('dia', { ascending: false })
      .limit(24),
  ])
  if (profRes.error || !profRes.data) return null
  const prof = profRes.data
  const acomp = acompRes.data
  const alunos = alunosRes.data ?? []

  const incidentes = (nexusIncidentesRes.data ?? []) as NexusOcorrencia[]
  const mesAnalise = incidentes.find(i => i.problem_type === PROBLEM_TYPE_MES_ANALISE && !i.resolved) ?? null

  // kms_id → pendência aberta na fila do King (se houver). Habilita o desbloqueio.
  const kmsId = prof.kms_id && !Number.isNaN(Number(prof.kms_id)) ? Number(prof.kms_id) : null
  const [pendencia, situacao, feedbacks] = await Promise.all([
    kmsId != null ? buscarPendencia(kmsId) : Promise.resolve(null),
    // Só os 40 incidentes mais recentes viram filtro de tarefas — a lista vai na
    // querystring do PostgREST e não vale estourar a URL por um professor antigo.
    buscarSituacao(professorId, incidentes.slice(0, 40).map(i => i.id)),
    buscarFeedbacks(professorId),
  ])

  const historicoReunioes = (historicoRes.data ?? [])
    .map(h => {
      const reuniao = Array.isArray(h.reuniao) ? h.reuniao[0] : h.reuniao
      return { id: h.id, status: h.status, numero: h.numero, data: reuniao?.data ?? h.created_at }
    })
    .filter((h): h is ReuniaoHistoricoItem => !!h.data)

  return {
    professor: {
      id: prof.id,
      nome: prof.nome,
      email: prof.email,
      telefone: prof.telefone,
      status: prof.status,
      data_inicio: prof.data_inicio,
      data_ultima_reuniao: prof.data_ultima_reuniao,
      monitoramento: prof.monitoramento,
      grupo: Array.isArray(prof.grupo) ? prof.grupo[0] ?? null : prof.grupo,
      coordenador_nome: (Array.isArray(prof.coordenador) ? prof.coordenador[0] : prof.coordenador)?.nome ?? null,
      cidade: prof.cidade ?? null,
      estado: prof.estado ?? null,
      nivel_recomendado_alunos: prof.nivel_recomendado_alunos ?? null,
      dados_atualizados: prof.dados_atualizados ?? null,
      despausado_em: prof.despausado_em ?? null,
    },
    acompanhamento: acomp
      ? {
          score_atual: acomp.score_atual,
          score_faixa: acomp.score_faixa,
          elegivel_alocacao: acomp.elegivel_alocacao,
          reuniao_status: acomp.reuniao_status,
          reuniao_ultima: acomp.reuniao_ultima ?? null,
          reuniao_proxima: acomp.reuniao_proxima,
          avaliacao_alunos: acomp.avaliacao_alunos,
          alertas: montarAlertas(acomp),
          agenda_bloqueada: acomp.agenda_bloqueada ?? null,
          motivos_bloqueio: acomp.motivos_bloqueio ?? null,
          api_atualizado_em: acomp.api_atualizado_em ?? null,
        }
      : null,
    historicoReunioes,
    totalReunioesRealizadas: totalRes.count ?? 0,
    reuniaoHoje,
    observacoes: obsRes.data ?? [],
    observacoesAbertasTotal: obsAbertasRes.count ?? 0,
    nexus: {
      ocorrencias: incidentes.slice(0, 5),
      ocorrenciasAbertasTotal: incidentes.filter(i => !i.resolved).length,
      tracking: nexusTrackingRes.data?.[0] ?? null,
      alertas: nexusAlertasRes.data ?? [],
    },
    mesAnalise: mesAnalise && {
      id: mesAnalise.id, description: mesAnalise.description,
      urgency: mesAnalise.urgency, created_at: mesAnalise.created_at,
    },
    pendencia,
    alunosTotal: alunos.length,
    alunos,
    alunosSaidas: saidasRes.data ?? [],
    // As duas séries chegam em ordem decrescente (pra o limit pegar o mais recente)
    // e são invertidas aqui — o gráfico desenha da esquerda (antigo) pra direita.
    scoreHistorico: [...(scoreHistRes.data ?? [])].reverse(),
    avaliacaoHistorico: [...(avaliacaoHistRes.data ?? [])].reverse(),
    feedbacks,
    situacao,
    confiabilidade: montarConfiabilidade(incidentes, acomp, negativos90Res.count ?? 0),
    prioridade: montarPrioridade(acomp, incidentes, situacao),
    kmsId,
    motivo,
    confianca,
  }
}

interface PendenciaApiItem {
  id_Professor: number
  estagio: 1 | 2 | 3
  agendaBloqueada: boolean
  aulasPendentes: number
  dias: number
  qtdAlunos: number | null
  regularizado: boolean
  liberacaoManualExigida: boolean
}

/** Pendência aberta do professor (por kms_id) na fila do motor do King. A Edge
 *  Function é a mesma do app web (a sessão do usuário já autentica). Falha vira null. */
async function buscarPendencia(kmsId: number): Promise<PendenciaResumo | null> {
  try {
    const { data, error } = await supabase.functions.invoke('pendencias-lancamento', { body: { resource: 'fila' } })
    if (error || data?.error) return null
    const lista = (data?.object ?? []) as PendenciaApiItem[]
    const item = lista.find(p => Number(p.id_Professor) === kmsId)
    if (!item) return null
    return {
      estagio: item.estagio,
      agendaBloqueada: item.agendaBloqueada,
      aulasPendentes: item.aulasPendentes,
      dias: item.dias,
      qtdAlunos: item.qtdAlunos,
      regularizado: item.regularizado,
      liberacaoManualExigida: item.liberacaoManualExigida,
    }
  } catch {
    return null
  }
}

/** Libera a agenda bloqueada do professor direto do Meet — espelha useLiberarAgenda
 *  do app (resource=liberarAgenda). Re-monta o resultado pra refletir o novo estado. */
async function handleLiberarAgenda(professorId: string, idProfessor: number): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }

  const { data, error } = await supabase.functions.invoke('pendencias-lancamento', {
    body: { resource: 'liberarAgenda', id_Professor: idProfessor },
  })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx) {
      try { const parsed = await ctx.clone().json(); if (parsed?.error) return { ok: false, erro: parsed.error } } catch { /* corpo não-JSON */ }
    }
    return { ok: false, erro: error.message }
  }
  if (data?.error) return { ok: false, erro: data.error }

  const resultado = await montarResultado(professorId, 'nome')
  return resultado ? { ok: true, resultado } : { ok: false, erro: 'Agenda liberada, mas não consegui recarregar o professor.' }
}

async function handleBuscarProfessor(nomes: string[], emails: string[]): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }

  // Professores ATIVOS (com e-mail canônico) — base do match por e-mail E por nome.
  const { data: ativosRaw } = await supabase
    .from('professores')
    .select('id, nome, email')
    .eq('status', 'ativo')
  const professores = ativosRaw ?? []

  // 1 — Match por e-mail (mais confiável), só entre ativos. Duas fontes:
  //   a. professores.email  — e-mail canônico do cadastro/KMS (fonte primária)
  //   b. professor_emails    — e-mails adicionais aprendidos no vínculo, restritos aos ativos
  if (emails.length) {
    const ativosIds = new Set(professores.map(p => p.id))
    const { data: extras } = await supabase
      .from('professor_emails')
      .select('professor_id, email')
    const emailRows = [
      ...(extras ?? []).filter(r => ativosIds.has(r.professor_id)),
      ...professores
        .filter((p): p is { id: string; nome: string; email: string } => !!p.email)
        .map(p => ({ professor_id: p.id, email: p.email })),
    ]
    const profId = matchProfessorPorEmail(emails, emailRows)
    if (profId) {
      const resultado = await montarResultado(profId, 'email')
      if (resultado) return { ok: true, resultado }
    }
  }

  // 2 — Fallback: match por nome, SÓ entre professores ativos.
  if (nomes.length) {
    const match = matchProfessorPorNome(nomes, professores)
    if (match) {
      const resultado = await montarResultado(match.id, 'nome', confiancaMatch(nomes, match.nome))
      if (resultado) return { ok: true, resultado }
    }
  }

  return { ok: true, resultado: null }
}

/**
 * Ranking da reunião em grupo: identifica TODOS os professores da chamada e os
 * ordena do melhor ao pior pela régua interna (score, incidentes, feedbacks).
 *
 * Quem entra na lista vem de duas fontes, unidas e sem repetição:
 *   • os participantes agendados da reunião de hoje (`reuniao_professores`) —
 *     fonte autoritativa, com nome do cadastro;
 *   • os nomes lidos do DOM do Meet, casados contra os professores ativos —
 *     pega quem entrou na chamada sem estar na agenda.
 *
 * As métricas saem em CONSULTAS EM LOTE (uma por tabela, com `in`), e não uma
 * por professor: com dez participantes seriam trinta idas ao banco a cada
 * atualização do painel.
 */
async function handleRankearGrupo(
  nomes: string[], emails: string[], reuniaoId?: string,
): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }

  const { data: ativosRaw } = await supabase
    .from('professores')
    .select('id, nome, email')
    .eq('status', 'ativo')
  const ativos = ativosRaw ?? []

  // 1 — Participantes agendados da reunião (quando é uma reunião de grupo do KTM).
  const daReuniao = new Map<string, { id: string; nome: string }>()
  if (reuniaoId) {
    const { data } = await supabase
      .from('reuniao_professores')
      .select('professor_id, professor:professores!professor_id (nome)')
      .eq('reuniao_id', reuniaoId)
    for (const rp of data ?? []) {
      const prof = Array.isArray(rp.professor) ? rp.professor[0] : rp.professor
      const nome = (prof as { nome?: string } | null)?.nome
      if (rp.professor_id && nome) daReuniao.set(rp.professor_id, { id: rp.professor_id, nome })
    }
  }

  // 2 — Quem está na chamada: e-mail identifica sem ambiguidade, nome é o resto.
  const porEmail = new Map<string, { id: string; nome: string }>()
  if (emails.length) {
    const alvo = new Set(emails.map(e => e.toLowerCase().trim()))
    for (const p of ativos) {
      if (p.email && alvo.has(p.email.toLowerCase().trim())) porEmail.set(p.id, { id: p.id, nome: p.nome })
    }
  }
  // Nomes já resolvidos por e-mail saem da rodada do match por nome.
  const jaResolvidos = new Set([...daReuniao.keys(), ...porEmail.keys()])
  const { encontrados, naoIdentificados } = matchTodosPorNome(
    nomes,
    ativos.filter(p => !jaResolvidos.has(p.id)),
  )

  const confiancaPor = new Map<string, number>()
  for (const e of encontrados) confiancaPor.set(e.id, e.confianca)

  const participantes = new Map<string, { id: string; nome: string; origem: 'reuniao' | 'chamada' }>()
  for (const p of daReuniao.values()) participantes.set(p.id, { ...p, origem: 'reuniao' })
  for (const p of porEmail.values())  if (!participantes.has(p.id)) participantes.set(p.id, { ...p, origem: 'chamada' })
  for (const p of encontrados)        if (!participantes.has(p.id)) participantes.set(p.id, { id: p.id, nome: p.nome, origem: 'chamada' })

  const ids = [...participantes.keys()]
  if (!ids.length) {
    return { ok: true, ranking: { itens: [], naoIdentificados, janelaDias: JANELA_RANKING } }
  }

  const corteIso = new Date(Date.now() - JANELA_RANKING * 86_400_000).toISOString()
  const [acompRes, incidentesRes, obsRes] = await Promise.all([
    supabase.from('professor_acompanhamento').select('professor_id, score_atual').in('professor_id', ids),
    supabase
      .from('nexus_incidents')
      .select('professor_id, problem_type, resolved')
      .in('professor_id', ids)
      .gte('created_at', corteIso),
    supabase
      .from('observacoes')
      .select('professor_id, tipo')
      .in('professor_id', ids)
      .in('tipo', ['feedback_positivo', 'feedback_negativo'])
      .gte('created_at', corteIso),
  ])

  const scorePor = new Map<string, number | null>()
  for (const a of acompRes.data ?? []) scorePor.set(a.professor_id, a.score_atual ?? null)

  const incPor = new Map<string, { total: number; abertos: number }>()
  for (const i of incidentesRes.data ?? []) {
    // Chamado de TI e Mês de Análise não são falha do professor — ficam fora.
    if (CATEGORIAS_PLATAFORMA.has(i.problem_type) || i.problem_type === PROBLEM_TYPE_MES_ANALISE) continue
    const alvo = incPor.get(i.professor_id) ?? { total: 0, abertos: 0 }
    alvo.total++
    if (!i.resolved) alvo.abertos++
    incPor.set(i.professor_id, alvo)
  }

  const fbPor = new Map<string, { pos: number; neg: number }>()
  for (const o of obsRes.data ?? []) {
    const alvo = fbPor.get(o.professor_id) ?? { pos: 0, neg: 0 }
    if (o.tipo === 'feedback_positivo') alvo.pos++
    else alvo.neg++
    fbPor.set(o.professor_id, alvo)
  }

  const ranking = ranquear([...participantes.values()].map(p => ({
    professorId: p.id,
    nome: p.nome,
    score: scorePor.get(p.id) ?? null,
    incidentes: incPor.get(p.id)?.total ?? 0,
    incidentesAbertos: incPor.get(p.id)?.abertos ?? 0,
    feedbacksPositivos: fbPor.get(p.id)?.pos ?? 0,
    feedbacksNegativos: fbPor.get(p.id)?.neg ?? 0,
  })))

  return {
    ok: true,
    ranking: {
      janelaDias: JANELA_RANKING,
      naoIdentificados,
      itens: ranking.map(r => ({
        professorId: r.professorId,
        nome: r.nome,
        posicao: r.posicao,
        pontos: Math.round(r.pontos),
        nivel: r.nivel,
        eixos: r.eixos.map(e => ({ chave: e.chave, titulo: e.titulo, pontos: Math.round(e.pontos * 10) / 10 })),
        semScore: r.semScore,
        score: r.entrada.score,
        incidentes: r.entrada.incidentes,
        feedbacksPositivos: r.entrada.feedbacksPositivos,
        feedbacksNegativos: r.entrada.feedbacksNegativos,
        origem: participantes.get(r.professorId)!.origem,
        confianca: confiancaPor.get(r.professorId) ?? null,
      })),
    },
  }
}

async function handleBuscarPorTexto(texto: string): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }
  if (!texto.trim()) return { ok: true, resultado: null }

  // Busca SÓ entre professores ativos e ranqueia por similaridade (com score).
  const { data: ativos } = await supabase
    .from('professores')
    .select('id, nome')
    .eq('status', 'ativo')

  const ranqueados = sugerirProfessores(texto, ativos ?? [])
  if (ranqueados.length === 0) return { ok: true, resultado: null, sugestoes: [] }

  // Um só candidato → abre direto (com a confiança do match).
  if (ranqueados.length === 1) {
    const resultado = await montarResultado(ranqueados[0].id, 'nome', ranqueados[0].score)
    return { ok: true, resultado }
  }

  // Vários → devolve a lista com a porcentagem de cada um pra escolher.
  return {
    ok: true,
    resultado: null,
    sugestoes: ranqueados.map(s => ({ id: s.id, nome: s.nome, score: s.score })),
  }
}

/** Carrega o perfil completo de um professor escolhido (ex.: da lista de sugestões). */
async function handleCarregarProfessor(professorId: string): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }
  const resultado = await montarResultado(professorId, 'nome')
  return resultado ? { ok: true, resultado } : { ok: false, erro: 'Professor não encontrado.' }
}

/** Lança uma observação/feedback do professor — mesma tabela (observacoes) e trigger
 *  de snapshot usados por useSalvarObservacao na plataforma web.
 *  Sem gatilho no painel hoje: as "Ações rápidas" saíram e só o registro de incidente
 *  ficou (com área própria). O canal continua aqui porque a observação da REUNIÃO
 *  segue sendo gravada e para não fechar a porta se ele voltar. */
async function handleCriarObservacao(professorId: string, tipoObs: string, texto: string): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }
  if (!texto.trim()) return { ok: false, erro: 'Escreva a observação.' }

  const { error } = await supabase.from('observacoes').insert({
    professor_id: professorId,
    coordenador_id: session.user.id,
    tipo: tipoObs,
    texto: texto.trim(),
  })
  if (error) return { ok: false, erro: error.message }

  const resultado = await montarResultado(professorId, 'nome')
  return resultado ? { ok: true, resultado } : { ok: false, erro: 'Erro após salvar.' }
}

/** Abre um incidente vinculado ao professor — mesma tabela/campos de useCriarIncidente na web.
 *  natureza, aluno_nome e prazo_resolucao passaram a vir do painel (antes eram fixos:
 *  sempre 'desafio', sem aluno e sem prazo, nascendo mais pobre que o incidente da web). */
async function handleAbrirIncidente(
  professorId: string, problemType: string, urgency: string, description: string,
  natureza: 'informe' | 'desafio' = 'desafio',
  alunoNome: string | null = null,
  prazoResolucao: string | null = null,
): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }
  if (!description.trim()) return { ok: false, erro: 'Descreva o incidente.' }

  const [{ data: prof }, { data: perfil }] = await Promise.all([
    supabase.from('professores').select('nome').eq('id', professorId).maybeSingle(),
    supabase.from('profiles').select('nome').eq('id', session.user.id).maybeSingle(),
  ])
  if (!prof) return { ok: false, erro: 'Professor não encontrado.' }

  const nowIso = new Date().toISOString()
  const { error } = await supabase.from('nexus_incidents').insert({
    id: crypto.randomUUID(),
    teacher_name: prof.nome,
    aluno_nome: alunoNome?.trim() || null,
    coordinator: perfil?.nome ?? 'KTM',
    problem_type: problemType,
    urgency,
    description: description.trim(),
    solution: '',
    needs_follow_up: false,
    resolved: false,
    resolved_at: null,
    // Informe é registro, não chamado: não carrega prazo (igual à web).
    prazo_resolucao: natureza === 'informe' ? null : prazoResolucao,
    under_analysis: false,
    incident_mode: 'professor',
    image_urls: [],
    natureza,
    ti_status: null,
    created_at: nowIso,
    professor_id: professorId,
    created_by: session.user.id,
    synced_at: nowIso,
  })
  if (error) return { ok: false, erro: error.message }

  const resultado = await montarResultado(professorId, 'nome')
  return resultado ? { ok: true, resultado } : { ok: false, erro: 'Erro após abrir incidente.' }
}

/** Cria uma reunião avulsa "agora" para o professor (mesmo formato de useCriarReuniaoManual na
 * plataforma web), para quando não houver nenhuma reunião de hoje já importada do Calendar. */
async function handleCriarReuniaoAgora(professorId: string): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }

  const { data: reuniao, error: e1 } = await supabase
    .from('reunioes')
    .insert({ coordenador_id: session.user.id, data: new Date().toISOString(), titulo: 'Reunião via King TeacherTrack', status: 'pendente' })
    .select('id')
    .single()
  if (e1 || !reuniao) return { ok: false, erro: e1?.message ?? 'Erro ao criar reunião.' }

  const { data: participante, error: e2 } = await supabase
    .from('reuniao_professores')
    .insert({ reuniao_id: reuniao.id, professor_id: professorId, status: 'pendente' })
    .select('id, status, numero, observacao')
    .single()
  if (e2 || !participante) return { ok: false, erro: e2?.message ?? 'Erro ao vincular professor à reunião.' }

  return {
    ok: true,
    reuniaoHoje: {
      participanteId: participante.id, reuniao_id: reuniao.id, status: participante.status,
      numero: participante.numero, observacao: participante.observacao, anotacaoInterna: '',
    },
  }
}

/** Confirma realizada/cancelada + observação — mesma lógica e mesmas tabelas de
 * useConfirmarParticipacao na plataforma web (numeração do monitoramento, data_ultima_reuniao).
 *
 * Reunião marcada como `natureza='duvida'` (20260770) não numera nem move a data
 * da última reunião: é encontro extra, não o acompanhamento do mês. A extensão
 * não CRIA reunião de dúvida — só respeita a marcação feita no KTM, para as duas
 * superfícies não divergirem na numeração. */
async function handleConfirmarReuniao(
  participanteId: string, professorId: string, aconteceu: boolean, observacao: string,
): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }

  type LinhaNatureza = { reuniao: { natureza: string | null } | { natureza: string | null }[] | null }
  const naturezaDe = (linha: LinhaNatureza | null | undefined): string => {
    const r = Array.isArray(linha?.reuniao) ? linha?.reuniao[0] : linha?.reuniao
    return r?.natureza ?? 'acompanhamento'
  }

  const { data: estaLinha } = await supabase
    .from('reuniao_professores')
    .select('id, reuniao:reunioes!inner(natureza)')
    .eq('id', participanteId)
    .maybeSingle()
  const ehDuvida = naturezaDe(estaLinha as LinhaNatureza | null) === 'duvida'

  let numero: number | null = null
  if (aconteceu && !ehDuvida) {
    const { data: anteriores } = await supabase
      .from('reuniao_professores')
      .select('id, reuniao:reunioes!inner(natureza)')
      .eq('professor_id', professorId)
      .eq('status', 'realizada')
    const oficiais = ((anteriores ?? []) as unknown as LinhaNatureza[])
      .filter(l => naturezaDe(l) !== 'duvida')
    numero = oficiais.length + 1
  }

  const { data: atualizado, error } = await supabase
    .from('reuniao_professores')
    .update({
      status:         aconteceu ? 'realizada' : 'cancelada',
      observacao:     observacao.trim() || null,
      numero,
      confirmado_em:  new Date().toISOString(),
      confirmado_por: session.user.id,
    })
    .eq('id', participanteId)
    .select('id, status, numero, observacao')
    .single()
  if (error || !atualizado) return { ok: false, erro: error?.message ?? 'Erro ao confirmar reunião.' }

  if (aconteceu && !ehDuvida) {
    await supabase.from('professores').update({ data_ultima_reuniao: new Date().toISOString() }).eq('id', professorId)
  }

  // Re-lê a participação inteira: devolver só os campos do update apagaria
  // reuniao_id, participantes do grupo e a anotação interna do painel.
  const completa = await buscarReuniaoHoje(professorId)
  return {
    ok: true,
    reuniaoHoje: completa ?? {
      participanteId: atualizado.id, status: atualizado.status,
      numero: atualizado.numero, observacao: atualizado.observacao, anotacaoInterna: '',
    },
  }
}

/** Edita só o texto da observação, sem mudar status (ex: professor já confirmado antes). */
async function handleSalvarObservacaoReuniao(participanteId: string, observacao: string): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }

  const { data, error } = await supabase
    .from('reuniao_professores')
    .update({ observacao: observacao.trim() || null })
    .eq('id', participanteId)
    .select('id, professor_id, status, numero, observacao')
    .single()
  if (error || !data) return { ok: false, erro: error?.message ?? 'Erro ao salvar observação.' }

  const completa = await buscarReuniaoHoje(data.professor_id)
  return {
    ok: true,
    reuniaoHoje: completa ?? {
      participanteId: data.id, status: data.status, numero: data.numero,
      observacao: data.observacao, anotacaoInterna: '',
    },
  }
}

/** Salva minha anotação PRIVADA da reunião (reuniao_anotacoes_internas) — mesmo
 *  upsert de useSalvarAnotacao na web; texto vazio apaga a linha. */
async function handleSalvarAnotacaoInterna(
  reuniaoId: string, participanteId: string, texto: string,
): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }

  const limpo = texto.trim()
  const { error } = limpo
    ? await supabase.from('reuniao_anotacoes_internas').upsert(
        { reuniao_id: reuniaoId, autor_id: session.user.id, texto: limpo, updated_at: new Date().toISOString() },
        { onConflict: 'reuniao_id,autor_id' },
      )
    : await supabase.from('reuniao_anotacoes_internas')
        .delete()
        .eq('reuniao_id', reuniaoId)
        .eq('autor_id', session.user.id)
  if (error) return { ok: false, erro: error.message }

  const { data } = await supabase
    .from('reuniao_professores')
    .select('professor_id')
    .eq('id', participanteId)
    .maybeSingle()
  const completa = data?.professor_id ? await buscarReuniaoHoje(data.professor_id) : null
  return completa
    ? { ok: true, reuniaoHoje: completa }
    : { ok: false, erro: 'Anotação salva, mas não consegui recarregar a reunião.' }
}

/** Coloca o professor em Mês de Análise via a Edge Function nexus-mes-analise
 *  (mesma usada pela plataforma web) — já valida role admin/coordenacao no servidor. */
async function handleColocarMesAnalise(
  professorId: string, descricao: string, urgencia?: string,
): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }
  if (!descricao.trim()) return { ok: false, erro: 'Descreva o motivo do Mês de Análise.' }

  const r = await invocarMesAnalise({ action: 'colocar', professor_id: professorId, descricao: descricao.trim(), urgencia })
  if (!r.ok) return { ok: false, erro: r.erro }

  const resultado = await montarResultado(professorId, 'nome')
  return resultado ? { ok: true, resultado } : { ok: false, erro: 'Professor não encontrado após atualizar.' }
}

/** Resolve o Mês de Análise em aberto. */
async function handleResolverMesAnalise(
  professorId: string, incidentId: string, resultadoTexto: string,
): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }
  if (!resultadoTexto.trim()) return { ok: false, erro: 'Escreva o resultado do Mês de Análise.' }

  const r = await invocarMesAnalise({ action: 'resolver', incident_id: incidentId, resultado: resultadoTexto.trim() })
  if (!r.ok) return { ok: false, erro: r.erro }

  const resultado = await montarResultado(professorId, 'nome')
  return resultado ? { ok: true, resultado } : { ok: false, erro: 'Professor não encontrado após atualizar.' }
}

/** Marca/reabre uma ocorrência do KTM — mesma lógica de useResolverObservacao na web. */
async function handleResolverObservacao(
  professorId: string, id: string, resolvido: boolean,
): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }

  const { error } = await supabase
    .from('observacoes')
    .update({ resolvido, resolvido_em: resolvido ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return { ok: false, erro: error.message }

  const resultado = await montarResultado(professorId, 'nome')
  return resultado ? { ok: true, resultado } : { ok: false, erro: 'Professor não encontrado após atualizar.' }
}

/** Confirma presença de múltiplos professores em reunião de grupo.
 *  Usa a RPC confirmar_reuniao_grupo — a MESMA da plataforma web — para que a
 *  numeração do monitoramento (`numero`) e o "não compareceu" fiquem consistentes
 *  entre as duas superfícies (presentes → realizada+numero, pendentes → cancelada). */
async function handleConfirmarGrupo(
  reuniaoId: string, presentesIds: string[], observacao: string, professorId: string,
): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }

  const { error } = await supabase.rpc('confirmar_reuniao_grupo', {
    p_reuniao_id: reuniaoId,
    p_presentes: presentesIds,
    p_observacao: observacao.trim() || null,
    p_confirmado_por: session.user.id,
  })
  if (error) return { ok: false, erro: error.message }

  const resultado = await montarResultado(professorId, 'nome')
  return resultado ? { ok: true, resultado } : { ok: false, erro: 'Erro ao confirmar grupo.' }
}

chrome.runtime.onMessage.addListener((msg: MensagemParaBackground, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.tipo) {
        case 'LOGIN':
          sendResponse(await handleLogin(msg.email, msg.senha)); break
        case 'LOGOUT':
          sendResponse(await handleLogout()); break
        case 'OBTER_SESSAO':
          sendResponse(await handleObterSessao()); break
        case 'BUSCAR_PROFESSOR':
          sendResponse(await handleBuscarProfessor(msg.nomes, msg.emails)); break
        case 'BUSCAR_PROFESSOR_POR_TEXTO':
          sendResponse(await handleBuscarPorTexto(msg.texto)); break
        case 'RANKEAR_GRUPO':
          sendResponse(await handleRankearGrupo(msg.nomes, msg.emails, msg.reuniaoId)); break
        case 'CARREGAR_PROFESSOR':
          sendResponse(await handleCarregarProfessor(msg.professorId)); break
        case 'CRIAR_OBSERVACAO':
          sendResponse(await handleCriarObservacao(msg.professorId, msg.tipoObs, msg.texto)); break
        case 'ABRIR_INCIDENTE':
          sendResponse(await handleAbrirIncidente(
            msg.professorId, msg.problemType, msg.urgency, msg.description,
            msg.natureza, msg.alunoNome, msg.prazoResolucao,
          )); break
        case 'CRIAR_REUNIAO_AGORA':
          sendResponse(await handleCriarReuniaoAgora(msg.professorId)); break
        case 'CONFIRMAR_REUNIAO':
          sendResponse(await handleConfirmarReuniao(msg.participanteId, msg.professorId, msg.aconteceu, msg.observacao)); break
        case 'SALVAR_OBSERVACAO_REUNIAO':
          sendResponse(await handleSalvarObservacaoReuniao(msg.participanteId, msg.observacao)); break
        case 'SALVAR_ANOTACAO_INTERNA':
          sendResponse(await handleSalvarAnotacaoInterna(msg.reuniaoId, msg.participanteId, msg.texto)); break
        case 'COLOCAR_MES_ANALISE':
          sendResponse(await handleColocarMesAnalise(msg.professorId, msg.descricao, msg.urgencia)); break
        case 'RESOLVER_MES_ANALISE':
          sendResponse(await handleResolverMesAnalise(msg.professorId, msg.incidentId, msg.resultado)); break
        case 'RESOLVER_OBSERVACAO':
          sendResponse(await handleResolverObservacao(msg.professorId, msg.id, msg.resolvido)); break
        case 'CONFIRMAR_GRUPO':
          sendResponse(await handleConfirmarGrupo(msg.reuniaoId, msg.presentesIds, msg.observacao, msg.professorId)); break
        case 'LIBERAR_AGENDA':
          sendResponse(await handleLiberarAgenda(msg.professorId, msg.idProfessor)); break
      }
    } catch (err) {
      sendResponse({ ok: false, erro: err instanceof Error ? err.message : String(err) })
    }
  })()
  return true // mantém o canal aberto para a resposta assíncrona
})
