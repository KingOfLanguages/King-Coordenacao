// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: portal-agendamento-lookup
//
// Usada pela tela pública /agendar (sem login). Quem é o professor vem SÓ da
// sessão emitida por `portal-identidade` (código no e-mail oficial) — desde o
// pentest de 05/10/2026. Antes a tela resolvia por e-mail OU nome completo e
// ainda "aprendia" o e-mail digitado sem prova nenhuma, o que deixava qualquer
// pessoa trocar o canal de contato de qualquer professor.
//
// Depois de resolver um professor único, resolve o coordenador responsável
// pelo seu grupo e retorna só as opções de agendamento elegíveis — nunca
// links de outro coordenador.
//
//   Opção 1 — "1ª reunião":     elegível só pro professor recém-chegado (até
//                                 7 dias de casa, por professores.data_inicio,
//                                 ou que concluiu o Welcome Path)
//                                 que nunca teve reunião com status='realizada'.
//                                 Aponta para o koalendar_link do coordenador.
//   Opção 2 — "Acompanhamento": elegível pra todo o resto — quem já passou
//                                 da janela de 1ª reunião (>7 dias de casa)
//                                 OU já teve ≥1 reunião realizada. Nunca deixa
//                                 o professor sem nenhuma opção. Aponta para
//                                 o google_appointment_link do coordenador.
//   Opção 3 — "Reuniões em grupo": elegível se professor_acompanhamento.
//                                 score_atual >= 1300. Sem link — o front
//                                 usa o fluxo já existente (teacher-lookup +
//                                 create-booking) para essa opção.
//
// Esta function NÃO mexe em agenda_reunioes/agenda_horarios — a Opção 3
// continua usando o fluxo público já existente, só passa a ficar atrás
// deste gate de score.
//
// ── Aviso de agendamento recente ────────────────────────────────────────────
// Professores que já passaram da janela de "1ª reunião" (>7 dias de casa) têm
// uma cadência mínima de 30 dias entre reuniões DE ACOMPANHAMENTO:
//   - 8 a 90 dias de casa (1º-3º mês):  cadência MENSAL fixa (janela 30-30).
//   - mais de 90 dias de casa:          janela FLEXÍVEL de 30 a 60 dias.
//
// O aviso NUNCA é uma trava (2026-08-21). A regra da coordenação é "1 reunião
// de acompanhamento oficial por mês até o 3º mês, e quantas reuniões de dúvida
// ele quiser". Então, quando a última reunião tem menos de 30 dias, a resposta
// inclui `avisoAgendamentoRecente` e o front mostra o aviso JUNTO das opções de
// agendamento — ele fica sabendo que já cumpriu o acompanhamento do mês e, se
// mesmo assim quiser conversar, agenda na hora. O aviso segue oferecendo
// declarar que a reunião não aconteceu (portal-agendamento-declarar-nao-fez).
//
// Só reuniões `natureza='acompanhamento'` entram nessa conta: a de dúvida é
// justamente a que "não implica em nada" (ver 20260770).
//
// A reunião em GRUPO não passa por aqui: ela tem regra própria (score >= 1300 e
// 2 meses de casa) e independe de quando foi a última reunião.
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/portal-agendamento-lookup
//   Body: { "token": "<sessão do portal-identidade>" }  → 401 sem sessão válida
//   (escopo completo OU agendamento — este portal abre sem código desde 08/10)
//   Retorna: {
//     professor:   { id, nome },
//     coordenador: { id, nome } | null,
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

import {
  jsonPara, preflight, resolverSessao, semSufixoInicio, MSG_SESSAO,
} from '../_shared/portal.ts'

