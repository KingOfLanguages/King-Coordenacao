// ─────────────────────────────────────────────────────────────────────────────
// Peças comuns dos portais PÚBLICOS do professor (/welcome-path, /pausa,
// /transferencia, /agendar) e das functions que eles chamam.
//
// Até o pentest de 05/10/2026 cada function duplicava a identificação "de
// propósito" — e foi exatamente a parte duplicada que estava errada nos quatro
// lugares ao mesmo tempo. Regra de segurança tem que morar num lugar só. O
// `supabase functions deploy` empacota os imports relativos, então `_shared/`
// sobe junto com cada function.
//
// Identidade: o professor prova que é dono do e-mail oficial digitando o código
// que a function `portal-identidade` manda. Só então nasce uma sessão
// (`portal_sessoes`), e TODA ação dos portais resolve o professor pelo token —
// nunca por um `professorId` vindo no corpo.
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
export type Admin = any

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Só as origens do app. Não impede chamada por curl (CORS é regra do
// navegador), mas impede que um site qualquer use o navegador do visitante para
// falar com estas APIs. `PORTAL_ORIGENS` (secret, separado por vírgula) soma
// origens extras, ex.: um domínio próprio no futuro.

const ORIGENS_FIXAS = [
  'https://projeto-king-coord.vercel.app',
]
/** Deploys de preview da Vercel do mesmo projeto e o Vite local. */
const ORIGENS_PADRAO = [
  /^https:\/\/projeto-king-coord(-[a-z0-9-]+)?\.vercel\.app$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
]

function origemPermitida(origem: string): boolean {
  if (!origem) return false
  const extras = (Deno.env.get('PORTAL_ORIGENS') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
  return ORIGENS_FIXAS.includes(origem)
    || extras.includes(origem)
    || ORIGENS_PADRAO.some(re => re.test(origem))
}

export function cabecalhosCors(req: Request): Record<string, string> {
  const origem = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin':  origemPermitida(origem) ? origem : ORIGENS_FIXAS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

/** `const json = jsonPara(req)` no começo do handler — a resposta já sai com o
 *  CORS da origem certa. */
export function jsonPara(req: Request) {
  const cors = cabecalhosCors(req)
  return (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

export function preflight(req: Request): Response {
  return new Response('ok', { headers: cabecalhosCors(req) })
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

export function ipDe(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? ''
  return xff.split(',')[0].trim()
    || req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || 'desconhecido'
}

export async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function novoToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Remove o sufixo de "início/data" que a plataforma às vezes gruda no nome do
 *  professor — ex.: "Fulano de Tal - inicio 18/09". Ver ktm-nome-sufixo-inicio. */
export function semSufixoInicio(nome: string): string {
  return nome
    .replace(/[\s\-–—(|,:;]+in[íi]cio.*$/i, '')
    .replace(/[\s\-–—(|,:;]+\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\)?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Match EXATO do nome completo — só caixa, acentuação e o sufixo de
 *  "início/data" são ignorados. */
export function nomeExato(informado: string, real: string): boolean {
  const a = norm(semSufixoInicio(informado))
  return a.length > 0 && a === norm(semSufixoInicio(real))
}

/** Mês/ano de início dentro de ±1 mês de tolerância. */
export function dataInicioBate(dataInicio: string | null, mes: number, ano: number): boolean {
  if (!dataInicio) return false
  const d = new Date(dataInicio)
  const diffMeses = (d.getUTCFullYear() - ano) * 12 + (d.getUTCMonth() - (mes - 1))
  return Math.abs(diffMeses) <= 1
}

/** Texto livre que vai para o banco: sem tags HTML. A UI escapa tudo, mas o
 *  mesmo texto pode acabar num e-mail HTML ou numa exportação. */
export function textoLimpo(s: unknown, max: number): string {
  if (typeof s !== 'string') return ''
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max)
}

// ─── Limite por IP ────────────────────────────────────────────────────────────

/** Registra a chamada e diz se o IP passou de `max` chamadas desta `acao` nos
 *  últimos `janelaMin` minutos. Falha aberta se o banco não responder — o
 *  limite é contenção, não a barreira de identidade. */
export async function estourouLimite(
  admin: Admin, ip: string, acao: string, max: number, janelaMin: number,
): Promise<boolean> {
  const desde = new Date(Date.now() - janelaMin * 60_000).toISOString()
  const { count, error } = await admin
    .from('portal_tentativas')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('acao', acao)
    .gte('created_at', desde)
  await admin.from('portal_tentativas').insert({ ip, acao })
  if (error) return false
  return (count ?? 0) >= max
}

// ─── Sessão ───────────────────────────────────────────────────────────────────

/** Escopo da sessão (migration 20260794):
 *  - 'completo': nasceu do código no e-mail; vale nos 4 portais.
 *  - 'agendamento': nasceu só de e-mail/nome (sem código); só o /agendar aceita.
 *    Decisão do João em 08/10 — o pentest de 05/10 fechou os 4 portais, e o
 *    agendamento voltou a abrir sem código, com o que ele expõe contido. */
export type EscopoSessao = 'completo' | 'agendamento'

const VALIDADE: Record<EscopoSessao, { janelaMs: number; tetoMs: number; maxPorProfessor: number }> = {
  // Deslizante: cada uso empurra para a frente, até o teto absoluto.
  completo:    { janelaMs: 14 * 86_400_000, tetoMs: 30 * 86_400_000, maxPorProfessor: 5 },
  // Curta e sem renovação: só o tempo de marcar uma reunião.
  agendamento: { janelaMs: 2 * 3_600_000,   tetoMs: 2 * 3_600_000,   maxPorProfessor: 10 },
}

export type ProfessorSessao = {
  id: string
  nome: string
  status: string
  data_inicio: string | null
  coordenador_id: string | null
  escopo: EscopoSessao
}

export async function criarSessao(
  admin: Admin, professorId: string, ip: string, escopo: EscopoSessao = 'completo',
) {
  const v = VALIDADE[escopo]
  const token = novoToken()
  const agora = Date.now()
  const expiraEm = new Date(agora + v.janelaMs).toISOString()
  const expiraMaxEm = new Date(agora + v.tetoMs).toISOString()

  await admin.from('portal_sessoes').insert({
    professor_id:  professorId,
    token_hash:    await sha256(token),
    expira_em:     expiraEm,
    expira_max_em: expiraMaxEm,
    escopo,
    ip,
  })

  // O excedente cai DENTRO do mesmo escopo: abrir sessões de agendamento (que
  // não pedem código) nunca pode derrubar a sessão completa do professor.
  const { data: todas } = await admin
    .from('portal_sessoes')
    .select('id')
    .eq('professor_id', professorId)
    .eq('escopo', escopo)
    .order('created_at', { ascending: false })
  const sobrando = ((todas ?? []) as { id: string }[]).slice(v.maxPorProfessor).map(s => s.id)
  if (sobrando.length) await admin.from('portal_sessoes').delete().in('id', sobrando)

  return { token, expiraEm }
}

/** Troca o token pelo professor. `null` = sem sessão válida (responda 401).
 *  Só `desligado` fica de fora aqui; barrar quem está em pausa é decisão de
 *  cada portal. Sessão de escopo 'agendamento' só passa com `aceitaAgendamento`
 *  — as functions do /agendar pedem isso; as dos outros portais, não. */
export async function resolverSessao(
  admin: Admin, token: unknown, opcoes: { aceitaAgendamento?: boolean } = {},
): Promise<ProfessorSessao | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null

  const { data: sess } = await admin
    .from('portal_sessoes')
    .select('id, professor_id, expira_em, expira_max_em, escopo')
    .eq('token_hash', await sha256(token))
    .maybeSingle()

  if (!sess) return null
  const escopo: EscopoSessao = sess.escopo === 'agendamento' ? 'agendamento' : 'completo'
  if (escopo === 'agendamento' && !opcoes.aceitaAgendamento) return null
  const agora = Date.now()
  if (new Date(sess.expira_em).getTime() < agora || new Date(sess.expira_max_em).getTime() < agora) {
    await admin.from('portal_sessoes').delete().eq('id', sess.id)
    return null
  }

  const { data: p } = await admin
    .from('professores')
    .select('id, nome, status, data_inicio, coordenador_id')
    .eq('id', sess.professor_id)
    .maybeSingle()

  if (!p || p.status === 'desligado') return null

  const deslizada = Math.min(agora + VALIDADE[escopo].janelaMs, new Date(sess.expira_max_em).getTime())
  await admin.from('portal_sessoes')
    .update({ ultimo_uso_em: new Date(agora).toISOString(), expira_em: new Date(deslizada).toISOString() })
    .eq('id', sess.id)

  return { ...(p as Omit<ProfessorSessao, 'escopo'>), escopo }
}

export async function encerrarSessao(admin: Admin, token: unknown): Promise<void> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return
  await admin.from('portal_sessoes').delete().eq('token_hash', await sha256(token))
}

export const MSG_SESSAO = 'Sua sessão expirou. Entre de novo com o código enviado ao seu e-mail.'
export const MSG_SESSAO_AGENDAMENTO = 'Sua sessão expirou. Informe de novo seu e-mail ou nome completo.'
