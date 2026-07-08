// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: portal-agendamento-lookup
//
// Usada pela tela pública /agendar (sem login) como primeiro passo do Portal
// de Agendamento. A maioria dos professores sincronizados do KMS não tem
// e-mail cadastrado (professor_emails), então a identificação é feita só
// pelo nome — em 3 tentativas escalonadas, cada uma mais precisa que a
// anterior, pra minimizar tanto falso-negativo (não achar) quanto
// falso-positivo (achar a pessoa errada):
//
//   1ª tentativa — nome parcial (mín. 3 caracteres), casamento por token.
//   2ª tentativa — se ambíguo (>1 professor ativo bate), o front pede o
//                  nome completo e reenvia com o mesmo parâmetro `nome`.
//   3ª tentativa — se AINDA ambíguo (nomes idênticos — raro), o front pede
//                  mês/ano de início e reenvia com `mesInicio`/`anoInicio`,
//                  usados como desempate (± 1 mês de tolerância) contra
//                  professores.data_inicio.
//
// Em qualquer caso de ambiguidade ou não-encontrado, a resposta é genérica
// (`professor: null`) — nunca revela quantos bateram nem o motivo exato,
// pra não virar um jeito de "escanear" nomes cadastrados no sistema.
//
// Depois de resolver um professor único, resolve o coordenador responsável
// pelo seu grupo e retorna só as opções de agendamento elegíveis — nunca
// links de outro coordenador.
//
//   Opção 1 — "1ª reunião":     elegível só pro professor recém-chegado (até
//                                 7 dias de casa, por professores.data_inicio)
//                                 que nunca teve reunião com status='realizada'.
//                                 Aponta para o koalendar_link do coordenador.
//   Opção 2 — "Acompanhamento": elegível pra todo o resto — quem já passou
//                                 da janela de 1ª reunião (>7 dias de casa)
//                                 OU já teve ≥1 reunião realizada. Nunca deixa
//                                 o professor sem nenhuma opção. Aponta para
//                                 o google_appointment_link do coordenador.
//   Opção 3 — "Reuniões em grupo": elegível se professor_acompanhamento.
//                                 score_atual >= 1400. Sem link — o front
//                                 usa o fluxo já existente (teacher-lookup +
//                                 create-booking) para essa opção.
//
// Esta function NÃO mexe em agenda_reunioes/agenda_horarios — a Opção 3
// continua usando o fluxo público já existente, só passa a ficar atrás
// deste gate de score.
//
// ── Aviso de agendamento recente ────────────────────────────────────────────
// Professores que já passaram da janela de "1ª reunião" (>7 dias de casa) têm
// uma cadência mínima de 30 dias entre reuniões de acompanhamento:
//   - 8 a 90 dias de casa (1º-3º mês):  cadência MENSAL fixa (janela 30-30).
//   - mais de 90 dias de casa:          janela FLEXÍVEL de 30 a 60 dias.
// Se a última reunião vinculada (status realizada/pendente) tiver acontecido
// há menos de 30 dias, a resposta inclui `avisoAgendamentoRecente` — o front
// mostra um aviso antes das opções normais de agendamento, com duas saídas:
// declarar que a reunião não aconteceu (via portal-agendamento-declarar-nao-fez,
// libera o reagendamento) ou seguir direto pras opções (p.ex. só tirar uma dúvida).
// Não há bloqueio por estar "atrasado" (>60 dias) — a janela máxima é só
// informativa na mensagem, nunca impede o agendamento.
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/portal-agendamento-lookup
//   Body: { "nome": "Fulano de Tal", "mesInicio"?: 3, "anoInicio"?: 2026 }
//   Retorna: {
//     professor:   { id, nome } | null,
//     coordenador: { id, nome } | null,
//     ambiguo:     boolean,   // true = mais de 1 professor bateu com o nome informado
//     opcoes: {
//       primeira_reuniao: { elegivel: boolean, link: string | null },
//       acompanhamento:   { elegivel: boolean, link: string | null },
//       reuniao_grupo:    { elegivel: boolean, recomendada: boolean },
//     },
//     avisoAgendamentoRecente: {
//       reuniaoProfessorId: string,
//       data: string,             // data da última reunião vinculada (ISO)
//       diasDesdeUltima: number,
//       diasParaProxima: number,  // dias que faltam pra completar os 30 dias mínimos de cadência
//       proximaDataSugerida: string, // ISO — última data + 30 dias (início da janela)
//       janela: { min: number, max: number }, // 30-30 (mensal) ou 30-60 (flexível, >90 dias de casa)
//     } | null,
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SCORE_MINIMO_GRUPO = 1400
const DIAS_JANELA_PRIMEIRA_REUNIAO = 7
const DIAS_JANELA_ACOMPANHAMENTO_MENSAL = 90 // ~3 meses de casa — cadência mensal fixa (30 dias)
const CADENCIA_MIN_DIAS = 30
const CADENCIA_MAX_DIAS_MENSAL    = 30 // professores 8-90 dias de casa: cadência fixa
const CADENCIA_MAX_DIAS_FLEXIVEL  = 60 // professores >90 dias de casa: janela livre de 30-60 dias
const NOME_MIN_CHARS = 3
const STOPWORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e'])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokens(s: string): string[] {
  return norm(s).split(' ').filter(t => t.length > 1 && !STOPWORDS.has(t))
}