const SCORE_MINIMO_GRUPO = 1300
const DIAS_MIN_GRUPO = 60 // reunião em grupo só para quem já tem >= 2 meses de casa
const DIAS_JANELA_PRIMEIRA_REUNIAO = 7
const DIAS_JANELA_ACOMPANHAMENTO_MENSAL = 90 // ~3 meses de casa — cadência mensal fixa (30 dias)
const CADENCIA_MIN_DIAS = 30
const CADENCIA_MAX_DIAS_MENSAL    = 30 // professores 8-90 dias de casa: cadência fixa
const CADENCIA_MAX_DIAS_FLEXIVEL  = 60 // professores >90 dias de casa: janela livre de 30-60 dias

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  const json = jsonPara(req)
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: { token?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Identificação: só pela sessão ─────────────────────────────────────────
  // Aceita a sessão de agendamento (sem código) — ver 20260794.
  const professor = await resolverSessao(admin, body.token, { aceitaAgendamento: true })
  if (!professor) return json({ error: MSG_SESSAO }, 401)

  // Nome limpo pra exibição: o professor vê o próprio nome sem o resíduo de
  // "início/data" do cadastro (senão "Você é Fulano - inicio 18/09?" confunde e
  // ele desiste — barrado na prática). O id é o que segue nos próximos passos.
  const nomeExibicao = semSufixoInicio(professor.nome)

  if (!professor.coordenador_id) {
    return json({ professor: { id: professor.id, nome: nomeExibicao }, coordenador: null, opcoes: OPCOES_VAZIAS, avisoAgendamentoRecente: null })
  }

  // ── 3. Coordenador responsável e seus links ──────────────────────────────────
  const { data: coordenador } = await admin
    .from('profiles')
    .select('id, nome, koalendar_link, google_appointment_link')
    .eq('id', professor.coordenador_id)
    .maybeSingle()

  if (!coordenador) {
    return json({ professor: { id: professor.id, nome: nomeExibicao }, coordenador: null, opcoes: OPCOES_VAZIAS, avisoAgendamentoRecente: null })
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
  // Quem concluiu o Welcome Path também é "recém-chegado" para a 1ª reunião:
  // a trilha tem 5 dias contados do 1º acesso, então muita gente termina depois
  // do 7º dia de casa — e a tela de parabéns manda agendar justamente a 1ª.
  const { data: jornadaTrilha } = await admin
    .from('welcome_path_jornada')
    .select('concluida_em')
    .eq('professor_id', professor.id)
    .maybeSingle()
  const concluiuTrilha = !!jornadaTrilha?.concluida_em
  const recemChegado = (dias != null && dias >= 0 && dias <= DIAS_JANELA_PRIMEIRA_REUNIAO) || concluiuTrilha

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
  // Reunião em grupo exige score mínimo E pelo menos 2 meses de casa (dias já
  // computado no passo 5). data_inicio nulo → não elegível (não dá pra provar os
  // 2 meses); hoje todos os professores ativos têm data_inicio, então isso não
  // bloqueia ninguém real — é só a trava segura.
  const elegivelGrupo = scoreAtual != null && scoreAtual >= SCORE_MINIMO_GRUPO
    && dias != null && dias >= DIAS_MIN_GRUPO

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
      .select('id, reuniao:reunioes!inner(data, natureza)')
      .eq('professor_id', professor.id)
      .in('status', ['realizada', 'pendente'])

    type ReuniaoEmbutida = { data: string; natureza?: string | null }
    type LinhaReuniao = { id: string; reuniao: ReuniaoEmbutida | ReuniaoEmbutida[] }
    const linhas = (reunioesDoProfessor ?? []) as LinhaReuniao[]

    // A filtragem por natureza é feita aqui e não no `.eq()` de recurso embutido
    // porque o embed já é `!inner` com alias — e porque `natureza` pode vir
    // indefinida enquanto a 20260770 não estiver aplicada, caso em que o
    // COALESCE abaixo mantém o comportamento antigo (tudo é acompanhamento).
    let ultima: { id: string; data: string } | null = null
    for (const linha of linhas) {
      const r = Array.isArray(linha.reuniao) ? linha.reuniao[0] : linha.reuniao
      if (!r) continue
      if ((r.natureza ?? 'acompanhamento') === 'duvida') continue
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
    professor: { id: professor.id, nome: nomeExibicao },
    coordenador: { id: coordenador.id, nome: coordenador.nome },
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
