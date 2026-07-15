import { supabase } from '../shared/supabase'
import { matchProfessorPorNome, matchProfessorPorEmail, sugerirProfessores, confiancaMatch } from '../shared/match'
import type {
  MensagemParaBackground, RespostaDoBackground, ProfessorEncontrado, ReuniaoHistoricoItem, ReuniaoHojeInfo,
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
  }
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

/** Monta a lista de alertas ativos a partir do snapshot de acompanhamento (mesma regra da tela web). */
function montarAlertas(acomp: {
  aulas_pendentes_qtd: number
  faltas_professor: { quantidade?: number } | null
  no_show_primeira_aula: { quantidade?: number } | null
  agendas_bloqueadas: { quantidade_horarios?: number } | null
  trocas_professor: unknown[] | null
}): { label: string }[] {
  return [
    acomp.aulas_pendentes_qtd > 0 && { label: `${acomp.aulas_pendentes_qtd} aula(s) pendente(s)` },
    (acomp.faltas_professor?.quantidade ?? 0) > 0 && { label: `${acomp.faltas_professor!.quantidade} falta(s) do professor` },
    (acomp.no_show_primeira_aula?.quantidade ?? 0) > 0 && { label: `${acomp.no_show_primeira_aula!.quantidade} no-show de 1ª aula` },
    (acomp.agendas_bloqueadas?.quantidade_horarios ?? 0) > 0 && { label: `${acomp.agendas_bloqueadas!.quantidade_horarios} horário(s) bloqueado(s)` },
    (acomp.trocas_professor?.length ?? 0) > 0 && { label: `${acomp.trocas_professor!.length} troca(s) de professor` },
  ].filter(Boolean) as { label: string }[]
}

/** Busca todas as infos relevantes do professor (perfil, acompanhamento, reuniões, observações). */
async function montarResultado(
  professorId: string,
  motivo: 'email' | 'nome',
  confianca: number | null = null,
): Promise<ProfessorEncontrado | null> {
  const [
    profRes, acompRes, historicoRes, totalRes, obsRes, obsAbertasRes, reuniaoHoje,
    nexusIncidentesRes, nexusAbertasRes, nexusTrackingRes, nexusAlertasRes, mesAnaliseRes,
  ] = await Promise.all([
    supabase
      .from('professores')
      .select('id, nome, email, status, data_inicio, data_ultima_reuniao, monitoramento, grupo:grupos!grupo_id (id, nome), coordenador:profiles!coordenador_id (nome)')
      .eq('id', professorId)
      .maybeSingle(),
    supabase
      .from('professor_acompanhamento')
      .select('score_atual, score_faixa, elegivel_alocacao, reuniao_status, reuniao_proxima, avaliacao_alunos, aulas_pendentes_qtd, faltas_professor, no_show_primeira_aula, agendas_bloqueadas, trocas_professor')
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
    buscarReuniaoHoje(professorId),
    supabase
      .from('nexus_incidents')
      .select('id, problem_type, urgency, description, resolved, created_at')
      .eq('professor_id', professorId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('nexus_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('professor_id', professorId)
      .eq('resolved', false),
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
    supabase
      .from('nexus_incidents')
      .select('id, description, urgency, created_at')
      .eq('professor_id', professorId)
      .eq('problem_type', PROBLEM_TYPE_MES_ANALISE)
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(1),
  ])
  if (profRes.error || !profRes.data) return null
  const prof = profRes.data
  const acomp = acompRes.data

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
      status: prof.status,
      data_inicio: prof.data_inicio,
      data_ultima_reuniao: prof.data_ultima_reuniao,
      monitoramento: prof.monitoramento,
      grupo: Array.isArray(prof.grupo) ? prof.grupo[0] ?? null : prof.grupo,
      coordenador_nome: (Array.isArray(prof.coordenador) ? prof.coordenador[0] : prof.coordenador)?.nome ?? null,
    },
    acompanhamento: acomp
      ? {
          score_atual: acomp.score_atual,
          score_faixa: acomp.score_faixa,
          elegivel_alocacao: acomp.elegivel_alocacao,
          reuniao_status: acomp.reuniao_status,
          reuniao_proxima: acomp.reuniao_proxima,
          avaliacao_alunos: acomp.avaliacao_alunos,
          alertas: montarAlertas(acomp),
        }
      : null,
    historicoReunioes,
    totalReunioesRealizadas: totalRes.count ?? 0,
    reuniaoHoje,
    observacoes: obsRes.data ?? [],
    observacoesAbertasTotal: obsAbertasRes.count ?? 0,
    nexus: {
      ocorrencias: nexusIncidentesRes.data ?? [],
      ocorrenciasAbertasTotal: nexusAbertasRes.count ?? 0,
      tracking: nexusTrackingRes.data?.[0] ?? null,
      alertas: nexusAlertasRes.data ?? [],
    },
    mesAnalise: mesAnaliseRes.data?.[0] ?? null,
    motivo,
    confianca,
  }
}