/** Todo token informado precisa aparecer entre os tokens do nome real — permite nome parcial sem abrir mão de precisão. */
function nomeCorresponde(tokensInformados: string[], tokensReal: string[]): boolean {
  if (!tokensInformados.length) return false
  return tokensInformados.every(t => tokensReal.includes(t))
}

/** Mês/ano de início dentro de ±1 mês de tolerância (memória imprecisa é normal). */
function dataInicioBate(dataInicio: string | null, mes: number, ano: number): boolean {
  if (!dataInicio) return false
  const d = new Date(dataInicio)
  const diffMeses = (d.getUTCFullYear() - ano) * 12 + (d.getUTCMonth() - (mes - 1))
  return Math.abs(diffMeses) <= 1
}

/** Dias completos desde uma data ISO, normalizando pra meia-noite UTC (evita erro de fuso/hora do dia).
 *  Negativo quando a data é no futuro. */
function diasDesde(dataIso: string | null): number | null {
  if (!dataIso) return null
  const d = new Date(dataIso)
  if (isNaN(d.getTime())) return null
  const agora = new Date()
  const dUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const agoraUTC = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
  return Math.round((agoraUTC - dUTC) / 86400000)
}

const diasDeCasa = diasDesde

const OPCOES_VAZIAS = {
  primeira_reuniao: { elegivel: false, link: null },
  acompanhamento:   { elegivel: false, link: null },
  reuniao_grupo:    { elegivel: false, recomendada: false },
}

