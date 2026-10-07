// ─────────────────────────────────────────────────────────────────────────────
// Portal público do WELCOME PATH — o professor percorre a trilha de onboarding
// sem login, pelo link enviado pela coordenação (/welcome-path).
//
// Desde o pentest de 05/10/2026 a identificação mora em `portal-identidade`
// (código de 6 dígitos no e-mail oficial do professor). Aqui só entra quem tem
// a sessão que ela emite — a antiga ação `lookup`, que dava token a quem
// soubesse o nome de alguém, foi removida.
//
// Duas coisas que o app original (Lovable) fazia no navegador e aqui ficam no
// servidor, porque lá eram contornáveis com o DevTools aberto:
//   • o GABARITO nunca é enviado ao professor — a correção acontece aqui;
//   • o BLOQUEIO de etapa é verificado aqui, não só escondendo o botão.
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/portal-welcome-path   { "acao": "…", … }
//
//   sessao      { token }                    → { professor }
//   trilha      { token }                    → { professor, etapas[], jornada, primeiraReuniao }
//   etapa       { token, etapaId }           → { etapa, blocos[], questoes[], progresso }
//   iniciar     { token, etapaId }           → { ok: true }
//   tempo       { token, etapaId, segundos } → { ok: true }
//   responder   { token, etapaId, respostas[] }
//                 → { nota, aprovado, notaMinima, revisaoPendente, resultado[] }
//   observacao  { token, etapaId, texto }    → { ok: true }
//
// Escreve com a service_role: `welcome_path_progresso` e `_respostas` não têm
// policy de INSERT/UPDATE (mesmo desenho de `pausas`).
//
// ── Prazo (2026-10-07) ───────────────────────────────────────────────────────
// A trilha tem 120h desde o 1º acesso (`wp_abrir_jornada`, migration 20260794).
// Esgotou sem concluir → toda etapa não concluída vira 'bloqueada' com motivo
// 'prazo', e o mesmo gate que já barrava etapa fora de ordem barra o resto. As
// concluídas continuam abertas para revisão. Exceção: se tudo o que falta já
// foi enviado e só espera revisão da coordenação, não trava — a demora não é
// do professor.
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  jsonPara, preflight, resolverSessao, semSufixoInicio, textoLimpo,
  type ProfessorSessao, MSG_SESSAO,
} from '../_shared/portal.ts'

/** Teto do incremento de tempo por batida — uma aba esquecida aberta não pode
 *  virar "8 horas de estudo". O front bate a cada ~30s enquanto está visível. */
const TEMPO_MAX_POR_BATIDA = 120
/** Tentativas por etapa antes de mandar falar com a coordenação. Sem isso, o
 *  quiz vira força-bruta do gabarito. */
const TENTATIVAS_MAX = 20
const TEXTO_MAX = 5000
/** Quem estava no meio do quiz quando o relógio zerou ainda consegue enviar. */
const TOLERANCIA_ENVIO_MS = 15 * 60_000
const MSG_PRAZO =
  'Seu prazo para concluir a trilha terminou. Fale com o suporte ao professor pelo WhatsApp para pedir o desbloqueio.'

/** Dias inteiros decorridos desde uma data ISO (YYYY-MM-DD) até hoje, em UTC. */
function diasDesde(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const inicio = Date.UTC(a, m - 1, d)
  const agora  = new Date()
  const hoje   = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
  return Math.round((hoje - inicio) / 86400000)
}

/** Data ISO somada de N dias, em YYYY-MM-DD. */
function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

type ProfRow = ProfessorSessao

// deno-lint-ignore no-explicit-any
type Admin = any

// ─── Estado da trilha ─────────────────────────────────────────────────────────

type EtapaRow = {
  id: string; ordem: number; titulo: string; descricao: string
  ativa: boolean; obrigatoria: boolean; nota_minima: number
  prazo_dias: number | null; liberacao_dia: number | null; notas_coordenacao: string | null
  minutos_estimados: number | null
}
type ProgressoRow = {
  etapa_id: string; iniciada_em: string | null; concluida_em: string | null
  tempo_segundos: number; nota: number | null; tentativas: number
  observacao: string | null; liberada_manualmente: boolean; revisao_pendente: boolean
}