async function handleBuscarProfessor(nomes: string[], emails: string[]): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }

  // 1 — Match por e-mail (mais confiável)
  if (emails.length) {
    const { data: emailRows } = await supabase
      .from('professor_emails')
      .select('professor_id, email')
    const profId = matchProfessorPorEmail(emails, emailRows ?? [])
    if (profId) {
      const resultado = await montarResultado(profId, 'email')
      if (resultado) return { ok: true, resultado }
    }
  }

  // 2 — Fallback: match por nome, SÓ entre professores ativos.
  if (nomes.length) {
    const { data: professores } = await supabase
      .from('professores')
      .select('id, nome')
      .eq('status', 'ativo')
    const match = matchProfessorPorNome(nomes, professores ?? [])
    if (match) {
      const resultado = await montarResultado(match.id, 'nome', confiancaMatch(nomes, match.nome))
      if (resultado) return { ok: true, resultado }
    }
  }

  return { ok: true, resultado: null }
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

/** Lança rápido uma observação/feedback do professor — mesma tabela (observacoes)
 *  e trigger de snapshot usados por useSalvarObservacao na plataforma web. */
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

/** Abre um incidente vinculado ao professor — mesma tabela/campos de useCriarIncidente na web. */
async function handleAbrirIncidente(
  professorId: string, problemType: string, urgency: string, description: string,
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
    aluno_nome: null,
    coordinator: perfil?.nome ?? 'KTM',
    problem_type: problemType,
    urgency,
    description: description.trim(),
    solution: '',
    needs_follow_up: false,
    resolved: false,
    resolved_at: null,
    under_analysis: false,
    incident_mode: 'professor',
    image_urls: [],
    natureza: 'desafio',
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
      participanteId: participante.id, status: participante.status,
      numero: participante.numero, observacao: participante.observacao,
    },
  }
}

/** Confirma realizada/cancelada + observação — mesma lógica e mesmas tabelas de
 * useConfirmarParticipacao na plataforma web (numeração do monitoramento, data_ultima_reuniao). */
async function handleConfirmarReuniao(
  participanteId: string, professorId: string, aconteceu: boolean, observacao: string,
): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }

  let numero: number | null = null
  if (aconteceu) {
    const { count } = await supabase
      .from('reuniao_professores')
      .select('id', { count: 'exact', head: true })
      .eq('professor_id', professorId)
      .eq('status', 'realizada')
    numero = (count ?? 0) + 1
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

  if (aconteceu) {
    await supabase.from('professores').update({ data_ultima_reuniao: new Date().toISOString() }).eq('id', professorId)
  }

  return {
    ok: true,
    reuniaoHoje: {
      participanteId: atualizado.id, reuniao_id: '', status: atualizado.status,
      numero: atualizado.numero, observacao: atualizado.observacao,
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
    .select('id, status, numero, observacao')
    .single()
  if (error || !data) return { ok: false, erro: error?.message ?? 'Erro ao salvar observação.' }

  return {
    ok: true,
    reuniaoHoje: { participanteId: data.id, status: data.status, numero: data.numero, observacao: data.observacao },
  }
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
        case 'CARREGAR_PROFESSOR':
          sendResponse(await handleCarregarProfessor(msg.professorId)); break
        case 'CRIAR_OBSERVACAO':
          sendResponse(await handleCriarObservacao(msg.professorId, msg.tipoObs, msg.texto)); break
        case 'ABRIR_INCIDENTE':
          sendResponse(await handleAbrirIncidente(msg.professorId, msg.problemType, msg.urgency, msg.description)); break
        case 'CRIAR_REUNIAO_AGORA':
          sendResponse(await handleCriarReuniaoAgora(msg.professorId)); break
        case 'CONFIRMAR_REUNIAO':
          sendResponse(await handleConfirmarReuniao(msg.participanteId, msg.professorId, msg.aconteceu, msg.observacao)); break
        case 'SALVAR_OBSERVACAO_REUNIAO':
          sendResponse(await handleSalvarObservacaoReuniao(msg.participanteId, msg.observacao)); break
        case 'COLOCAR_MES_ANALISE':
          sendResponse(await handleColocarMesAnalise(msg.professorId, msg.descricao, msg.urgencia)); break
        case 'RESOLVER_MES_ANALISE':
          sendResponse(await handleResolverMesAnalise(msg.professorId, msg.incidentId, msg.resultado)); break
        case 'RESOLVER_OBSERVACAO':
          sendResponse(await handleResolverObservacao(msg.professorId, msg.id, msg.resolvido)); break
        case 'CONFIRMAR_GRUPO':
          sendResponse(await handleConfirmarGrupo(msg.reuniaoId, msg.presentesIds, msg.observacao, msg.professorId)); break
      }
    } catch (err) {
      sendResponse({ ok: false, erro: err instanceof Error ? err.message : String(err) })
    }
  })()
  return true // mantém o canal aberto para a resposta assíncrona
})