function respostaVazia(ambiguo: boolean) {
  return { professor: null, coordenador: null, ambiguo, opcoes: OPCOES_VAZIAS, avisoAgendamentoRecente: null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: { nome?: unknown; mesInicio?: unknown; anoInicio?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const nome = typeof body.nome === 'string' ? body.nome.trim() : ''
  if (nome.length < NOME_MIN_CHARS) return json({ error: `Nome precisa ter ao menos ${NOME_MIN_CHARS} caracteres.` }, 400)

  const mesInicio = typeof body.mesInicio === 'number' ? body.mesInicio : null
  const anoInicio = typeof body.anoInicio === 'number' ? body.anoInicio : null

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Identifica candidatos pelo nome (casamento por token, não por e-mail) ─
  const { data: ativos } = await admin
    .from('professores')
    .select('id, nome, status, coordenador_id, data_inicio')
    .eq('status', 'ativo')

  const tokensInformados = tokens(nome)
  let candidatos = (ativos ?? []).filter(p => nomeCorresponde(tokensInformados, tokens(p.nome)))

  // ── 2. Desempate por mês/ano de início, só quando ainda ambíguo ──────────────
  if (candidatos.length > 1 && mesInicio != null && anoInicio != null) {
    candidatos = candidatos.filter(p => dataInicioBate(p.data_inicio, mesInicio, anoInicio))
  }

  if (candidatos.length === 0) return json(respostaVazia(false))
  if (candidatos.length > 1)   return json(respostaVazia(true))

  const professor = candidatos[0]

  if (!professor.coordenador_id) {
    return json({ professor: { id: professor.id, nome: professor.nome }, coordenador: null, ambiguo: false, opcoes: OPCOES_VAZIAS, avisoAgendamentoRecente: null })
  }

  // ── 3. Coordenador responsável e seus links ──────────────────────────────────
  const { data: coordenador } = await admin
    .from('profiles')
    .select('id, nome, koalendar_link, google_appointment_link')
    .eq('id', professor.coordenador_id)
    .maybeSingle()

  if (!coordenador) {
    return json({ professor: { id: professor.id, nome: professor.nome }, coordenador: null, ambiguo: false, opcoes: OPCOES_VAZIAS, avisoAgendamentoRecente: null })
  }

  // ── 4. Já teve reunião realizada? ────────────────────────────────────────────
  const { count: reunioesRealizadas } = await admin
    .from('reuniao_professores')
    .select('id', { count: 'exact', head: true })
    .eq('professor_id', professor.id)
    .eq('status', 'realizada')

  const teveReuniaoRealizada = (reunioesRealizadas ?? 0) > 0

  // ── 5. Recém-chegado? (até 7 dias de casa) ───────────────────────────────────
  const dias = diasDeCasa(professor.data_inicio)
  const recemChegado = dias != null && dias >= 0 && dias <= DIAS_JANELA_PRIMEIRA_REUNIAO

  const primeiraReuniaoElegivel = recemChegado && !teveReuniaoRealizada && !!coordenador.koalendar_link
  // Todo mundo que não se enquadra na 1ª reunião cai aqui — nunca deixa o professor sem nenhuma opção.
  const acompanhamentoElegivel  = !(recemChegado && !teveReuniaoRealizada) && !!coordenador.google_appointment_link

  // ── 6. Score de elegibilidade para reunião em grupo ──────────────────────────
  const { data: acompanhamento } = await admin
    .from('professor_acompanhamento')
    .select('score_atual')
    .eq('professor_id', professor.id)
    .maybeSingle()

  const scoreAtual = acompanhamento?.score_atual ?? null
  const elegivelGrupo = scoreAtual != null && scoreAtual >= SCORE_MINIMO_GRUPO

  // ── 7. Aviso de agendamento recente (cadência mínima de 30 dias, >7 dias de casa) ─
  let avisoAgendamentoRecente: {
    reuniaoProfessorId: string
    data: string
    diasDesdeUltima: number
    diasParaProxima: number
    proximaDataSugerida: string
    janela: { min: number; max: number }
  } | null = null

  const passouDaPrimeiraReuniao = dias != null && dias > DIAS_JANELA_PRIMEIRA_REUNIAO
  const cadenciaMaxDias = dias != null && dias <= DIAS_JANELA_ACOMPANHAMENTO_MENSAL
    ? CADENCIA_MAX_DIAS_MENSAL
    : CADENCIA_MAX_DIAS_FLEXIVEL

  if (passouDaPrimeiraReuniao) {
    // Traz todas as participações realizada/pendente e escolhe a de data mais recente em JS —
    // `.order(..., { referencedTable })` não ordena de forma confiável a tabela embutida aqui.
    const { data: reunioesDoProfessor } = await admin
      .from('reuniao_professores')
      .select('id, reuniao:reunioes!inner(data)')
      .eq('professor_id', professor.id)
      .in('status', ['realizada', 'pendente'])

    type LinhaReuniao = { id: string; reuniao: { data: string } | { data: string }[] }
    const linhas = (reunioesDoProfessor ?? []) as LinhaReuniao[]

    let ultima: { id: string; data: string } | null = null
    for (const linha of linhas) {
      const r = Array.isArray(linha.reuniao) ? linha.reuniao[0] : linha.reuniao
      if (!r) continue
      if (!ultima || new Date(r.data) > new Date(ultima.data)) {
        ultima = { id: linha.id, data: r.data }
      }
    }

    if (ultima) {
      const diasDesdeUltima = diasDesde(ultima.data)
      if (diasDesdeUltima != null && diasDesdeUltima < CADENCIA_MIN_DIAS) {
        const dataUltima = new Date(ultima.data)
        const proximaData = new Date(dataUltima.getTime() + CADENCIA_MIN_DIAS * 86400000)
        avisoAgendamentoRecente = {
          reuniaoProfessorId: ultima.id,
          data: ultima.data,
          diasDesdeUltima,
          diasParaProxima: Math.max(CADENCIA_MIN_DIAS - diasDesdeUltima, 0),
          proximaDataSugerida: proximaData.toISOString(),
          janela: { min: CADENCIA_MIN_DIAS, max: cadenciaMaxDias },
        }
      }
    }
  }

  return json({
    professor: { id: professor.id, nome: professor.nome },
    coordenador: { id: coordenador.id, nome: coordenador.nome },
    ambiguo: false,
    opcoes: {
      primeira_reuniao: {
        elegivel: primeiraReuniaoElegivel,
        link: primeiraReuniaoElegivel ? coordenador.koalendar_link : null,
      },
      acompanhamento: {
        elegivel: acompanhamentoElegivel,
        link: acompanhamentoElegivel ? coordenador.google_appointment_link : null,
      },
      reuniao_grupo: {
        elegivel: elegivelGrupo,
        recomendada: elegivelGrupo,
      },
    },
    avisoAgendamentoRecente,
  })
})
