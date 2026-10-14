// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: bitrix-chamado
//
// Abre um chamado (tarefa do Bitrix24) para a equipe de suporte ao aluno a
// partir de um incidente de prioridade Média, Alta ou Urgente. Pedido do João
// em 2026-10-14:
//   - recebe qualquer pessoa do suporte ao aluno (os times da Flávia e da
//     Sayuri); a líder do time de quem recebe vai sempre como observadora;
//   - quem abre entra obrigatoriamente como observador;
//   - a tarefa é criada pelo usuário dono do webhook (João), sempre com a
//     legenda "Aberto no Nexus" (na descrição e como etiqueta).
//
// Contrato (POST, usuário logado — verify_jwt padrão):
//   { acao: 'opcoes' }
//       → { equipe, coordenacao, criador, eu, todos? }  (todos só quando `eu` é null)
//   { acao: 'vincular', bitrixUserId }
//       → { eu }   grava profiles.bitrix_user_id
//   { acao: 'abrir', incidenteId, responsavelId, observadores: number[] }
//       → { taskId, url, anexos, falhasAnexo }
//
// Quem é do suporte vem do próprio Bitrix, a cada chamada: usuários ativos dos
// departamentos de atendimento (DEPTOS_SUPORTE) com cargo de atendimento ou
// suporte. Contratação nova no Bitrix aparece sozinha aqui.
//
// Segurança: o webhook do Bitrix (BITRIX_WEBHOOK_URL) só existe aqui — o
// repositório é público e o link age como o João no Bitrix. O texto da tarefa
// sai do banco, não do navegador.
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Departamentos do suporte ao aluno no Bitrix (23 = time da Flávia, 25 = da Sayuri). */
const DEPTOS_SUPORTE = [23, 25]
/** Coordenação de professores — entra na lista de observadores. */
const DEPTO_COORDENACAO = 13
/** Dentro dos departamentos acima há gente de vendas e financeiro: fica só quem atende. */
const CARGO_SUPORTE = /atendimento|suporte/i
const CARGO_LIDER = /l[ií]der/i

const PRIORIDADES_COM_CHAMADO = ['Média', 'Alta', 'Urgente']
const LEGENDA = 'Aberto no Nexus'
const MAX_ANEXOS = 5

const APP_URL = Deno.env.get('APP_URL') ?? 'https://projeto-king-coord.vercel.app'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ─── Bitrix ──────────────────────────────────────────────────────────────────

class ErroBitrix extends Error {
  constructor(public codigo: string, descricao: string) { super(descricao || codigo) }
}

function baseBitrix(): string {
  const url = Deno.env.get('BITRIX_WEBHOOK_URL')
  if (!url) throw new ErroBitrix('sem_webhook', 'BITRIX_WEBHOOK_URL não configurado.')
  return url.replace(/\/+$/, '')
}

