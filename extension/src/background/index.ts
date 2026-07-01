import { supabase } from '../shared/supabase'
import { matchProfessorPorNome, matchProfessorPorEmail } from '../shared/match'
import type {
  MensagemParaBackground, RespostaDoBackground, ProfessorEncontrado, ReuniaoHistoricoItem, ReuniaoHojeInfo,
} from '../shared/types'

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
    .select('id, status, numero, observacao, reuniao:reunioes!reuniao_id!inner (data)')
    .eq('professor_id', professorId)
    .gte('reuniao.data', inicio)
    .lte('reuniao.data', fim)
    .order('created_at', { ascending: false })
    .limit(1)

  const row = data?.[0]
  if (!row) return null
  return { participanteId: row.id, status: row.status, numero: row.numero, observacao: row.observacao }
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
): Promise<ProfessorEncontrado | null> {
  const [profRes, acompRes, historicoRes, totalRes, obsRes, reuniaoHoje] = await Promise.all([
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
      .select('id, tipo, texto, created_at')
      .eq('professor_id', professorId)
      .order('created_at', { ascending: false })
      .limit(5),
    buscarReuniaoHoje(professorId),
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
    motivo,
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

  // 2 — Fallback: match por nome entre os professores ativos
  if (nomes.length) {
    const { data: professores } = await supabase
      .from('professores')
      .select('id, nome')
      .eq('saiu', false)
      .eq('pausa', false)
    const match = matchProfessorPorNome(nomes, professores ?? [])
    if (match) {
      const resultado = await montarResultado(match.id, 'nome')
      if (resultado) return { ok: true, resultado }
    }
  }

  return { ok: true, resultado: null }
}

async function handleBuscarPorTexto(texto: string): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }
  if (!texto.trim()) return { ok: true, resultado: null }

  const { data: professores } = await supabase
    .from('professores')
    .select('id, nome')
    .ilike('nome', `%${texto.trim()}%`)
    .limit(1)

  const alvo = professores?.[0]
  if (!alvo) return { ok: true, resultado: null }

  const resultado = await montarResultado(alvo.id, 'nome')
  return { ok: true, resultado }
}

/** Cria uma reunião avulsa "agora" para o professor (mesmo formato de useCriarReuniaoManual na
 * plataforma web), para quando não houver nenhuma reunião de hoje já importada do Calendar. */
async function handleCriarReuniaoAgora(professorId: string): Promise<RespostaDoBackground> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, erro: 'Não autenticado.' }

  const { data: reuniao, error: e1 } = await supabase
    .from('reunioes')
    .insert({ coordenador_id: session.user.id, data: new Date().toISOString(), titulo: 'Reunião via King Nexus', status: 'pendente' })
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
      participanteId: atualizado.id, status: atualizado.status,
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
        case 'CRIAR_REUNIAO_AGORA':
          sendResponse(await handleCriarReuniaoAgora(msg.professorId)); break
        case 'CONFIRMAR_REUNIAO':
          sendResponse(await handleConfirmarReuniao(msg.participanteId, msg.professorId, msg.aconteceu, msg.observacao)); break
        case 'SALVAR_OBSERVACAO_REUNIAO':
          sendResponse(await handleSalvarObservacaoReuniao(msg.participanteId, msg.observacao)); break
      }
    } catch (err) {
      sendResponse({ ok: false, erro: err instanceof Error ? err.message : String(err) })
    }
  })()
  return true // mantém o canal aberto para a resposta assíncrona
})
