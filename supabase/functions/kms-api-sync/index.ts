// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: kms-api-sync
//
// Substitui o kms-webhook (nunca implantado). Faz PULL da API de Acompanhamento
// de Professores do King (~2.200 cadastros, paginados por professor_id
// crescente):
//   1. POST /api/Login com KMS_API_EMAIL/KMS_API_PASSWORD → accessToken
//   2. GET /api/v1/acompanhamento-professores, página a página
//   3. Por página: upsert em LOTE (não um-a-um — com ~2.000 professores, fazer
//      5 chamadas sequenciais ao banco por professor estoura o limite de
//      recursos da Edge Function) em professores (por kms_id) +
//      professor_acompanhamento + professor_score_historico +
//      professor_alunos_kms + ciclo de vida + turnover
//
// RODADAS EM PARTES (2026-10-19): a rodada única morria com
// WORKER_RESOURCE_LIMIT na página 7–8 de 11, e quem ficava de fora era o fim da
// lista — os professores mais NOVOS. Agora cada rodada é uma sequência de
// chamadas curtas (PAGINAS_POR_CHAMADA páginas cada), com o cursor guardado em
// kms_sync_rodadas e cada chamada disparando a próxima. Cada uma tem o próprio
// orçamento, então a rodada termina mesmo com o volume crescendo.
//
//   Corpo da requisição:
//     {}                       → nova rodada de ATIVOS (cron de hora em hora);
//                                leve, exceto a das 03:00 (ver JANELA_CICLO_DIAS)
//     {"completa":true}        → rodada de ativos completa, fora de hora
//     {"tipo":"desligados"}    → nova rodada de DESLIGADOS (cron de terça e sexta)
//     {"tipo":"novos"}         → SÓ o passo dos novos, fora de rodada (cron de
//                                5 em 5 min; ver soNovos)
//     {"rodada_id":"<uuid>"}   → próxima parte (a própria função se chama)
//     {"retomar":"<uuid>"}     → retoma rodada que parou (cron vigia)
//   A resposta é 202 na hora; o trabalho segue em segundo plano
//   (EdgeRuntime.waitUntil) e o resultado fica em kms_sync_rodadas. O "novos"
//   é a exceção: não abre rodada, e quem ele traz só aparece no log.
//
//   Rodada de ativos, nesta ordem:
//     a. passo dos novos — consulta os IDs logo acima do maior kms_id que já
//        temos e grava esses professores ANTES de qualquer página;
//     b. páginas status=ativo;
//     c. quem sumiu — ativo/pausado no KTM que não veio nas páginas é consultado
//        um a um: quem saiu da King entra como desligado na hora, com a data de
//        saída da King (sem esperar a rodada de desligados);
//     d. reconciliação de ausentes (abaixo).
//
// Importante: o bloco `perfil` (email/telefone/cidade/estado/nível +
// dados_atualizados) passou a ser consumido — contato/localização por COALESCE
// (só preenche onde está vazio, não atropela a curadoria manual/planilha);
// dados_atualizados e nivel_recomendado_alunos_raw são espelho da API. O roster
// é filtrado por tipo_vinculo (turma fica de fora da carteira). NÃO seta
// coordenador_id/grupo_id a partir do campo `coordenador` da API — a
// distribuição continua sendo feita pelo nosso algoritmo
// (atribuir_grupo_professor / distribuir_professores_inicial).
//
// AUSÊNCIA (2026-09-04): upsert sozinho só sabe falar de quem VEIO. Quem sumia
// do feed ficava 'ativo' pra sempre e seguia recebendo convocação por e-mail —
// com o agravante de que o snapshot congelado ("precisa marcar reunião", data
// velha) empurrava o fantasma pro topo da fila de prioridade. Agora toda pessoa
// devolvida pela API recebe o carimbo `visto_na_api_em`, e no fim de uma rodada
// de ativos LIMPA chamamos reconciliar_professores_ausentes() pra dar baixa em
// quem passou da carência sem aparecer. Ver migration 20260780.
//
// Secrets necessários:
//   KMS_API_BASE_URL, KMS_API_EMAIL, KMS_API_PASSWORD
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (já existentes no projeto)
//   CRON_SECRET (opcional — se configurado, exige Authorization: Bearer <CRON_SECRET>)
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

function novoAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}
type Admin = ReturnType<typeof novoAdmin>

/** Dias que um professor pode ficar fora do feed antes de ser desligado. O cron
 *  roda de hora em hora, então 7 dias é ~168 chances de ele reaparecer: cobre
 *  instabilidade da API e mudança de cadastro do outro lado sem dar baixa em
 *  quem continua na escola. */
const GRACA_AUSENCIA_DIAS = 7

/** Fração dos nossos não-desligados que a rodada precisa ter carimbado pra
 *  valer como prova de ausência de alguém. Um feed truncado responde 200 sem
 *  erro nenhum; sem esse piso, ele viraria desligamento em massa. */
const COBERTURA_MINIMA = 0.8

/** Professores por página da API, e uma página por chamada. Medido em 19/10:
 *  página só de ATIVOS pesa bem mais que a antiga misturada (200 ativos trazem
 *  ~7.800 saídas de aluno no ciclo de vida, contra ~7 por desligado), e uma
 *  chamada não aguentou 1,5 página de 200. Com 100, cada chamada usa ~1/3 do
 *  que derrubava a função. O ciclo de vida já vem com os 12 meses cheios e
 *  cresce com o volume de saídas de aluno; se voltar a cair, baixe este número.
 *  Mudar o tamanho no meio de uma rodada é seguro: o cursor da API é posição,
 *  então no pior caso uma página se repete, nunca se pula. */
const TAMANHO_PAGINA = 100
const PAGINAS_POR_CHAMADA = 1

