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
//   Body: { "professorId": "uuid", "reuniaoProfessorId": "uuid" }
//   Retorna: { ok: true } ou { error: string }
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405)

  let body: { professorId?: unknown; reuniaoProfessorId?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido.' }, 400)
  }

  const professorId = typeof body.professorId === 'string' ? body.professorId : ''
  const reuniaoProfessorId = typeof body.reuniaoProfessorId === 'string' ? body.reuniaoProfessorId : ''
  if (!professorId || !reuniaoProfessorId) {
    return json({ error: 'professorId e reuniaoProfessorId são obrigatórios.' }, 400)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Confere que a reunião pertence mesmo ao professor informado — o portal é
  // público/sem login, então não dá pra confiar cegamente nos IDs recebidos.
  const { data: linha, error: erroBusca } = await admin
    .from('reuniao_professores')
    .select('id, professor_id, observacao, status')
    .eq('id', reuniaoProfessorId)
    .maybeSingle()

  if (erroBusca) return json({ error: erroBusca.message }, 500)
  if (!linha || linha.professor_id !== professorId) {
    return json({ error: 'Reunião não encontrada para este professor.' }, 404)
  }

  const nota = `[via portal] Professor declarou que a reunião não aconteceu em ${new Date().toISOString()}.`
  const observacaoAtualizada = linha.observacao ? `${linha.observacao}\n${nota}` : nota

  const { error: erroUpdate } = await admin
    .from('reuniao_professores')
    .update({ status: 'cancelada', observacao: observacaoAtualizada })
    .eq('id', reuniaoProfessorId)

  if (erroUpdate) return json({ error: erroUpdate.message }, 500)

  return json({ ok: true })
})
