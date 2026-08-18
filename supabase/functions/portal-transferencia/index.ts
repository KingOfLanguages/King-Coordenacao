// ─────────────────────────────────────────────────────────────────────────────
// Portal público de TRANSFERÊNCIA DE ALUNO — o professor pede a transferência
// de um aluno da carteira dele sem login, pelo link enviado pela coordenação
// (/transferencia).
//
// A identificação é a MESMA do portal de pausa e do de agendamento: e-mail
// exato → nome completo exato → desempate por mês/ano de início → contato da
// coordenação. A lógica está duplicada aqui de propósito: o projeto não usa
// pasta `_shared` entre edge functions (portal-pausa e teacher-lookup também
// duplicam), e cada function é publicada isolada.
//
// A diferença em relação à pausa: o lookup devolve TAMBÉM a carteira de alunos
// do professor. É isso que faz o pedido nascer com `aluno_id` em vez de um nome
// digitado — e é o `aluno_id` que liga o pedido ao histórico do aluno
// (professor_ciclo_vida_alunos) no dossiê que o Suporte ao Aluno lê depois.
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/portal-transferencia
//
//   { "acao": "lookup", "email"?, "nome"?, "mesInicio"?, "anoInicio"?, "professorId"? }
//     → { professor: { id, nome } | null, ambiguo, alunos: [...], jaPausado }
//
//   { "acao": "solicitar", "professorId", "alunoNome" (COMPLETO), "motivo",
//     "detalhe", "dataUltimaAula", "jaConversou"?, "aceitaManter"? }
//     → { ok: true, transferenciaId }  |  { error: "…" } com 400/409
//
// Não existe mais urgência declarada: ela é derivada de `dataUltimaAula` contra
// o prazo de 7 dias úteis. Ver 20260761_transferencia_prazo.sql.
//
// Escreve em `transferencias_aluno` com a service_role (a tabela não tem policy
// de INSERT — toda escrita é por função DEFINER ou por aqui).
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NOME_MIN_CHARS    = 3
const DETALHE_MIN_CHARS = 15
const DETALHE_MAX_CHARS = 2000
const EMAILRE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DATARE  = /^\d{4}-\d{2}-\d{2}$/

/** Antecedência mínima: o professor pode pedir até com 1 dia. Menos que isso
 *  (hoje ou ontem) não é pedido de transferência, é fato consumado. */
const DIAS_ANTECEDENCIA_MIN = 1
/** Teto de agendamento — evita erro de digitação virar pedido para 2031. */
const DIAS_FUTURO_MAX = 180

/** Categorias que o formulário oferece. Espelha MOTIVO_TRANSFERENCIA no front —
 *  validar aqui impede que um cliente adulterado grave categoria inventada, o
 *  que estragaria os agrupamentos da fila. */
const MOTIVOS = new Set([
  'incompatibilidade_horario',
  'nao_adaptacao_metodo',
  'perfil_nivel',
  'comportamento_aluno',
  'faltas_aluno',
  'pedido_do_aluno',
  'sobrecarga',
  'motivo_pessoal',
  'outro',
])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Data ISO (YYYY-MM-DD) → dias de calendário até hoje. Negativo = passado. */
function diasAte(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo  = Date.UTC(a, m - 1, d)
  const agora = new Date()
  const hoje  = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
  return Math.round((alvo - hoje) / 86400000)
}

/** Remove o sufixo de "início/data" que a plataforma às vezes gruda no nome do
 *  professor por uma falha no procedimento de cadastro da escola — ex.:
 *  "Fulano de Tal - inicio 18/09". Sem tirar isso, o casamento por nome exato
 *  barraria o professor (que digita só o nome). Ver ktm-nome-sufixo-inicio. */