/** RODADA LEVE x COMPLETA. O histórico (ciclo de vida dos alunos, score mensal)
 *  é quase todo passado que não muda — e era regravado inteiro toda hora (em
 *  19/10: 21 mil linhas de ciclo por rodada de ativos, só 4,5 mil com saída nos
 *  últimos 45 dias). Na rodada leve, para quem JÁ está no KTM, só vai o recente;
 *  professor novo vai sempre completo. Uma rodada completa por dia (03:00 de
 *  Brasília, ou a primeira depois de 26 h sem uma) pega correção retroativa da
 *  King. Desligados: sempre completa (só rodam terça e sexta). */
const JANELA_CICLO_DIAS = 45
const MESES_SCORE = 2
/** 06:00 UTC = 03:00 de Brasília (sem horário de verão desde 2019). */
const HORA_UTC_RODADA_COMPLETA = 6
const HORAS_MAX_SEM_COMPLETA = 26

/** Passo dos novos: para depois de N IDs seguidos sem professor. Os IDs do King
 *  são quase sequenciais (em 19/10, nenhum buraco maior que 1 acima do 1500). */
const NOVOS_FALHAS_SEGUIDAS = 5
const NOVOS_MAXIMO_CONSULTAS = 60

/** Teto de consultas individuais de quem sumiu dos ativos, por rodada. São ~2
 *  saídas por dia; muito mais que isso é feed estranho, não saída em massa. */
const SUMIDOS_MAXIMO = 60

interface AlunoKms {
  aluno_id: number
  primeiro_nome: string
  data_adicao: string | null
  status_vinculo: string | null
  status_vinculo_codigo?: string | null
  status_aluno?: string | null
  tipo_vinculo?: string | null
  data_matricula_escola?: string | null
}

interface PerfilKms {
  email: string | null
  telefone: string | null
  cidade: string | null
  estado: string | null
  nivel_recomendado_alunos: string | null
  dados_atualizados: boolean
}

interface MotivoBloqueioKms {
  motivo: string
  quantidade: number
}

interface CicloVidaKms {
  aluno_id: number
  primeiro_nome: string | null
  data_saida: string | null
  motivo_saida: string | null
  saiu_da_escola: boolean | null
  data_matricula_escola: string | null
  data_inicio_aulas: string | null
  /** A API não manda (2026-08-28). Fica aqui para o dia em que mandar — até lá
   *  a entrada vem do roster, capturada antes do delete (ver passo 4). */
  data_adicao?: string | null
}

interface ScoreKms {
  atual: number | null
  faixa: string | null
  elegivel_alocacao: boolean | null
  historico_mensal?: { ano_mes: number; score: number }[]
  avaliacao_alunos?: Record<string, unknown>
}

interface ReuniaoMonitoramentoKms {
  status: string | null
  ultima: string | null
  proxima: string | null
  coordenador?: string | null
}

interface AlertasKms {
  aulas_pendentes?: { quantidade: number; data_mais_antiga: string | null }
  faltas_professor?: { quantidade: number; datas: string[] }
  no_show_primeira_aula?: { quantidade: number; datas: string[] }
  agendas_bloqueadas?: { quantidade_horarios: number; motivos: unknown[] }
  trocas_professor?: unknown[]
}

interface TurnoverSaidaKms {
  data: string | null
  motivo: string | null
  quantidade_alunos_realocados: number | null
  saiu_no_periodo: boolean | null
}

interface TurnoverKms {
  data_entrada: string | null
  entrou_no_periodo: boolean | null
  saida: TurnoverSaidaKms | null
}

interface ProfessorKms {
  professor_id: number
  nome: string
  data_entrada: string | null
  status: string
  coordenador?: string | null
  perfil?: PerfilKms
  agenda_bloqueada?: boolean
  motivos_bloqueio?: MotivoBloqueioKms[]
  alunos?: AlunoKms[]
  ciclo_vida_alunos?: CicloVidaKms[]
  turnover?: TurnoverKms
  score?: ScoreKms
  reuniao_monitoramento?: ReuniaoMonitoramentoKms
  alertas?: AlertasKms
}

interface AcompanhamentoResponse {
  data: ProfessorKms[]
  proximo_cursor: string | null
  limit: number
}

type TipoRodada = 'ativos' | 'desligados'

interface ErroRodada {
  pagina: number | null
  erro: string
}

/** Linha de kms_sync_rodadas (só o que a função usa). */
interface Rodada {
  id: string
  tipo: TipoRodada
  completa: boolean
  status: string
  iniciada_em: string
  cursor: string | null
  varredura_completa: boolean
  chamadas: number
  retomadas: number
  paginas: number
  recebidos: number
  criados: number
  atualizados: number
  linhas_ciclo: number
  linhas_score: number
  erros: ErroRodada[]
}

interface Contagem {
  criados: number
  atualizados: number
  linhasCiclo: number
  linhasScore: number
}

const CONTAGEM_VAZIA: Contagem = { criados: 0, atualizados: 0, linhasCiclo: 0, linhasScore: 0 }

/** Cortes da rodada leve: data mínima de saída de aluno ('AAAA-MM-DD') e mês
 *  mínimo de score (AAAAMM, o mês anterior ao atual). */
function cortesRecentes(): { ciclo: string; anoMes: number } {
  const hoje = new Date()
  const ciclo = new Date(hoje.getTime() - JANELA_CICLO_DIAS * 86_400_000).toISOString().slice(0, 10)
  const mes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - (MESES_SCORE - 1), 1))
  return { ciclo, anoMes: mes.getUTCFullYear() * 100 + mes.getUTCMonth() + 1 }
}

function mapStatus(status: string): 'ativo' | 'pausa' | 'desligado' {
  const s = status.toLowerCase()
  if (s === 'desligado') return 'desligado'
  if (s === 'pausado' || s === 'pausa') return 'pausa'
  return 'ativo'
}