async function carregarTrilha(admin: Admin, prof: ProfRow) {
  const { data: etapasRaw } = await admin
    .from('welcome_path_etapas')
    .select('id, ordem, titulo, descricao, ativa, obrigatoria, nota_minima, prazo_dias, liberacao_dia, notas_coordenacao, minutos_estimados')
    .eq('ativa', true)
    .order('ordem', { ascending: true })

  const etapas = (etapasRaw ?? []) as EtapaRow[]

  const { data: progRaw } = await admin
    .from('welcome_path_progresso')
    .select('etapa_id, iniciada_em, concluida_em, tempo_segundos, nota, tentativas, observacao, liberada_manualmente, revisao_pendente')
    .eq('professor_id', prof.id)

  const porEtapa = new Map<string, ProgressoRow>(
    ((progRaw ?? []) as ProgressoRow[]).map(p => [p.etapa_id, p]),
  )

  const dias = prof.data_inicio ? diasDesde(prof.data_inicio) : null

  return etapas.map((e, i) => {
    const p = porEtapa.get(e.id) ?? null
    const anterior = i > 0 ? porEtapa.get(etapas[i - 1].id) : null

    const liberadaPorOrdem = i === 0 || !!anterior?.concluida_em || !!p?.liberada_manualmente
    // Sem data_inicio no cadastro não dá para calcular a janela — não trancamos
    // o professor por causa de um dado que falta no cadastro dele.
    const liberadaPorData =
      e.liberacao_dia == null || dias == null || dias + 1 >= e.liberacao_dia

    const estado: 'concluida' | 'liberada' | 'bloqueada' = p?.concluida_em
      ? 'concluida'
      : liberadaPorOrdem && liberadaPorData ? 'liberada' : 'bloqueada'
    const motivoBloqueio: 'anterior' | 'data' | 'prazo' | null =
      estado !== 'bloqueada' ? null : (liberadaPorOrdem ? 'data' : 'anterior')

    return {
      id: e.id,
      ordem: e.ordem,
      titulo: e.titulo,
      descricao: e.descricao,
      minutos: e.minutos_estimados,
      obrigatoria: e.obrigatoria,
      notaMinima: e.nota_minima,
      notasCoordenacao: e.notas_coordenacao,
      estado,
      motivoBloqueio,
      abreEm: e.liberacao_dia != null && prof.data_inicio && !liberadaPorData
        ? somarDias(prof.data_inicio, e.liberacao_dia - 1)
        : null,
      prazoEm: e.prazo_dias != null && prof.data_inicio
        ? somarDias(prof.data_inicio, e.prazo_dias - 1)
        : null,
      nota: p?.nota ?? null,
      tentativas: p?.tentativas ?? 0,
      iniciadaEm: p?.iniciada_em ?? null,
      concluidaEm: p?.concluida_em ?? null,
      tempoSegundos: p?.tempo_segundos ?? 0,
      revisaoPendente: p?.revisao_pendente ?? false,
    }
  })
}

type EtapaEstado = Awaited<ReturnType<typeof carregarTrilha>>[number]

type JornadaRow = {
  primeiro_acesso_em: string; prazo_em: string; concluida_em: string | null; desbloqueios: number
}

/** Abre (1ª vez) ou toca (demais) o relógio do professor. Idempotente. */
async function abrirJornada(admin: Admin, professorId: string): Promise<JornadaRow | null> {
  const { data, error } = await admin.rpc('wp_abrir_jornada', { p_professor_id: professorId })
  if (error) return null
  return data as JornadaRow
}

/** Aplica o prazo sobre a trilha calculada. `toleranciaMs` empurra o fim do
 *  prazo (só o envio de respostas usa). Sem jornada — RPC falhou — não trava:
 *  um erro nosso não pode trancar o professor. */
function aplicarPrazo(etapas: EtapaEstado[], jornada: JornadaRow | null, toleranciaMs = 0) {
  if (!jornada || jornada.concluida_em) return { etapas, bloqueada: false }

  const esgotou = new Date(jornada.prazo_em).getTime() + toleranciaMs < Date.now()
  const pendentes = etapas.filter(e => e.obrigatoria && e.estado !== 'concluida')
  const soFaltaRevisao = pendentes.length > 0 && pendentes.every(e => e.revisaoPendente)
  if (!esgotou || soFaltaRevisao) return { etapas, bloqueada: false }

  return {
    bloqueada: true,
    etapas: etapas.map(e => e.estado === 'concluida'
      ? e
      : { ...e, estado: 'bloqueada' as const, motivoBloqueio: 'prazo' as const }),
  }
}

/** Link de 1ª reunião (Koalendar) do coordenador do professor — o mesmo que o
 *  /agendar oferece na opção "1ª reunião". */