function semSufixoInicio(nome: string): string {
  return nome
    .replace(/[\s\-–—(|,:;]+in[íi]cio.*$/i, '')
    .replace(/[\s\-–—(|,:;]+\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\)?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Match EXATO do nome completo — só caixa, acentuação e o sufixo de
 *  "início/data" são ignorados. Nada de nome parcial. */
function nomeExato(informado: string, real: string): boolean {
  const a = norm(semSufixoInicio(informado))
  return a.length > 0 && a === norm(semSufixoInicio(real))
}

/** Mês/ano de início dentro de ±1 mês de tolerância (memória imprecisa é normal). */
function dataInicioBate(dataInicio: string | null, mes: number, ano: number): boolean {
  if (!dataInicio) return false
  const d = new Date(dataInicio)
  const diffMeses = (d.getUTCFullYear() - ano) * 12 + (d.getUTCMonth() - (mes - 1))
  return Math.abs(diffMeses) <= 1
}

type ProfRow = { id: string; nome: string; status: string; data_inicio: string | null }

type AlunoPortal = {
  alunoId: number
  nome: string
  dataAdicao: string | null
  status: string | null
  /** Já existe pedido aberto pra este aluno — o front desabilita a opção. */
  pedidoAberto: boolean
}

function respostaVazia(ambiguo: boolean) {
  return { professor: null, ambiguo, alunos: [], jaPausado: false }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
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

  const acao = typeof body.acao === 'string' ? body.acao : 'lookup'

  // ══ Ação: solicitar ════════════════════════════════════════════════════════
  if (acao === 'solicitar') {
    const professorId = typeof body.professorId === 'string' ? body.professorId.trim() : ''
    const alunoNome   = typeof body.alunoNome   === 'string' ? body.alunoNome.trim()   : ''
    const motivo      = typeof body.motivo      === 'string' ? body.motivo.trim()      : ''
    const detalhe     = typeof body.detalhe     === 'string' ? body.detalhe.trim()     : ''
    const dataUltimaAula = typeof body.dataUltimaAula === 'string' ? body.dataUltimaAula.trim() : ''
    const jaConversou  = typeof body.jaConversou  === 'boolean' ? body.jaConversou  : null
    const aceitaManter = typeof body.aceitaManter === 'boolean' ? body.aceitaManter : null

    if (!professorId) return json({ error: 'Identificação perdida. Recomece o preenchimento.' }, 400)
    if (!alunoNome)   return json({ error: 'Escreva o nome do aluno que você quer transferir.' }, 400)
    // Nome COMPLETO é o ponto da mudança: a API do King só nos manda o
    // primeiro nome, então é o professor quem fecha essa lacuna. Sem sobrenome
    // o pedido não identifica ninguém melhor do que o cadastro já identificava.
    const partesNome = alunoNome.split(/\s+/).filter(t => t.length >= 2)
    if (partesNome.length < 2) {
      return json({ error: 'Escreva o nome COMPLETO do aluno (nome e sobrenome).' }, 400)
    }
    if (alunoNome.length > 120) {
      return json({ error: 'Esse nome ficou longo demais. Confira o que foi digitado.' }, 400)
    }
    if (!MOTIVOS.has(motivo)) {
      return json({ error: 'Escolha o motivo da transferência.' }, 400)
    }
    if (detalhe.length < DETALHE_MIN_CHARS) {
      return json({ error: 'Conte com um pouco mais de detalhe o que está acontecendo — é o que orienta quem vai atender.' }, 400)
    }
    if (detalhe.length > DETALHE_MAX_CHARS) {
      return json({ error: 'O relato ficou longo demais. Resuma um pouco.' }, 400)
    }
    if (!DATARE.test(dataUltimaAula)) {
      return json({ error: 'Informe a data da última aula do aluno.' }, 400)
    }
    const diasAteUltimaAula = diasAte(dataUltimaAula)
    if (diasAteUltimaAula < DIAS_ANTECEDENCIA_MIN) {
      return json({
        error: 'A última aula precisa ser a partir de amanhã. Se a aula já aconteceu, fale com o suporte.',
      }, 400)
    }
    if (diasAteUltimaAula > DIAS_FUTURO_MAX) {
      return json({ error: 'Essa data está muito distante. Confira o dia informado.' }, 400)
    }

    const { data: prof } = await admin
      .from('professores')
      .select('id, nome, status')
      .eq('id', professorId)
      .maybeSingle()

    if (!prof)                   return json({ error: 'Cadastro não encontrado.' }, 404)
    if (prof.status !== 'ativo') return json({ error: 'Seu cadastro não está ativo. Fale com a coordenação.' }, 409)

    // O professor digita o nome; o vínculo com o cadastro nós deduzimos aqui.
    //
    // Por que continuar tentando achar o aluno_id: ele é o que sustenta o
    // dossiê do Suporte ao Aluno (vínculo, saídas anteriores, outros pedidos)
    // e o snapshot congelado no INSERT. Se o pedido nascesse só com texto, a
    // fila perderia tudo isso. Como a API só guarda o PRIMEIRO nome, casamos
    // pelo primeiro nome digitado — e só quando ele aponta para UM aluno da
    // agenda. Dois "Ana" na carteira = ambíguo: fica sem vínculo e o suporte
    // resolve na mão, com o nome completo em tela. Chutar seria pior.
    let alunoId: number | null = null
    {
      const primeiroDigitado = norm(partesNome[0])
      const { data: roster } = await admin
        .from('professor_alunos_kms')
        .select('aluno_id, primeiro_nome')
        .eq('professor_id', professorId)
        .eq('tipo_vinculo', 'aluno')

      const candidatos = ((roster ?? []) as { aluno_id: number; primeiro_nome: string | null }[])
        .filter(a => a.primeiro_nome && norm(a.primeiro_nome) === primeiroDigitado)

      if (candidatos.length === 1) alunoId = candidatos[0].aluno_id
    }

    if (alunoId !== null) {
      const { data: aberto } = await admin
        .from('transferencias_aluno')
        .select('id')
        .eq('professor_id', professorId)
        .eq('aluno_id', alunoId)
        .in('status', ['pendente', 'em_atendimento'])
        .limit(1)
        .maybeSingle()

      if (aberto) {
        return json({ error: 'Você já tem um pedido em andamento para esse aluno. O suporte vai te retornar.' }, 409)
      }
    }

    const { data: criada, error } = await admin
      .from('transferencias_aluno')
      .insert({
        professor_id:   professorId,
        aluno_id:       alunoId,
        aluno_nome:     alunoNome,
        // Passou a significar "conseguimos casar com o cadastro" — ninguém
        // escolhe de lista nenhuma desde que o nome completo passou a ser
        // digitado. False = o suporte precisa localizar o aluno à mão.
        aluno_da_lista: alunoId !== null,
        motivo,
        detalhe,
        data_ultima_aula: dataUltimaAula,
        ja_conversou:   jaConversou,
        aceita_manter:  aceitaManter,
        status:         'pendente',
        origem:         'portal',
      })
      .select('id')
      .single()

    if (error) {
      // 23505 = corrida com outra aba batendo no índice único parcial.
      if (error.code === '23505') {
        return json({ error: 'Você já tem um pedido em andamento para esse aluno.' }, 409)
      }
      return json({ error: 'Não foi possível registrar agora. Tente novamente em instantes.' }, 500)
    }

    return json({ ok: true, transferenciaId: criada.id })
  }

  // ══ Ação: lookup ═══════════════════════════════════════════════════════════
  const nome  = typeof body.nome  === 'string' ? body.nome.trim()  : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const professorIdInput = typeof body.professorId === 'string' ? body.professorId.trim() : ''
  const emailValido = EMAILRE.test(email.toLowerCase())
  const temNome     = nome.length >= NOME_MIN_CHARS

  if (!temNome && !emailValido && !professorIdInput) {
    return json({ error: `Informe seu e-mail ou ao menos ${NOME_MIN_CHARS} caracteres do seu nome.` }, 400)
  }

  const mesInicio = typeof body.mesInicio === 'number' ? body.mesInicio : null
  const anoInicio = typeof body.anoInicio === 'number' ? body.anoInicio : null

  let professor: ProfRow | null = null

  // ── 1. Id direto (2º passo do fluxo: cadastro do e-mail depois de achar pelo nome)
  if (professorIdInput) {
    const { data: p } = await admin
      .from('professores')
      .select('id, nome, status, data_inicio')
      .eq('id', professorIdInput)
      .maybeSingle()
    if (p && p.status === 'ativo') {
      professor = p as ProfRow
      if (emailValido) {
        const { data: jaTem } = await admin
          .from('professor_emails')
          .select('id')
          .ilike('email', email)
          .limit(1)
          .maybeSingle()
        if (!jaTem) {
          await admin.from('professor_emails').insert({ professor_id: p.id, email, origem: 'portal' })
        }
      }
    }
  }

  // ── 2. E-mail exato
  if (!professor && emailValido) {
    const { data: emailRow } = await admin
      .from('professor_emails')
      .select('professor_id')
      .ilike('email', email)
      .maybeSingle()
    if (emailRow) {
      const { data: p } = await admin
        .from('professores')
        .select('id, nome, status, data_inicio')
        .eq('id', emailRow.professor_id)
        .maybeSingle()
      if (p && p.status === 'ativo') professor = p as ProfRow
    }
  }

  // ── 3. Nome completo exato (+ desempate por mês/ano)
  if (!professor) {
    if (!temNome) return json(respostaVazia(false))

    const { data: ativos } = await admin
      .from('professores')
      .select('id, nome, status, data_inicio')
      .eq('status', 'ativo')

    let candidatos = ((ativos ?? []) as ProfRow[]).filter(p => nomeExato(nome, p.nome))

    if (candidatos.length > 1 && mesInicio != null && anoInicio != null) {
      candidatos = candidatos.filter(p => dataInicioBate(p.data_inicio, mesInicio, anoInicio))
    }

    if (candidatos.length === 0) return json(respostaVazia(false))
    if (candidatos.length > 1)   return json(respostaVazia(true))

    professor = candidatos[0]
  }

  if (!professor) return json(respostaVazia(false))

  // ── Carteira do professor + quais alunos já têm pedido aberto ──────────────
  // Só vínculos de aluno individual: `tipo_vinculo = 'turma'` (aluno_id 0) não é
  // transferível e não deve aparecer na lista.
  const { data: roster } = await admin
    .from('professor_alunos_kms')
    .select('aluno_id, primeiro_nome, data_adicao, status_aluno, tipo_vinculo')
    .eq('professor_id', professor.id)
    .order('primeiro_nome')

  const { data: abertos } = await admin
    .from('transferencias_aluno')
    .select('aluno_id')
    .eq('professor_id', professor.id)
    .in('status', ['pendente', 'em_atendimento'])

  const comPedido = new Set(
    ((abertos ?? []) as { aluno_id: number | null }[])
      .map(a => a.aluno_id)
      .filter((a): a is number => a !== null),
  )

  const alunos: AlunoPortal[] = ((roster ?? []) as {
    aluno_id: number
    primeiro_nome: string | null
    data_adicao: string | null
    status_aluno: string | null
    tipo_vinculo: string | null
  }[])
    .filter(a => a.tipo_vinculo !== 'turma' && a.aluno_id > 0)
    .map(a => ({
      alunoId:      a.aluno_id,
      nome:         a.primeiro_nome ?? `Aluno #${a.aluno_id}`,
      dataAdicao:   a.data_adicao,
      status:       a.status_aluno,
      pedidoAberto: comPedido.has(a.aluno_id),
    }))

  return json({
    professor: { id: professor.id, nome: semSufixoInicio(professor.nome) },
    ambiguo:   false,
    alunos,
    jaPausado: professor.status === 'pausa',
  })
})