// A base do King tem data corrompida em quantidade não-trivial: '0001-01-01'
// (sentinela de "vazio"), além de 1979, 1994, 2060… Datas assim envenenam
// qualquer contagem por período, então viram NULL — que o cálculo de ativos
// trata como "já estava lá" (ver migration 20260757).
function dataSana(d: string | null | undefined): string | null {
  if (!d) return null
  const s = String(d).slice(0, 10)
  const ano = Number(s.slice(0, 4))
  return ano >= 2015 && ano <= 2030 ? s : null
}

// Primeiro valor não-vazio (para COALESCE de contato: valor do banco vence,
// depois o da API; '' conta como vazio).
function firstNonEmpty(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return v
  }
  return null
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function agora(): string {
  return new Date().toISOString()
}

function json(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function login(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, rememberMe: false }),
  })
  if (!res.ok) throw new Error(`Login falhou (${res.status})`)
  const json = await res.json()
  const token = json?.object?.accessToken ?? json?.message
  if (!token) throw new Error('Login não retornou accessToken')
  return token
}

async function buscar(
  baseUrl: string,
  token: string,
  filtros: Record<string, string>,
): Promise<AcompanhamentoResponse> {
  const params = new URLSearchParams(filtros)
  const res = await fetch(`${baseUrl}/api/v1/acompanhamento-professores?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  // Consulta por um professor_id que não existe: 404 é "ninguém", não erro.
  if (res.status === 404 && filtros.professor_id) {
    await res.body?.cancel()
    return { data: [], proximo_cursor: null, limit: 1 }
  }
  if (!res.ok) throw new Error(`Falha ao buscar página (${res.status})`)
  return res.json()
}

/** Uma página da varredura, com uma segunda tentativa: instabilidade passageira
 *  da API não deve derrubar a rodada inteira. */
async function buscarPagina(
  baseUrl: string,
  token: string,
  tipo: TipoRodada,
  cursor: string | null,
): Promise<AcompanhamentoResponse> {
  const filtros: Record<string, string> = {
    limit: String(TAMANHO_PAGINA),
    status: tipo === 'desligados' ? 'desligado' : 'ativo',
  }
  if (cursor) filtros.cursor = cursor
  try {
    return await buscar(baseUrl, token, filtros)
  } catch {
    await new Promise(r => setTimeout(r, 2000))
    return await buscar(baseUrl, token, filtros)
  }
}

/** Um professor pelo ID, sem filtro de status. Confere o ID devolvido: se a API
 *  ignorar o filtro, o primeiro da lista não pode ser tomado por ele. */
async function buscarProfessor(baseUrl: string, token: string, kmsId: number): Promise<ProfessorKms | null> {
  const pagina = await buscar(baseUrl, token, { professor_id: String(kmsId), limit: '1' })
  return pagina.data.find(p => Number(p.professor_id) === kmsId) ?? null
}

/** Grava um lote de professores da API (uma página, os novos ou os sumidos).
 *  `carimbo` é o visto_na_api_em da rodada — o mesmo em todas as chamadas.
 *  `leve`: para quem já existia, grava só o histórico recente (ver
 *  JANELA_CICLO_DIAS). */
async function processarProfessores(
  admin: Admin,
  entrada: ProfessorKms[],
  carimbo: string,
  leve: boolean,
): Promise<Contagem> {
  // A mesma pessoa duas vezes no lote derruba o upsert ("cannot affect row a
  // second time"); fica a última.
  const lista = [...new Map(entrada.map(p => [String(p.professor_id), p])).values()]
  if (!lista.length) return { ...CONTAGEM_VAZIA }
  const corte = cortesRecentes()

  const kmsIds = lista.map(p => String(p.professor_id))

  // Quais já existem (pra contabilizar criados vs atualizados).
  const { data: existentes, error: existErr } = await admin
    .from('professores')
    .select('kms_id, telefone, email, cidade, estado')
    .in('kms_id', kmsIds)
  if (existErr) throw new Error(existErr.message)
  const jaExistiam = new Set((existentes ?? []).map(e => e.kms_id))
  const perfilExistente = new Map(
    (existentes ?? []).map(e => [
      e.kms_id as string,
      e as { telefone: string | null; email: string | null; cidade: string | null; estado: string | null },
    ]),
  )

  // 1 — Upsert em lote de identidade.
  const professoresPayload = lista.map(p => {
    const kmsId = String(p.professor_id)
    const atual = perfilExistente.get(kmsId)
    const perfil = p.perfil
    return {
      kms_id: kmsId,
      nome: p.nome,
      data_inicio: p.data_entrada,
      status: mapStatus(p.status),
      // Contato/localização: COALESCE — só preenche onde está vazio, nunca
      // sobrescreve a curadoria manual/planilha.
      telefone: firstNonEmpty(atual?.telefone, perfil?.telefone),
      email:    firstNonEmpty(atual?.email,    perfil?.email),
      cidade:   firstNonEmpty(atual?.cidade,   perfil?.cidade),
      estado:   firstNonEmpty(atual?.estado,   perfil?.estado),
      // Espelho da API (sobrescreve). O nivel curado NÃO é tocado.
      dados_atualizados:            perfil?.dados_atualizados ?? null,
      nivel_recomendado_alunos_raw: perfil?.nivel_recomendado_alunos ?? null,
      // Prova de vida: "a API devolveu esta pessoa nesta rodada". É o que
      // torna a AUSÊNCIA detectável lá embaixo — sem o carimbo, sumir do
      // feed é indistinguível de não ter mudado nada.
      visto_na_api_em: carimbo,
    }
  })
  const { data: upserted, error: upsertErr } = await admin
    .from('professores')
    .upsert(professoresPayload, { onConflict: 'kms_id' })
    .select('id, kms_id')
  if (upsertErr) throw new Error(upsertErr.message)

  const idByKmsId = new Map((upserted ?? []).map(r => [r.kms_id as string, r.id as string]))
  let criados = 0
  let atualizados = 0
  for (const kmsId of kmsIds) {
    if (jaExistiam.has(kmsId)) atualizados++
    else criados++
  }

  // 2 — Upsert em lote do snapshot de acompanhamento.
  const acompanhamentoPayload = lista
    .map(p => {
      const professorId = idByKmsId.get(String(p.professor_id))
      if (!professorId) return null
      const alertas = p.alertas ?? {}
      return {
        professor_id: professorId,
        score_atual: p.score?.atual ?? null,
        score_faixa: p.score?.faixa ?? null,
        elegivel_alocacao: p.score?.elegivel_alocacao ?? null,
        avaliacao_alunos: p.score?.avaliacao_alunos ?? null,
        reuniao_status: p.reuniao_monitoramento?.status ?? null,
        reuniao_ultima: p.reuniao_monitoramento?.ultima ?? null,
        reuniao_proxima: p.reuniao_monitoramento?.proxima ?? null,
        aulas_pendentes_qtd: alertas.aulas_pendentes?.quantidade ?? 0,
        aulas_pendentes_data_mais_antiga: alertas.aulas_pendentes?.data_mais_antiga ?? null,
        faltas_professor: alertas.faltas_professor ?? null,
        no_show_primeira_aula: alertas.no_show_primeira_aula ?? null,
        agendas_bloqueadas: alertas.agendas_bloqueadas ?? null,
        agenda_bloqueada: p.agenda_bloqueada ?? null,
        motivos_bloqueio: p.motivos_bloqueio ?? null,
        trocas_professor: alertas.trocas_professor ?? null,
        turnover_entrou_no_periodo: p.turnover?.entrou_no_periodo ?? null,
        turnover_saida: p.turnover?.saida ?? null,
        api_atualizado_em: agora(),
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (acompanhamentoPayload.length) {
    const { error } = await admin
      .from('professor_acompanhamento')
      .upsert(acompanhamentoPayload, { onConflict: 'professor_id' })
    if (error) throw new Error(error.message)
  }

  // 3 — Upsert em lote do histórico mensal de score. Na rodada leve, quem já
  // existia só regrava o mês atual e o anterior: os outros já estão fechados.
  const historicoPayload = lista.flatMap(p => {
    const professorId = idByKmsId.get(String(p.professor_id))
    if (!professorId || !p.score?.historico_mensal?.length) return []
    const soRecente = leve && jaExistiam.has(String(p.professor_id))
    return p.score.historico_mensal
      .filter(h => !soRecente || h.ano_mes >= corte.anoMes)
      .map(h => ({
      professor_id: professorId,
      ano_mes: h.ano_mes,
      score: h.score,
    }))
  })
  if (historicoPayload.length) {
    const { error } = await admin
      .from('professor_score_historico')
      .upsert(historicoPayload, { onConflict: 'professor_id,ano_mes' })
    if (error) throw new Error(error.message)
  }

  // 4 — Substitui o roster de alunos do lote (delete em lote + insert em lote).
  //
  // ANTES do delete, guarda a data de entrada de cada vínculo. É a única
  // janela em que ela existe: o aluno que saiu já não vem no roster novo,
  // e é justamente dele que o passo 5 precisa saber quando começou — sem
  // isso não há como medir permanência com o professor (ver migration
  // 20260774).
  const professorIdsDoLote = [...idByKmsId.values()]
  const entradaPorVinculo = new Map<string, string>()
  if (professorIdsDoLote.length) {
    const { data: rosterAtual, error: rosterErr } = await admin
      .from('professor_alunos_kms')
      .select('professor_id, aluno_id, data_adicao')
      .in('professor_id', professorIdsDoLote)
    if (rosterErr) throw new Error(rosterErr.message)
    for (const r of rosterAtual ?? []) {
      const d = dataSana(r.data_adicao)
      if (d) entradaPorVinculo.set(`${r.professor_id}:${r.aluno_id}`, d)
    }

    const { error: delErr } = await admin
      .from('professor_alunos_kms')
      .delete()
      .in('professor_id', professorIdsDoLote)
    if (delErr) throw new Error(delErr.message)
  }
  const alunosPorChave = new Map<string, {
    professor_id: string; aluno_id: number
    primeiro_nome: string | null; data_adicao: string | null; status_vinculo: string | null
    status_vinculo_codigo: string | null; status_aluno: string | null
    tipo_vinculo: string | null; data_matricula_escola: string | null
  }>()
  for (const p of lista) {
    const professorId = idByKmsId.get(String(p.professor_id))
    if (!professorId) continue
    for (const a of p.alunos ?? []) {
      // O roster mistura alunos e turmas — turma vem com tipo_vinculo="turma"
      // e aluno_id 0. Fica de fora da carteira (senão infla a contagem).
      if (a.tipo_vinculo === 'turma' || a.aluno_id === 0) continue
      alunosPorChave.set(`${professorId}:${a.aluno_id}`, {
        professor_id: professorId,
        aluno_id: a.aluno_id,
        primeiro_nome: a.primeiro_nome,
        data_adicao: a.data_adicao,
        status_vinculo: a.status_vinculo,
        status_vinculo_codigo: a.status_vinculo_codigo ?? null,
        status_aluno: a.status_aluno ?? null,
        tipo_vinculo: a.tipo_vinculo ?? null,
        data_matricula_escola: a.data_matricula_escola ?? null,
      })
    }
  }
  const alunosPayload = [...alunosPorChave.values()]
  if (alunosPayload.length) {
    const { error } = await admin
      .from('professor_alunos_kms')
      .upsert(alunosPayload, { onConflict: 'professor_id,aluno_id' })
    if (error) throw new Error(error.message)
  }

  // 5 — Ciclo de vida do aluno (saídas). APPEND idempotente por
  // (professor_id, aluno_id, data_saida) — NUNCA delete: é histórico de
  // retenção/turnover. Sem data_saida não dá pra chavear (ignora);
  // turma (aluno_id 0) não entra.
  const cicloPorChave = new Map<string, {
    professor_id: string; aluno_id: number; data_saida: string
    primeiro_nome: string | null; motivo_saida: string | null; saiu_da_escola: boolean | null
    data_matricula_escola: string | null; data_inicio_aulas: string | null
    data_entrada_professor: string | null
  }>()
  for (const p of lista) {
    const professorId = idByKmsId.get(String(p.professor_id))
    if (!professorId) continue
    // Rodada leve: saída mais velha que JANELA_CICLO_DIAS de quem já existia já
    // está gravada (append) e não muda — não regrava.
    const soRecente = leve && jaExistiam.has(String(p.professor_id))
    for (const c of p.ciclo_vida_alunos ?? []) {
      if (!c.data_saida || c.aluno_id === 0) continue
      if (soRecente && String(c.data_saida).slice(0, 10) < corte.ciclo) continue
      // Entrada neste professor: o que a API mandar (hoje, nada) ou o que
      // o roster da rodada anterior guardava. NULL aqui não apaga o valor
      // já gravado — o gatilho da 20260774 protege a coluna.
      const entrada = dataSana(c.data_adicao)
        ?? entradaPorVinculo.get(`${professorId}:${c.aluno_id}`)
        ?? null
      cicloPorChave.set(`${professorId}:${c.aluno_id}:${c.data_saida}`, {
        professor_id: professorId,
        aluno_id: c.aluno_id,
        data_saida: c.data_saida,
        primeiro_nome: c.primeiro_nome,
        motivo_saida: c.motivo_saida,
        saiu_da_escola: c.saiu_da_escola,
        data_matricula_escola: c.data_matricula_escola,
        data_inicio_aulas: c.data_inicio_aulas,
        // Entrada depois da saída = dado sujo do King; melhor não gravar.
        data_entrada_professor: entrada && entrada <= c.data_saida ? entrada : null,
      })
    }
  }
  const cicloPayload = [...cicloPorChave.values()]
  if (cicloPayload.length) {
    const { error } = await admin
      .from('professor_ciclo_vida_alunos')
      .upsert(cicloPayload, { onConflict: 'professor_id,aluno_id,data_saida' })
    if (error) throw new Error(error.message)
  }

  // 6 — Turnover do PROFESSOR (entrada/saída dele, não do aluno). O mesmo
  // bloco já ia pro snapshot professor_acompanhamento, que é sobrescrito a
  // cada rodada; aqui ele vira tabela própria pra sustentar a agregação
  // por período. Ver migration 20260757.
  const turnoverPayload = lista.flatMap(p => {
    const professorId = idByKmsId.get(String(p.professor_id))
    if (!professorId) return []
    const s = p.turnover?.saida ?? null
    return [{
      professor_id: professorId,
      data_entrada: dataSana(p.turnover?.data_entrada ?? p.data_entrada),
      data_saida: dataSana(s?.data),
      motivo_saida: s?.motivo ?? null,
      alunos_realocados: s?.quantidade_alunos_realocados ?? null,
      atualizado_em: agora(),
    }]
  })
  if (turnoverPayload.length) {
    const { error } = await admin
      .from('professor_turnover')
      .upsert(turnoverPayload, { onConflict: 'professor_id' })
    if (error) throw new Error(error.message)
  }

  // 7 — Data de desligamento. Quem virou 'desligado' neste lote ganhou
  // desligado_em = now() do gatilho; troca pelo dia de saída que a King
  // informa. Com os desligados processados só terça e sexta, now() podia cair
  // dias depois da saída real — e no mês errado do turnover.
  const saidas = lista
    .filter(p => mapStatus(p.status) === 'desligado')
    .map(p => ({ kms_id: String(p.professor_id), data_saida: dataSana(p.turnover?.saida?.data) }))
    .filter(s => s.data_saida)
  if (saidas.length) {
    const { error } = await admin.rpc('kms_corrigir_data_desligamento', {
      p_desde: carimbo,
      p_itens: saidas,
    })
    if (error) throw new Error(error.message)
  }

  return { criados, atualizados, linhasCiclo: cicloPayload.length, linhasScore: historicoPayload.length }
}

/** Atualiza a rodada, desde que esta chamada ainda seja a dona dela. false =
 *  outra chamada assumiu (retomada) ou a rodada foi encerrada: parar aqui. */
async function salvar(
  admin: Admin,
  rodadaId: string,
  dono: string,
  campos: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await admin
    .from('kms_sync_rodadas')
    .update({ ...campos, ultima_atividade_em: agora() })
    .eq('id', rodadaId)
    .eq('dono', dono)
    .eq('status', 'rodando')
    .select('id')
  if (error) throw new Error(`kms_sync_rodadas: ${error.message}`)
  return (data?.length ?? 0) > 0
}

/** Passo dos novos: consulta os IDs logo acima do maior kms_id que temos, até
 *  NOVOS_FALHAS_SEGUIDAS vazios seguidos. A API ordena por ID crescente, então
 *  quem acabou de entrar é sempre o último da varredura — aqui ele vem primeiro,
 *  e entra mesmo que o resto da rodada falhe. */
async function passoDosNovos(
  admin: Admin,
  baseUrl: string,
  token: string,
  carimbo: string,
): Promise<{ ids: number[] } & Contagem> {
  const { data: maior, error } = await admin.rpc('kms_maior_kms_id')
  if (error) throw new Error(error.message)

  const achados: ProfessorKms[] = []
  let id = Number(maior ?? 0) + 1
  let falhas = 0
  let consultas = 0
  let comErro = 0
  let ultimoErro = ''
  for (; consultas < NOVOS_MAXIMO_CONSULTAS && falhas < NOVOS_FALHAS_SEGUIDAS; consultas++, id++) {
    let professor: ProfessorKms | null = null
    try {
      professor = await buscarProfessor(baseUrl, token, id)
    } catch (err) {
      // ID inexistente pode vir como erro em vez de lista vazia: conta como vazio.
      comErro++
      ultimoErro = msg(err)
    }
    if (professor) {
      achados.push(professor)
      falhas = 0
    } else {
      falhas++
    }
  }
  if (consultas > 0 && comErro === consultas) {
    throw new Error(`as ${consultas} consultas falharam (${ultimoErro})`)
  }

  // Professor novo vai sempre completo (não tem histórico nosso para poupar).
  const contagem = await processarProfessores(admin, achados, carimbo, false)
  return { ids: achados.map(p => Number(p.professor_id)), ...contagem }
}

/** Ativo/pausado no KTM que não veio nas páginas de ativos desta rodada:
 *  consulta um a um. Quem saiu da King volta como desligado (e o passo 7 de
 *  processarProfessores acerta a data); quem não existe mais fica para a
 *  reconciliação de ausentes. Os mais recentes primeiro — quem sumiu agora. */
async function consultarSumidos(
  admin: Admin,
  baseUrl: string,
  token: string,
  carimbo: string,
  leve: boolean,
): Promise<{ consultados: number; achados: number; desligados: number }> {
  const { data, error } = await admin
    .from('professores')
    .select('kms_id')
    .neq('status', 'desligado')
    .not('visto_na_api_em', 'is', null)
    .lt('visto_na_api_em', carimbo)
    .order('visto_na_api_em', { ascending: false })
    .limit(SUMIDOS_MAXIMO)
  if (error) throw new Error(error.message)

  const ids = (data ?? [])
    .map(r => String(r.kms_id ?? ''))
    .filter(k => /^[0-9]+$/.test(k))
    .map(Number)

  const achados: ProfessorKms[] = []
  let comErro = 0
  let ultimoErro = ''
  for (const id of ids) {
    try {
      const professor = await buscarProfessor(baseUrl, token, id)
      if (professor) achados.push(professor)
    } catch (err) {
      comErro++
      ultimoErro = msg(err)
    }
  }
  if (ids.length > 0 && comErro === ids.length) {
    throw new Error(`as ${ids.length} consultas falharam (${ultimoErro})`)
  }
  await processarProfessores(admin, achados, carimbo, leve)

  return {
    consultados: ids.length,
    achados: achados.length,
    desligados: achados.filter(p => mapStatus(p.status) === 'desligado').length,
  }
}

/** Fecha a rodada de ativos: cobertura → quem sumiu → reconciliação.
 *
 *  Desligar em lote é destrutivo, então a reconciliação só roda com a rodada
 *  COMPROVADAMENTE íntegra. Duas travas, e as duas importam:
 *
 *   1. Chegar aqui já exige zero página com erro — uma página que falha encerra
 *      a rodada como 'falhou' antes do fechamento.
 *   2. Cobertura — a API pode responder 200 com um feed truncado, sem erro
 *      nenhum. Se o que veio não cobre a maior parte de quem temos como
 *      ativo/pausado, a rodada não serve de prova de ausência de ninguém.
 *
 *  A cobertura é quantos dos NOSSOS não-desligados esta rodada de fato carimbou
 *  — exatamente a população em risco de baixa —, medida ANTES da consulta dos
 *  sumidos: um feed pela metade não pode ser remendado com 60 consultas
 *  avulsas e passar por íntegro.
 *
 *  Falhar aqui é só não reconciliar agora: o carimbo continua no banco e a
 *  próxima rodada limpa dá a mesma baixa. Nunca vale o risco do inverso. */
async function fecharRodadaDeAtivos(
  admin: Admin,
  rodada: Rodada,
  dono: string,
  baseUrl: string,
  token: string,
): Promise<void> {
  const carimbo = rodada.iniciada_em

  const { count: naoDesligados, error: e1 } = await admin
    .from('professores')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'desligado')
  if (e1) throw new Error(e1.message)

  const { count: vistosAgora, error: e2 } = await admin
    .from('professores')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'desligado')
    .gte('visto_na_api_em', carimbo)
  if (e2) throw new Error(e2.message)

  const cobertura = naoDesligados && naoDesligados > 0
    ? (vistosAgora ?? 0) / naoDesligados
    : 0

  let reconciliacao: string
  let sumidos = { consultados: 0, achados: 0, desligados: 0 }

  if (rodada.recebidos === 0) {
    reconciliacao = 'pulada — a API não devolveu ninguém'
  } else if (cobertura < COBERTURA_MINIMA) {
    reconciliacao = `pulada — a rodada viu só ${vistosAgora} dos ${naoDesligados} não-desligados (${(cobertura * 100).toFixed(0)}%)`
  } else {
    try {
      sumidos = await consultarSumidos(admin, baseUrl, token, carimbo, !rodada.completa)
    } catch (err) {
      rodada.erros.push({ pagina: null, erro: `consulta dos sumidos: ${msg(err)}` })
    }
    if (!(await salvar(admin, rodada.id, dono, {
      sumidos_consultados: sumidos.consultados,
      sumidos_achados: sumidos.achados,
      sumidos_desligados: sumidos.desligados,
      erros: rodada.erros,
    }))) return

    const { data, error } = await admin.rpc('reconciliar_professores_ausentes', {
      p_graca_dias: GRACA_AUSENCIA_DIAS,
    })
    if (error) {
      console.error('[kms-api-sync] reconciliação falhou:', error.message)
      reconciliacao = `erro — ${error.message}`
      rodada.erros.push({ pagina: null, erro: `reconciliação: ${error.message}` })
    } else {
      const reconciliados = (data ?? []) as { nome: string; kms_id: string; visto_em: string }[]
      reconciliacao = `ok — ${reconciliados.length} desligado(s) por ausência`
      for (const p of reconciliados) {
        console.log(`[kms-api-sync] desligado por ausência: ${p.nome} (kms ${p.kms_id}), visto por último em ${p.visto_em}`)
      }
    }
  }

  await salvar(admin, rodada.id, dono, {
    status: 'concluida',
    terminada_em: agora(),
    cobertura: Number(cobertura.toFixed(4)),
    reconciliacao,
    sumidos_consultados: sumidos.consultados,
    sumidos_achados: sumidos.achados,
    sumidos_desligados: sumidos.desligados,
    erros: rodada.erros,
  })
}

/** Dispara a próxima parte da rodada. A outra chamada responde 202 na hora,
 *  então esta não fica presa esperando o trabalho dela. */
async function chamarProximaParte(rodadaId: string, auth: string): Promise<void> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/kms-api-sync`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rodada_id: rodadaId }),
  })
  await res.body?.cancel()
  if (!res.ok) throw new Error(`próxima parte não aceita (${res.status})`)
}