async function linkPrimeiraReuniao(admin: Admin, coordenadorId: string | null) {
  if (!coordenadorId) return { coordenador: null, link: null }
  const { data } = await admin
    .from('profiles')
    .select('nome, koalendar_link')
    .eq('id', coordenadorId)
    .maybeSingle()
  return { coordenador: (data?.nome as string | null) ?? null, link: (data?.koalendar_link as string | null) ?? null }
}

/** Garante a linha de progresso (professor × etapa) e devolve o estado atual. */
async function garantirProgresso(admin: Admin, professorId: string, etapaId: string) {
  const { data } = await admin
    .from('welcome_path_progresso')
    .select('*')
    .eq('professor_id', professorId)
    .eq('etapa_id', etapaId)
    .maybeSingle()

  if (data) return data

  const { data: criada } = await admin
    .from('welcome_path_progresso')
    .insert({ professor_id: professorId, etapa_id: etapaId })
    .select('*')
    .single()

  return criada
}

// ─── Correção ─────────────────────────────────────────────────────────────────

type QuestaoRow = {
  id: string; bloco_id: string | null; ordem: number; tipo: string
  enunciado: string; opcoes: string[]; corretas: number[]
  explicacao: string | null; peso: number; obrigatoria: boolean
}

function mesmoConjunto(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...new Set(a)].sort((x, y) => x - y)
  const sb = [...new Set(b)].sort((x, y) => x - y)
  return sa.every((v, i) => v === sb[i])
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  const json = jsonPara(req)
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const acao = typeof body.acao === 'string' ? body.acao : ''

  // A identificação saiu daqui (ver portal-identidade). Página antiga em cache
  // ainda pode chamar — responde com o que fazer em vez de um erro genérico.
  if (acao === 'lookup') {
    return json({ error: 'Atualize a página para entrar com o código enviado ao seu e-mail.' }, 410)
  }

  // ══ Daqui pra baixo, tudo exige sessão válida ══════════════════════════════
  const prof = await resolverSessao(admin, body.token)
  if (!prof) return json({ error: MSG_SESSAO }, 401)

  if (acao === 'sessao') {
    return json({ professor: { id: prof.id, nome: semSufixoInicio(prof.nome) } })
  }

  // A 1ª carga da trilha é o "1º acesso" que liga o relógio de 120h.
  const jornada = await abrirJornada(admin, prof.id)

  if (acao === 'trilha') {
    const { etapas, bloqueada } = aplicarPrazo(await carregarTrilha(admin, prof), jornada)
    return json({
      professor: { id: prof.id, nome: semSufixoInicio(prof.nome), dataInicio: prof.data_inicio },
      etapas,
      // `agora` deixa o contador do navegador acertar o relógio pelo servidor:
      // celular com hora errada não ganha nem perde prazo.
      jornada: jornada && {
        primeiroAcessoEm: jornada.primeiro_acesso_em,
        prazoEm:          jornada.prazo_em,
        concluidaEm:      jornada.concluida_em,
        desbloqueios:     jornada.desbloqueios,
        bloqueada,
        agora:            new Date().toISOString(),
      },
      primeiraReuniao: jornada?.concluida_em
        ? await linkPrimeiraReuniao(admin, prof.coordenador_id)
        : null,
    })
  }

  // ── Ações com etapa ────────────────────────────────────────────────────────
  const etapaId = typeof body.etapaId === 'string' ? body.etapaId.trim() : ''
  if (!etapaId) return json({ error: 'Etapa não informada.' }, 400)

  // Anotação não faz a trilha andar: fica liberada mesmo com o prazo esgotado.
  const tolerancia = acao === 'responder' ? TOLERANCIA_ENVIO_MS : 0
  const { etapas: trilha } = aplicarPrazo(await carregarTrilha(admin, prof), acao === 'observacao' ? null : jornada, tolerancia)
  const etapaEstado = trilha.find(e => e.id === etapaId)
  if (!etapaEstado) return json({ error: 'Etapa não encontrada.' }, 404)

  // O gate mora aqui, não no React: no app original bastava trocar a URL.
  if (etapaEstado.estado === 'bloqueada') {
    if (etapaEstado.motivoBloqueio === 'prazo') {
      return json({ error: MSG_PRAZO, codigo: 'prazo_esgotado' }, 403)
    }
    return json({
      error: etapaEstado.motivoBloqueio === 'data'
        ? 'Esta etapa ainda não abriu. Volte na data indicada.'
        : 'Conclua a etapa anterior para liberar esta.',
    }, 403)
  }

  if (acao === 'etapa') {
    const { data: blocos } = await admin
      .from('welcome_path_blocos')
      .select('id, ordem, tipo, titulo, conteudo, url, meta')
      .eq('etapa_id', etapaId)
      .order('ordem', { ascending: true })

    const { data: questoesRaw } = await admin
      .from('welcome_path_questoes')
      .select('id, bloco_id, ordem, tipo, enunciado, opcoes, peso, obrigatoria')
      .eq('etapa_id', etapaId)
      .order('ordem', { ascending: true })

    const questoes = (questoesRaw ?? []) as (Omit<QuestaoRow, 'corretas' | 'explicacao'> & {
      explicacao?: string | null
    })[]

    // Respostas da última tentativa — alimentam o modo de revisão. Nunca mandamos
    // `corretas`: o professor vê SE acertou e a explicação, não qual era a certa
    // (senão a segunda tentativa vira cópia da correção).
    const progresso = await garantirProgresso(admin, prof.id, etapaId)
    const jaRespondeu = (progresso?.tentativas ?? 0) > 0 && questoes.length > 0
    let minhasRespostas: unknown[] = []

    if (jaRespondeu) {
      const ids = questoes.map(q => q.id)

      const { data: r } = await admin
        .from('welcome_path_respostas')
        .select('questao_id, resposta, correta, comentario_revisao')
        .eq('professor_id', prof.id)
        .eq('tentativa', progresso.tentativas)
        .in('questao_id', ids)
      minhasRespostas = r ?? []

      // A explicação é material didático — só faz sentido depois de responder,
      // e é o que sustenta o modo de revisão quando ele recarrega a página.
      const { data: expl } = await admin
        .from('welcome_path_questoes')
        .select('id, explicacao')
        .in('id', ids)
      const porId = new Map((expl ?? []).map((e: { id: string; explicacao: string | null }) => [e.id, e.explicacao]))
      for (const q of questoes) q.explicacao = porId.get(q.id) ?? null
    }

    return json({
      etapa: {
        id: etapaEstado.id,
        ordem: etapaEstado.ordem,
        titulo: etapaEstado.titulo,
        descricao: etapaEstado.descricao,
        notaMinima: etapaEstado.notaMinima,
        prazoEm: etapaEstado.prazoEm,
        notasCoordenacao: etapaEstado.notasCoordenacao,
      },
      blocos: blocos ?? [],
      questoes,
      progresso: {
        iniciadaEm: progresso?.iniciada_em ?? null,
        concluidaEm: progresso?.concluida_em ?? null,
        nota: progresso?.nota ?? null,
        tentativas: progresso?.tentativas ?? 0,
        observacao: progresso?.observacao ?? '',
        revisaoPendente: progresso?.revisao_pendente ?? false,
        tempoSegundos: progresso?.tempo_segundos ?? 0,
      },
      minhasRespostas,
    })
  }

  if (acao === 'iniciar') {
    const progresso = await garantirProgresso(admin, prof.id, etapaId)
    if (progresso && !progresso.iniciada_em) {
      await admin.from('welcome_path_progresso')
        .update({ iniciada_em: new Date().toISOString() })
        .eq('id', progresso.id)
    }
    return json({ ok: true })
  }

  if (acao === 'tempo') {
    const bruto = typeof body.segundos === 'number' ? Math.floor(body.segundos) : 0
    const delta = Math.max(0, Math.min(bruto, TEMPO_MAX_POR_BATIDA))
    if (delta === 0) return json({ ok: true })

    const progresso = await garantirProgresso(admin, prof.id, etapaId)
    await admin.from('welcome_path_progresso')
      .update({ tempo_segundos: (progresso?.tempo_segundos ?? 0) + delta })
      .eq('id', progresso.id)
    return json({ ok: true })
  }

  if (acao === 'observacao') {
    const texto = textoLimpo(body.texto, TEXTO_MAX)
    const progresso = await garantirProgresso(admin, prof.id, etapaId)
    await admin.from('welcome_path_progresso')
      .update({ observacao: texto || null })
      .eq('id', progresso.id)
    return json({ ok: true })
  }

  // ══ responder ══════════════════════════════════════════════════════════════
  if (acao === 'responder') {
    if (etapaEstado.estado === 'concluida') {
      return json({ error: 'Você já concluiu esta etapa.' }, 409)
    }

    const progresso = await garantirProgresso(admin, prof.id, etapaId)
    if ((progresso?.tentativas ?? 0) >= TENTATIVAS_MAX) {
      return json({ error: 'Você atingiu o limite de tentativas nesta etapa. Fale com a coordenação.' }, 429)
    }
    if (progresso?.revisao_pendente) {
      return json({ error: 'Suas respostas estão em revisão pela coordenação. Aguarde o retorno.' }, 409)
    }

    const { data: questoesRaw } = await admin
      .from('welcome_path_questoes')
      .select('id, tipo, opcoes, corretas, explicacao, peso, obrigatoria')
      .eq('etapa_id', etapaId)
      .order('ordem', { ascending: true })

    const questoes = (questoesRaw ?? []) as QuestaoRow[]
    if (questoes.length === 0) {
      return json({ error: 'Esta etapa ainda não tem atividades cadastradas.' }, 400)
    }

    const enviadas = Array.isArray(body.respostas) ? body.respostas : []
    const porQuestao = new Map<string, Record<string, unknown>>()
    for (const r of enviadas) {
      if (r && typeof r === 'object' && typeof (r as { questaoId?: unknown }).questaoId === 'string') {
        porQuestao.set((r as { questaoId: string }).questaoId, r as Record<string, unknown>)
      }
    }

    const tentativa = (progresso?.tentativas ?? 0) + 1
    const linhas: Record<string, unknown>[] = []
    const resultado: { questaoId: string; correta: boolean | null; explicacao: string | null }[] = []

    for (const q of questoes) {
      const enviada = porQuestao.get(q.id)

      if (q.tipo === 'dissertativa') {
        const texto = textoLimpo(enviada?.texto, TEXTO_MAX)
        if (!texto) {
          if (q.obrigatoria) return json({ error: 'Responda todas as atividades obrigatórias.' }, 400)
          continue
        }
        // correta = null: entra como pendente e segura a conclusão se obrigatória.
        linhas.push({ professor_id: prof.id, questao_id: q.id, tentativa, resposta: { texto }, correta: null })
        resultado.push({ questaoId: q.id, correta: null, explicacao: q.explicacao })
        continue
      }

      const brutas = Array.isArray(enviada?.opcoes) ? (enviada!.opcoes as unknown[]) : []
      const escolhidas = brutas
        .filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
        .filter(n => n >= 0 && n < (q.opcoes?.length ?? 0))

      if (escolhidas.length === 0) {
        if (q.obrigatoria) return json({ error: 'Responda todas as atividades obrigatórias.' }, 400)
        continue
      }
      // Múltipla escolha e V/F aceitam uma alternativa só.
      if (q.tipo !== 'multipla_selecao' && escolhidas.length > 1) {
        return json({ error: 'Escolha apenas uma alternativa.' }, 400)
      }

      const correta = mesmoConjunto(escolhidas, q.corretas ?? [])
      linhas.push({
        professor_id: prof.id, questao_id: q.id, tentativa,
        resposta: { opcoes: escolhidas }, correta,
      })
      resultado.push({ questaoId: q.id, correta, explicacao: q.explicacao })
    }

    if (linhas.length === 0) return json({ error: 'Nenhuma resposta enviada.' }, 400)

    await admin.from('welcome_path_progresso').update({ tentativas: tentativa }).eq('id', progresso.id)

    const { error: errResp } = await admin.from('welcome_path_respostas').insert(linhas)
    if (errResp) {
      return json({ error: 'Não foi possível registrar suas respostas agora. Tente novamente.' }, 500)
    }

    // A regra de nota mora no banco (wp_recalcular_etapa) — a revisão de
    // dissertativa chama a mesma função. Duplicar aqui faria as duas divergirem.
    const { error: errCalc } = await admin.rpc('wp_recalcular_etapa', {
      p_professor_id: prof.id,
      p_etapa_id:     etapaId,
    })
    if (errCalc) return json({ error: 'Não foi possível calcular sua nota agora.' }, 500)

    const { data: final } = await admin
      .from('welcome_path_progresso')
      .select('nota, concluida_em, revisao_pendente, tentativas')
      .eq('id', progresso.id)
      .maybeSingle()

    // O gatilho trg_wp_conclusao_jornada carimba a trilha quando esta era a
    // última etapa que faltava — aí o front leva o professor aos parabéns.
    const { data: jFinal } = await admin
      .from('welcome_path_jornada')
      .select('concluida_em')
      .eq('professor_id', prof.id)
      .maybeSingle()

    return json({
      nota: final?.nota ?? null,
      aprovado: !!final?.concluida_em,
      notaMinima: etapaEstado.notaMinima,
      revisaoPendente: final?.revisao_pendente ?? false,
      tentativas: final?.tentativas ?? tentativa,
      trilhaConcluida: !!jFinal?.concluida_em,
      resultado,
    })
  }

  return json({ error: 'Ação desconhecida.' }, 400)
})