/** Dono do webhook (o número em /rest/<id>/): as tarefas saem criadas por ele. */
function criadorId(): number {
  return Number(baseBitrix().match(/\/rest\/(\d+)\//)?.[1] ?? 0)
}

async function bitrix(metodo: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(`${baseBitrix()}/${metodo}.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const j = await r.json().catch(() => null) as Record<string, unknown> | null
  if (!j || j.error) {
    throw new ErroBitrix(String(j?.error ?? `HTTP ${r.status}`), String(j?.error_description ?? ''))
  }
  return j
}

function mensagemDoErro(e: unknown): string {
  if (e instanceof ErroBitrix) {
    if (e.codigo === 'insufficient_scope') {
      return 'O webhook do Bitrix ainda não tem a permissão de Tarefas (task). Ela precisa ser marcada no Bitrix.'
    }
    if (e.codigo === 'sem_webhook') return 'A integração com o Bitrix não está configurada.'
    return `O Bitrix recusou: ${e.message}`
  }
  return e instanceof Error ? e.message : 'Erro inesperado.'
}

interface Pessoa { id: number; nome: string; cargo: string; deptos: number[]; email: string }

const limpar = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()

async function usuariosAtivos(): Promise<Pessoa[]> {
  const todos: Pessoa[] = []
  let start: number | undefined = 0
  while (start !== undefined) {
    const j = await bitrix('user.get', { FILTER: { ACTIVE: true, USER_TYPE: 'employee' }, start })
    for (const u of (j.result as Record<string, unknown>[]) ?? []) {
      todos.push({
        id: Number(u.ID),
        nome: limpar(`${u.NAME ?? ''} ${u.LAST_NAME ?? ''}`),
        cargo: limpar(u.WORK_POSITION),
        deptos: ((u.UF_DEPARTMENT as unknown[]) ?? []).map(Number),
        email: limpar(u.EMAIL).toLowerCase(),
      })
    }
    start = typeof j.next === 'number' ? j.next : undefined
  }
  return todos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function montarEquipe(todos: Pessoa[]) {
  const doSuporte = (p: Pessoa) => p.deptos.some(d => DEPTOS_SUPORTE.includes(d)) && CARGO_SUPORTE.test(p.cargo)
  const suporte = todos.filter(doSuporte)
  const lideres = suporte.filter(p => CARGO_LIDER.test(p.cargo))
  /** A líder do time de `p` (mesmo departamento de suporte), menos ela mesma. */
  const lideresDe = (p: Pessoa) => lideres
    .filter(l => l.id !== p.id && l.deptos.some(d => DEPTOS_SUPORTE.includes(d) && p.deptos.includes(d)))
    .map(l => l.id)
  const equipe = suporte.map(p => ({
    id: p.id, nome: p.nome, cargo: p.cargo, lider: CARGO_LIDER.test(p.cargo), lideres: lideresDe(p),
  }))
  const coordenacao = todos
    .filter(p => p.deptos.includes(DEPTO_COORDENACAO))
    .map(p => ({ id: p.id, nome: p.nome, cargo: p.cargo }))
  return { equipe, coordenacao }
}

// ─── Texto da tarefa ─────────────────────────────────────────────────────────

function normalizarPrioridade(v: string | null): string {
  if (v === 'Crítico' || v === 'Crítica') return 'Urgente'
  return ['Urgente', 'Alta', 'Média', 'Baixa'].includes(v ?? '') ? v! : 'Média'
}

const fmtData = (iso: string, comHora = false) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
})

/** Colchete vira parêntese: o texto do incidente não pode abrir tag BBCode. */
const semBB = (s: string) => s.replace(/\[/g, '(').replace(/\]/g, ')')

interface IncidenteRow {
  id: string
  teacher_name: string
  aluno_nome: string | null
  aluno_id: number | null
  ocorrido_em: string | null
  passos: string | null
  problem_type: string
  urgency: string | null
  urgencia_justificativa: string | null
  description: string
  prazo_resolucao: string | null
  resolved: boolean
  image_urls: string[] | null
  professor: { kms_id: string | null } | { kms_id: string | null }[] | null
}

function montarDescricao(inc: IncidenteRow, nivel: string, abridor: string): string {
  const prof = Array.isArray(inc.professor) ? inc.professor[0] : inc.professor
  const l: string[] = [
    `[B]${LEGENDA}[/B] por ${semBB(abridor)} em ${fmtData(new Date().toISOString(), true)}`,
    `[URL=${APP_URL}/incidentes?incidente=${inc.id}]Ver o incidente no Nexus[/URL]`,
    '',
    `[B]Prioridade:[/B] ${nivel}${inc.prazo_resolucao ? ` · resolver até ${fmtData(inc.prazo_resolucao)}` : ''}`,
    `[B]Categoria:[/B] ${semBB(inc.problem_type)}`,
    `[B]Professor:[/B] ${semBB(inc.teacher_name)}${prof?.kms_id ? ` (ID no King: ${prof.kms_id})` : ''}`,
  ]
  if (inc.aluno_nome) l.push(`[B]Aluno:[/B] ${semBB(inc.aluno_nome)}${inc.aluno_id ? ` (ID no King: ${inc.aluno_id})` : ''}`)
  if (inc.ocorrido_em) l.push(`[B]Quando aconteceu:[/B] ${fmtData(inc.ocorrido_em, true)}`)
  if (nivel === 'Urgente' && inc.urgencia_justificativa) l.push(`[B]Por que é urgente:[/B] ${semBB(inc.urgencia_justificativa)}`)
  l.push('', '[B]Qual é o problema[/B]', semBB(inc.description || '(sem descrição)'))
  if (inc.passos?.trim()) l.push('', '[B]Como aconteceu[/B]', semBB(inc.passos))
  const imgs = (inc.image_urls ?? []).slice(0, MAX_ANEXOS)
  if (imgs.length) {
    l.push('', '[B]Imagens[/B] (também anexadas à tarefa)')
    imgs.forEach((u, i) => l.push(`[URL=${u}]Imagem ${i + 1}[/URL]`))
  }
  return l.join('\n')
}

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const url        = Deno.env.get('SUPABASE_URL')!
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // ── 1. Quem chama ──────────────────────────────────────────────────────────
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Não autenticado.' }, 401)

  const admin = createClient(url, serviceKey)
  const { data: perfil } = await admin
    .from('profiles')
    .select('id, nome, role, ativo, is_admin, email, google_email, bitrix_user_id')
    .eq('id', user.id)
    .maybeSingle()
  // Mesmo grupo de canEditIncidente no front.
  const pode = !!perfil?.ativo && (perfil.is_admin === true
    || ['admin', 'coordenacao', 'suporte', 'suporte_aluno'].includes(perfil.role))
  if (!perfil || !pode) return json({ error: 'Sem permissão para abrir chamado no Bitrix.' }, 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'JSON inválido.' }, 400) }

  try {
    const todos = await usuariosAtivos()
    const porId = new Map(todos.map(p => [p.id, p]))

    /** Quem é a pessoa logada no Bitrix: o que já foi gravado ou, na primeira
     *  vez, o mesmo e-mail (o do login ou o do Google). */
    async function resolverEu(): Promise<Pessoa | null> {
      if (perfil!.bitrix_user_id && porId.has(perfil!.bitrix_user_id)) return porId.get(perfil!.bitrix_user_id)!
      const emails = [perfil!.email, perfil!.google_email].filter(Boolean).map(e => String(e).toLowerCase())
      const achado = todos.find(p => p.email && emails.includes(p.email)) ?? null
      if (achado) await admin.from('profiles').update({ bitrix_user_id: achado.id }).eq('id', perfil!.id)
      return achado
    }

    const acao = body.acao

    // ── opcoes ───────────────────────────────────────────────────────────────
    if (acao === 'opcoes') {
      const eu = await resolverEu()
      const criador = porId.get(criadorId())
      return json({
        ...montarEquipe(todos),
        criador: criador ? { id: criador.id, nome: criador.nome } : null,
        eu: eu ? { id: eu.id, nome: eu.nome } : null,
        ...(eu ? {} : { todos: todos.map(p => ({ id: p.id, nome: p.nome, cargo: p.cargo })) }),
      })
    }

    // ── vincular ─────────────────────────────────────────────────────────────
    if (acao === 'vincular') {
      const alvo = porId.get(Number(body.bitrixUserId))
      if (!alvo) return json({ error: 'Usuário do Bitrix não encontrado.' }, 422)
      const { error } = await admin.from('profiles').update({ bitrix_user_id: alvo.id }).eq('id', perfil.id)
      if (error) return json({ error: error.message }, 500)
      return json({ eu: { id: alvo.id, nome: alvo.nome } })
    }

    // ── abrir ────────────────────────────────────────────────────────────────
    if (acao !== 'abrir') return json({ error: 'Ação desconhecida.' }, 400)

    const incidenteId = typeof body.incidenteId === 'string' ? body.incidenteId : ''
    const { data: inc } = await admin
      .from('nexus_incidents')
      .select('id, teacher_name, aluno_nome, aluno_id, ocorrido_em, passos, problem_type, urgency, urgencia_justificativa, description, prazo_resolucao, resolved, image_urls, professor:professores!professor_id (kms_id)')
      .eq('id', incidenteId)
      .maybeSingle<IncidenteRow>()
    if (!inc) return json({ error: 'Incidente não encontrado.' }, 404)

    const nivel = normalizarPrioridade(inc.urgency)
    if (!PRIORIDADES_COM_CHAMADO.includes(nivel)) {
      return json({ error: 'Chamado no Bitrix é só para prioridade Média, Alta ou Urgente.' }, 422)
    }
    if (inc.resolved) return json({ error: 'Este incidente já foi concluído.' }, 422)

    const eu = await resolverEu()
    if (!eu) return json({ error: 'Diga quem você é no Bitrix antes de abrir o chamado.', precisaVincular: true }, 409)

    const { equipe, coordenacao } = montarEquipe(todos)
    const resp = equipe.find(p => p.id === Number(body.responsavelId))
    if (!resp) return json({ error: 'Escolha quem vai receber, entre a equipe de suporte ao aluno.' }, 422)

    // Observadores: só gente das listas oferecidas; a líder do time e quem
    // abriu entram sempre. Quem recebe não precisa observar.
    const permitidos = new Set([...equipe.map(p => p.id), ...coordenacao.map(p => p.id), eu.id])
    const escolhidos = (Array.isArray(body.observadores) ? body.observadores : []).map(Number).filter(id => permitidos.has(id))
    const auditores = [...new Set([...escolhidos, ...resp.lideres, eu.id])].filter(id => id !== resp.id)
    const observadores = auditores.map(id => ({ id, nome: porId.get(id)?.nome ?? String(id) }))

    // Trava: a linha nasce antes da tarefa. Outro clique ao mesmo tempo bate na chave.
    const { error: travaErr } = await admin.from('incidente_chamados_bitrix').insert({
      incidente_id: inc.id,
      responsavel_bitrix_id: resp.id,
      responsavel_nome: resp.nome,
      observadores,
      aberto_por: perfil.id,
    })
    if (travaErr) {
      if (travaErr.code === '23505') return json({ error: 'Este incidente já tem um chamado no Bitrix.' }, 409)
      return json({ error: travaErr.message }, 500)
    }

    let taskId: number
    try {
      const r = await bitrix('tasks.task.add', {
        fields: {
          TITLE: `Incidente · ${inc.teacher_name} · ${inc.problem_type}`.slice(0, 250),
          DESCRIPTION: montarDescricao(inc, nivel, perfil.nome ?? eu.nome),
          RESPONSIBLE_ID: resp.id,
          AUDITORS: auditores,
          PRIORITY: nivel === 'Média' ? 1 : 2,
          ...(inc.prazo_resolucao ? { DEADLINE: new Date(inc.prazo_resolucao).toISOString() } : {}),
          TAGS: [LEGENDA],
        },
      })
      taskId = Number(((r.result as Record<string, unknown>)?.task as Record<string, unknown>)?.id)
      if (!taskId) throw new ErroBitrix('sem_id', 'o Bitrix não devolveu o número da tarefa.')
    } catch (e) {
      await admin.from('incidente_chamados_bitrix').delete().eq('incidente_id', inc.id).is('bitrix_task_id', null)
      return json({ error: mensagemDoErro(e) }, 502)
    }

    const link = `${new URL(baseBitrix()).origin}/company/personal/user/${criadorId()}/tasks/task/view/${taskId}/`
    await admin.from('incidente_chamados_bitrix').update({ bitrix_task_id: taskId, bitrix_url: link }).eq('incidente_id', inc.id)

    // Imagens como anexo da tarefa. Falhar aqui não desfaz o chamado: os links
    // já estão na descrição.
    let anexos = 0, falhasAnexo = 0
    for (const [i, img] of (inc.image_urls ?? []).slice(0, MAX_ANEXOS).entries()) {
      try {
        const r = await fetch(img)
        if (!r.ok) throw new Error(String(r.status))
        const ext = (img.split('?')[0].match(/\.(\w{3,4})$/)?.[1] ?? 'png').toLowerCase()
        await bitrix('task.item.addfile', {
          TASK_ID: taskId,
          FILE: { NAME: `incidente-imagem-${i + 1}.${ext}`, CONTENT: base64(await r.arrayBuffer()) },
        })
        anexos++
      } catch {
        falhasAnexo++
      }
    }

    return json({
      taskId,
      url: link,
      anexos,
      falhasAnexo,
    })
  } catch (e) {
    return json({ error: mensagemDoErro(e) }, 502)
  }
})
