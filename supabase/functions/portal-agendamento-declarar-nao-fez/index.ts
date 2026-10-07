// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: portal-agendamento-declarar-nao-fez
//
// Usada pela tela pública /agendar quando o portal mostra o aviso de
// "agendamento recente" (ver portal-agendamento-lookup) e o professor declara
// que a última reunião vinculada não aconteceu de fato. Marca a linha de
// reuniao_professores como 'cancelada' (mesma semântica já usada pela
// extensão/coordenação) e registra a origem na observação, liberando o
// professor pra fazer um novo agendamento imediatamente.
//
// ── Contrato ─────────────────────────────────────────────────────────────────
//   POST /functions/v1/portal-agendamento-declarar-nao-fez
//   Body: { "token": "<sessão do portal-identidade>", "reuniaoProfessorId": "uuid" }
//   Retorna: { ok: true } ou { error: string }
//
// O professor vem da sessão (código no e-mail), nunca do corpo — antes bastava
// saber o id de alguém para cancelar a reunião dele (pentest 05/10/2026).
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { jsonPara, preflight, resolverSessao, MSG_SESSAO } from '../_shared/portal.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  const json = jsonPara(req)
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: { token?: unknown; reuniaoProfessorId?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const reuniaoProfessorId = typeof body.reuniaoProfessorId === 'string' ? body.reuniaoProfessorId : ''
  if (!reuniaoProfessorId) return json({ error: 'reuniaoProfessorId é obrigatório.' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const sessao = await resolverSessao(admin, body.token)
  if (!sessao) return json({ error: MSG_SESSAO }, 401)
  const professorId = sessao.id

  // Confere que a reunião pertence ao professor da sessão.
  const { data: linha, error: erroBusca } = await admin
    .from('reuniao_professores')
    .select('id, professor_id, observacao, status')
    .eq('id', reuniaoProfessorId)
    .maybeSingle()

  if (erroBusca) return json({ error: 'Não foi possível consultar a reunião agora.' }, 500)
  if (!linha || linha.professor_id !== professorId) {
    return json({ error: 'Reunião não encontrada para este professor.' }, 404)
  }

  const nota = `[via portal] Professor declarou que a reunião não aconteceu em ${new Date().toISOString()}.`
  const observacaoAtualizada = linha.observacao ? `${linha.observacao}\n${nota}` : nota

  const { error: erroUpdate } = await admin
    .from('reuniao_professores')
    .update({ status: 'cancelada', observacao: observacaoAtualizada })
    .eq('id', reuniaoProfessorId)

  if (erroUpdate) return json({ error: 'Não foi possível registrar agora. Tente de novo.' }, 500)

  return json({ ok: true })
})