/** Uma chamada: (passo dos novos) → até N páginas → próxima parte ou fechamento. */
async function executar(
  admin: Admin,
  rodada: Rodada,
  dono: string,
  opcoes: { nova: boolean; auth: string },
): Promise<void> {
  const baseUrl = Deno.env.get('KMS_API_BASE_URL')!
  const token = await login(baseUrl, Deno.env.get('KMS_API_EMAIL')!, Deno.env.get('KMS_API_PASSWORD')!)
  const carimbo = rodada.iniciada_em
  const r: Rodada = { ...rodada, erros: [...(rodada.erros ?? [])] }

  // a — Novos primeiro. Falhar aqui não derruba a rodada: as páginas trazem os
  // novos do mesmo jeito, só que por último.
  if (opcoes.nova && r.tipo === 'ativos') {
    let campos: Record<string, unknown>
    try {
      const novos = await passoDosNovos(admin, baseUrl, token, carimbo)
      r.criados += novos.criados
      r.atualizados += novos.atualizados
      r.linhas_ciclo += novos.linhasCiclo
      r.linhas_score += novos.linhasScore
      campos = {
        novos_kms_ids: novos.ids,
        criados: r.criados,
        atualizados: r.atualizados,
        linhas_ciclo: r.linhas_ciclo,
        linhas_score: r.linhas_score,
      }
    } catch (err) {
      r.erros.push({ pagina: 0, erro: `passo dos novos: ${msg(err)}` })
      campos = { erros: r.erros }
    }
    if (!(await salvar(admin, r.id, dono, campos))) return
  }

  // b — Varredura em partes.
  if (!r.varredura_completa) {
    for (let i = 0; i < PAGINAS_POR_CHAMADA && !r.varredura_completa; i++) {
      let pagina: AcompanhamentoResponse
      let contagem: Contagem
      try {
        pagina = await buscarPagina(baseUrl, token, r.tipo, r.cursor)
        contagem = await processarProfessores(admin, pagina.data, carimbo, !r.completa)
      } catch (err) {
        console.error(`[kms-api-sync] rodada ${r.id}: erro na página ${r.paginas + 1}:`, msg(err))
        r.erros.push({ pagina: r.paginas + 1, erro: msg(err) })
        await salvar(admin, r.id, dono, { erros: r.erros, status: 'falhou', terminada_em: agora() })
        return
      }
      r.paginas++
      r.recebidos += pagina.data.length
      r.criados += contagem.criados
      r.atualizados += contagem.atualizados
      r.linhas_ciclo += contagem.linhasCiclo
      r.linhas_score += contagem.linhasScore
      r.cursor = pagina.proximo_cursor
      r.varredura_completa = !r.cursor
      if (!(await salvar(admin, r.id, dono, {
        cursor: r.cursor,
        varredura_completa: r.varredura_completa,
        paginas: r.paginas,
        recebidos: r.recebidos,
        criados: r.criados,
        atualizados: r.atualizados,
        linhas_ciclo: r.linhas_ciclo,
        linhas_score: r.linhas_score,
      }))) return
    }
    if (!r.varredura_completa) {
      console.log(`[kms-api-sync] rodada ${r.id} (${r.tipo}): ${r.paginas} página(s), segue na próxima parte`)
      await chamarProximaParte(r.id, opcoes.auth)
      return
    }
  }

  // c/d — Fechamento.
  if (r.tipo === 'ativos') {
    await fecharRodadaDeAtivos(admin, r, dono, baseUrl, token)
  } else {
    await salvar(admin, r.id, dono, { status: 'concluida', terminada_em: agora(), erros: r.erros })
  }
  console.log(`[kms-api-sync] rodada ${r.id} (${r.tipo}, ${r.completa ? 'completa' : 'leve'}) concluída: ${r.paginas} página(s), ${r.recebidos} recebidos, ${r.criados} criados, ${r.linhas_ciclo} linhas de ciclo`)
}

