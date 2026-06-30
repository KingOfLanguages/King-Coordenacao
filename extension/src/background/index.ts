import { supabase } from '../shared/supabase'
import { matchProfessorPorNome, matchProfessorPorEmail } from '../shared/match'
import type {
  MensagemParaBackground, RespostaDoBackground, ProfessorEncontrado,
} from '../shared/types'

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

/** Busca observações + monta o resultado final a partir de um id de professor já resolvido. */
async function montarResultado(
  professorId: string,
  motivo: 'email' | 'nome',
): Promise<ProfessorEncontrado | null> {
  const { data: prof, error: profErr } = await supabase
    .from('professores')
    .select('id, nome, status, data_inicio, grupo:grupos!grupo_id (id, nome)')
    .eq('id', professorId)
    .maybeSingle()
  if (profErr || !prof) return null

  const { data: obs } = await supabase
    .from('observacoes')
    .select('id, tipo, texto, created_at')
    .eq('professor_id', professorId)
    .order('created_at', { ascending: false })
    .limit(5)

  return {
    professor: {
      id: prof.id,
      nome: prof.nome,
      status: prof.status,
      data_inicio: prof.data_inicio,
      grupo: Array.isArray(prof.grupo) ? prof.grupo[0] ?? null : prof.grupo,
    },
    observacoes: obs ?? [],
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
      }
    } catch (err) {
      sendResponse({ ok: false, erro: err instanceof Error ? err.message : String(err) })
    }
  })()
  return true // mantém o canal aberto para a resposta assíncrona
})