/** Rodada de ativos nova: completa às 03:00 de Brasília, quando pedida no corpo,
 *  ou quando não houve rodada completa concluída nas últimas
 *  HORAS_MAX_SEM_COMPLETA horas (a das 03:00 falhou, ou é a primeira). Na dúvida
 *  — erro ao consultar — completa: custa mais, mas não deixa nada para trás. */
async function decidirRodadaCompleta(admin: Admin, pedida: boolean): Promise<boolean> {
  if (pedida) return true
  if (new Date().getUTCHours() === HORA_UTC_RODADA_COMPLETA) return true
  const desde = new Date(Date.now() - HORAS_MAX_SEM_COMPLETA * 3_600_000).toISOString()
  const { data, error } = await admin
    .from('kms_sync_rodadas')
    .select('id')
    .eq('tipo', 'ativos')
    .eq('completa', true)
    .eq('status', 'concluida')
    .gte('iniciada_em', desde)
    .limit(1)
  if (error) return true
  return !data?.length
}

/** Rodada com sinal de vida há menos disto conta como viva para o soNovos. */
const NOVOS_RODADA_VIVA_MIN = 3

/** Só o passo dos novos, fora de rodada (desde 22/10/2026). Professor que
 *  acabou de criar o login na King chegava ao KTM só na rodada de hora em hora,
 *  e até lá o portal não achava o cadastro: o código de acesso da trilha não
 *  saía (parecer do RH). Não grava em kms_sync_rodadas, então vigia, aviso da
 *  tela Hoje e rodada de ativos não mudam. Com uma rodada de ativos viva, pula:
 *  ela começa pelos novos, e a próxima batida pega quem entrou depois. */
async function soNovos(admin: Admin): Promise<Response> {
  const vivaDesde = new Date(Date.now() - NOVOS_RODADA_VIVA_MIN * 60_000).toISOString()
  const { data: viva, error } = await admin
    .from('kms_sync_rodadas')
    .select('id')
    .eq('tipo', 'ativos')
    .eq('status', 'rodando')
    .gte('ultima_atividade_em', vivaDesde)
    .limit(1)
  if (error) return json({ error: error.message }, 500)
  if (viva?.length) return json({ ignorada: true, motivo: 'rodada de ativos em andamento' }, 200)

  // Login + 5 consultas passam dos 5 s em que o pg_net desiste da resposta
  // (medido em 22/10: 5,2 s): o trabalho segue em segundo plano, como a rodada.
  EdgeRuntime.waitUntil((async () => {
    try {
      const baseUrl = Deno.env.get('KMS_API_BASE_URL')!
      const token = await login(baseUrl, Deno.env.get('KMS_API_EMAIL')!, Deno.env.get('KMS_API_PASSWORD')!)
      const novos = await passoDosNovos(admin, baseUrl, token, agora())
      // Log só quando alguém chega: são 264 chamadas por dia na cota de logs.
      if (novos.ids.length) console.log(`[kms-api-sync] novos: ${novos.ids.join(', ')} (${novos.criados} criados)`)
    } catch (err) {
      console.error('[kms-api-sync] novos:', msg(err))
    }
  })())
  return json({ novos: 'em andamento' }, 202)
}

/** Erro fora do previsto (login, banco, próxima parte): anota na rodada e deixa
 *  ela 'rodando' sem sinal de vida — o vigia retoma em até ~13 min. */
async function registrarFalhaInesperada(admin: Admin, rodadaId: string, dono: string, err: unknown): Promise<void> {
  const m = msg(err)
  console.error(`[kms-api-sync] rodada ${rodadaId}: falha inesperada:`, m)
  try {
    const { data } = await admin.from('kms_sync_rodadas').select('erros').eq('id', rodadaId).single()
    const erros = [...((data?.erros as ErroRodada[] | null) ?? []), { pagina: null, erro: m }]
    await admin.from('kms_sync_rodadas').update({ erros }).eq('id', rodadaId).eq('dono', dono)
  } catch {
    // O log acima já tem o erro; o vigia retoma do mesmo jeito.
  }
}

serve(async (req) => {
  const auth       = req.headers.get('Authorization') ?? ''
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return new Response('Não autorizado.', { status: 401 })
  }

  let corpo: { tipo?: string; rodada_id?: string; retomar?: string; completa?: boolean } = {}
  try {
    corpo = await req.json()
  } catch {
    // Corpo vazio = nova rodada de ativos.
  }

  const admin = novoAdmin()

  // Antes de tudo que mexe em rodada: o "novos" não interrompe nem abre nenhuma.
  if (corpo.tipo === 'novos') return await soNovos(admin)

  const dono = crypto.randomUUID()
  const retomada = Boolean(corpo.retomar)
  const existente = corpo.retomar ?? corpo.rodada_id
  let rodada: Rodada
  let nova = false

  if (existente) {
    const { data: atual, error } = await admin
      .from('kms_sync_rodadas')
      .select('*')
      .eq('id', existente)
      .maybeSingle()
    if (error) return json({ error: error.message }, 500)
    if (!atual || atual.status !== 'rodando') {
      return json({ ignorada: true, motivo: 'a rodada não está mais rodando' }, 200)
    }
    // Assume a rodada: a partir daqui, uma chamada antiga ainda viva perde a
    // vez na próxima página que tentar salvar.
    const { data: tomada, error: tomErr } = await admin
      .from('kms_sync_rodadas')
      .update({
        dono,
        chamadas: atual.chamadas + 1,
        retomadas: atual.retomadas + (retomada ? 1 : 0),
        ultima_atividade_em: agora(),
      })
      .eq('id', existente)
      .eq('status', 'rodando')
      .select('*')
      .maybeSingle()
    if (tomErr) return json({ error: tomErr.message }, 500)
    if (!tomada) return json({ ignorada: true, motivo: 'a rodada foi encerrada agora' }, 200)
    rodada = tomada as Rodada
  } else {
    const tipo: TipoRodada = corpo.tipo === 'desligados' ? 'desligados' : 'ativos'
    // Rodada anterior do mesmo tipo ainda aberta perde a vez: a cadeia dela
    // para na próxima página.
    const { error: intErr } = await admin
      .from('kms_sync_rodadas')
      .update({ status: 'interrompida', terminada_em: agora() })
      .eq('tipo', tipo)
      .eq('status', 'rodando')
    if (intErr) return json({ error: intErr.message }, 500)

    // Desligados só rodam terça e sexta: sempre completa.
    const completa = tipo === 'desligados' || await decidirRodadaCompleta(admin, corpo.completa === true)

    const { data: criada, error } = await admin
      .from('kms_sync_rodadas')
      .insert({ tipo, completa, dono, chamadas: 1 })
      .select('*')
      .single()
    if (error) return json({ error: error.message }, 500)
    rodada = criada as Rodada
    nova = true
  }

  EdgeRuntime.waitUntil(
    executar(admin, rodada, dono, { nova, auth })
      .catch(err => registrarFalhaInesperada(admin, rodada.id, dono, err)),
  )

  return json({ rodada_id: rodada.id, tipo: rodada.tipo, completa: rodada.completa, parte: rodada.chamadas, retomada }, 202)
})
