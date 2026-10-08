// ─────────────────────────────────────────────────────────────────────────────
// Edge Function: portal-identidade
//
// Porta de entrada ÚNICA dos portais do professor (/welcome-path, /pausa,
// /transferencia, /agendar). Nasceu do pentest de 05/10/2026: antes, saber o
// nome completo de alguém bastava para operar como essa pessoa, e o passo de
// "cadastre seu e-mail" deixava o atacante trocar o canal de contato dela.
//
// Agora:
//   1. `solicitar` — e-mail OU nome completo (+ mês/ano para desempate) só
//      LOCALIZAM o cadastro. Mandamos um código de 6 dígitos para o e-mail
//      OFICIAL do professor (o que veio da API do KMS). Nunca gravamos e-mail.
//   2. `verificar` — o código certo vira uma sessão (`portal_sessoes`), válida
//      nos 4 portais. As outras functions só aceitam esse token.
//   3. `sessao` / `sair` — quem sou eu / encerrar a sessão neste dispositivo.
//
// Para onde vai o código:
//   • o professor digitou um e-mail que é o do cadastro (professores.email) ou
//     um e-mail que veio do KMS/Calendar (professor_emails, origem ≠ 'portal')
//     → vai para o e-mail digitado;
//   • qualquer outro caminho (nome, e-mail "aprendido" pelo portal antigo)
//     → vai para professores.email. O e-mail digitado nunca recebe nada que não
//     seja comprovadamente dele.
//
// Contrato (POST /functions/v1/portal-identidade):
//   solicitar { email?, nome?, mesInicio?, anoInicio? }
//     → { status: 'enviado', desafio } | { status: 'ambiguo' }
//     "enviado" vem igual exista o cadastro ou não (item 8 do pentest): sem
//     professor, ou sem e-mail, o desafio é uma isca que nunca confere.
//   verificar { desafio, codigo } → { token, expiraEm, professor: { id, nome } }
//   identificar { email?, nome?, mesInicio?, anoInicio? }  — só o /agendar
//     → { status: 'ok', token, expiraEm, professor } | { status: 'nao_encontrado' | 'ambiguo' }
//     Sem código: a sessão sai com escopo 'agendamento' (2 h), que os outros
//     portais recusam e que não vê o link do Meet. Decisão do João em 08/10.
//   sessao    { token }           → { professor: { id, nome } }   (só escopo completo)
//   sair      { token }           → { ok: true }
//
// Limites: por IP (pedidos e verificações), pelo que foi digitado (códigos a
// cada 15 min / por dia) e um teto diário silencioso por professor.
// Secrets: BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME.
// ─────────────────────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type Admin, jsonPara, preflight, ipDe, sha256, novoToken, norm, nomeExato, dataInicioBate,
  semSufixoInicio, estourouLimite, criarSessao, resolverSessao, encerrarSessao,
  MSG_SESSAO,
} from '../_shared/portal.ts'

const NOME_MIN_CHARS = 3
const EMAILRE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const CODIGO_MINUTOS = 10
const CODIGO_TENTATIVAS = 5
/** Códigos pelo mesmo e-mail/nome digitado: 3 a cada 15 min, 8 por dia. */
const CODIGOS_JANELA = 3
const CODIGOS_DIA = 8
/** Teto diário por professor, somando todos os jeitos de chegar nele. */
const CODIGOS_PROFESSOR_DIA = 12

type ProfRow = { id: string; nome: string; status: string; data_inicio: string | null; email: string | null }

function codigoAleatorio(): string {
  // Rejeição para não enviesar: 4_294_000_000 é o maior múltiplo de 1e6 ≤ 2^32.
  const buf = new Uint32Array(1)
  do { crypto.getRandomValues(buf) } while (buf[0] >= 4_294_000_000)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

function htmlCodigo(nome: string, codigo: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr>
          <td style="background:#1e293b;padding:24px 32px;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">
              King Of Languages
            </p>
            <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#f8fafc;">Seu código de acesso</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-size:15px;color:#1e293b;line-height:1.6;">
            <p style="margin:0 0 16px;">Olá, ${nome}!</p>
            <p style="margin:0 0 20px;">Use este código para entrar no portal do professor:</p>
            <p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:.3em;font-family:'SFMono-Regular',Consolas,monospace;">${codigo}</p>
            <p style="margin:0;font-size:13px;color:#64748b;">
              Ele vale por ${CODIGO_MINUTOS} minutos. Se não foi você que pediu, ignore este e-mail —
              ninguém entra sem este código.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/** E-mail que o professor provou ter: o do cadastro ou um vínculo do KMS/Calendar. */
async function localizarPorEmail(admin: Admin, email: string): Promise<{ prof: ProfRow; emailConfiavel: boolean } | null> {
  const alvo = email.toLowerCase().trim()
  const campos = 'id, nome, status, data_inicio, email'

  // `ilike` trata `_`/`%` como curinga — reconferimos a igualdade em JS.
  const { data: cadastro } = await admin
    .from('professores').select(campos).ilike('email', email).limit(20)
  const porCadastro = ((cadastro ?? []) as ProfRow[])
    .filter(p => p.email?.toLowerCase().trim() === alvo && p.status !== 'desligado')
  if (porCadastro.length === 1) return { prof: porCadastro[0], emailConfiavel: true }

  const { data: vinculos } = await admin
    .from('professor_emails').select('professor_id, email, origem').ilike('email', email).limit(20)
  const v = ((vinculos ?? []) as { professor_id: string; email: string | null; origem: string | null }[])
    .find(x => x.email?.toLowerCase().trim() === alvo)
  if (!v) return null

  const { data: p } = await admin.from('professores').select(campos).eq('id', v.professor_id).maybeSingle()
  if (!p || p.status === 'desligado') return null
  return { prof: p as ProfRow, emailConfiavel: v.origem !== 'portal' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  const json = jsonPara(req)
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'JSON inválido.' }, 400) }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const ip = ipDe(req)
  const acao = typeof body.acao === 'string' ? body.acao : ''

  // ══ solicitar ══════════════════════════════════════════════════════════════
  if (acao === 'solicitar') {
    if (await estourouLimite(admin, ip, 'solicitar', 10, 15)
     || await estourouLimite(admin, ip, 'solicitar_dia', 40, 24 * 60)) {
      return json({ error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' }, 429)
    }

    const nome  = typeof body.nome  === 'string' ? body.nome.trim().slice(0, 200)  : ''
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : ''
    const emailValido = EMAILRE.test(email.toLowerCase())
    const temNome = nome.length >= NOME_MIN_CHARS
    if (!emailValido && !temNome) {
      return json({ error: `Informe seu e-mail ou seu nome completo.` }, 400)
    }
    const mesInicio = typeof body.mesInicio === 'number' ? body.mesInicio : null
    const anoInicio = typeof body.anoInicio === 'number' ? body.anoInicio : null

    // Limite pelo que foi DIGITADO — vale igual para quem existe e quem não
    // existe, então a mensagem de "muitos pedidos" não denuncia o cadastro.
    const agora = Date.now()
    const chaveHash = await sha256(emailValido ? `email:${email.toLowerCase()}` : `nome:${norm(semSufixoInicio(nome))}`)
    const { data: recentesChave } = await admin
      .from('portal_codigos')
      .select('created_at')
      .eq('chave_hash', chaveHash)
      .gte('created_at', new Date(agora - 86_400_000).toISOString())
    const daChave = (recentesChave ?? []) as { created_at: string }[]
    const naJanela = daChave.filter(c => new Date(c.created_at).getTime() > agora - 15 * 60_000).length
    if (naJanela >= CODIGOS_JANELA || daChave.length >= CODIGOS_DIA) {
      return json({ error: 'Muitos pedidos de código seguidos. Use o último que chegou no seu e-mail ou espere alguns minutos.' }, 429)
    }

    let prof: ProfRow | null = null
    let destino: string | null = null

    if (emailValido) {
      const achado = await localizarPorEmail(admin, email)
      if (achado) {
        prof = achado.prof
        destino = achado.emailConfiavel ? email.toLowerCase() : null
      }
    }

    if (!prof && temNome) {
      const { data: naCasa } = await admin
        .from('professores')
        .select('id, nome, status, data_inicio, email')
        .neq('status', 'desligado')
      let candidatos = ((naCasa ?? []) as ProfRow[]).filter(p => nomeExato(nome, p.nome))
      if (candidatos.length > 1 && mesInicio != null && anoInicio != null) {
        candidatos = candidatos.filter(p => dataInicioBate(p.data_inicio, mesInicio, anoInicio))
      }
      // Homônimo continua pedindo mês/ano: nomes são públicos, e sem o
      // desempate o professor não teria como entrar.
      if (candidatos.length > 1) return json({ status: 'ambiguo' })
      prof = candidatos[0] ?? null
    }

    if (prof) destino = destino ?? (prof.email?.trim().toLowerCase() || null)
    if (destino && !EMAILRE.test(destino)) destino = null

    // Teto diário por professor (vários e-mails/nomes levam à mesma pessoa).
    // Estourou = vira isca, em silêncio: um erro aqui denunciaria o cadastro.
    if (prof && destino) {
      const { count } = await admin
        .from('portal_codigos')
        .select('id', { count: 'exact', head: true })
        .eq('professor_id', prof.id)
        .gte('created_at', new Date(agora - 86_400_000).toISOString())
      if ((count ?? 0) >= CODIGOS_PROFESSOR_DIA) destino = null
    }

    const real = !!(prof && destino)
    const codigo = codigoAleatorio()
    const { data: criado, error: errCod } = await admin
      .from('portal_codigos')
      .insert({
        professor_id:  real ? prof!.id : null,
        // Isca: hash de bytes aleatórios — nenhum código de 6 dígitos confere.
        codigo_hash:   real ? await sha256(`${prof!.id}:${codigo}`) : await sha256(novoToken()),
        email_destino: real ? destino : '',
        chave_hash:    chaveHash,
        expira_em:     new Date(agora + CODIGO_MINUTOS * 60_000).toISOString(),
        ip,
      })
      .select('id')
      .single()
    if (errCod || !criado) {
      console.error('[portal-identidade] erro ao gravar código:', errCod?.message)
      return json({ error: 'Não foi possível gerar o código agora. Tente de novo.' }, 500)
    }

    if (!real) {
      // O envio real leva o tempo de uma chamada ao Brevo; sem esta espera, a
      // isca responderia rápido demais e o relógio denunciaria o cadastro.
      await new Promise(r => setTimeout(r, 350 + Math.random() * 450))
      return json({ status: 'enviado', desafio: criado.id })
    }

    const brevoKey = Deno.env.get('BREVO_API_KEY')
    if (!brevoKey) return json({ error: 'Envio de e-mail indisponível. Fale com a coordenação.' }, 503)

    const primeiroNome = semSufixoInicio(prof!.nome).split(' ')[0] || 'professor(a)'
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        sender:      {
          name:  Deno.env.get('BREVO_FROM_NAME')  ?? 'KOL - King Of Languages',
          email: Deno.env.get('BREVO_FROM_EMAIL') ?? 'coordenacaoking.agenda@gmail.com',
        },
        to:          [{ email: destino, name: primeiroNome }],
        subject:     `Seu código de acesso: ${codigo}`,
        htmlContent: htmlCodigo(primeiroNome, codigo),
      }),
    })
    if (!res.ok) {
      console.error('[portal-identidade] Brevo recusou:', res.status, await res.text())
      await admin.from('portal_codigos').delete().eq('id', criado.id)
      return json({ error: 'Não conseguimos enviar o código agora. Tente de novo em instantes ou fale com a coordenação.' }, 503)
    }

    return json({ status: 'enviado', desafio: criado.id })
  }

  // ══ verificar ══════════════════════════════════════════════════════════════
  if (acao === 'verificar') {
    if (await estourouLimite(admin, ip, 'verificar', 30, 15)) {
      return json({ error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' }, 429)
    }

    const desafio = typeof body.desafio === 'string' ? body.desafio.trim() : ''
    const codigo  = typeof body.codigo  === 'string' ? body.codigo.replace(/\D/g, '') : ''
    if (!/^[0-9a-f-]{36}$/i.test(desafio) || codigo.length !== 6) {
      return json({ error: 'Digite os 6 números do código.' }, 400)
    }

    const { data: c } = await admin
      .from('portal_codigos')
      .select('id, professor_id, codigo_hash, expira_em, tentativas, usado_em')
      .eq('id', desafio)
      .maybeSingle()

    const expirado = !c || c.usado_em || new Date(c.expira_em).getTime() < Date.now()
      || c.tentativas >= CODIGO_TENTATIVAS
    if (expirado) return json({ error: 'Este código expirou. Peça um novo.', expirado: true }, 400)

    const ok = iguais(await sha256(`${c.professor_id}:${codigo}`), c.codigo_hash)
    if (!ok) {
      const tentativas = c.tentativas + 1
      await admin.from('portal_codigos').update({ tentativas }).eq('id', c.id)
      const restam = CODIGO_TENTATIVAS - tentativas
      return restam > 0
        ? json({ error: `Código incorreto. Você ainda tem ${restam} tentativa${restam > 1 ? 's' : ''}.` }, 400)
        : json({ error: 'Código incorreto. Peça um novo código.', expirado: true }, 400)
    }

    // Uso único: só um pedido concorrente vence a troca de `usado_em`.
    const { data: marcado } = await admin
      .from('portal_codigos')
      .update({ usado_em: new Date().toISOString() })
      .eq('id', c.id)
      .is('usado_em', null)
      .select('id')
    if (!marcado?.length) return json({ error: 'Este código expirou. Peça um novo.', expirado: true }, 400)

    const { data: p } = await admin
      .from('professores').select('id, nome, status').eq('id', c.professor_id).maybeSingle()
    if (!p || p.status === 'desligado') return json({ error: 'Cadastro indisponível. Fale com a coordenação.' }, 403)

    const { token, expiraEm } = await criarSessao(admin, p.id, ip)
    return json({ token, expiraEm, professor: { id: p.id, nome: semSufixoInicio(p.nome) } })
  }

  // ══ identificar (só /agendar, sem código) ══════════════════════════════════
  // Decisão do João em 08/10: o agendamento abre só com e-mail OU nome. A
  // sessão sai com escopo 'agendamento' — 2 horas, recusada pelos outros
  // portais, sem link do Meet na tela. Nada é gravado no cadastro.
  if (acao === 'identificar') {
    if (await estourouLimite(admin, ip, 'identificar', 20, 15)
     || await estourouLimite(admin, ip, 'identificar_dia', 80, 24 * 60)) {
      return json({ error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' }, 429)
    }

    const nome  = typeof body.nome  === 'string' ? body.nome.trim().slice(0, 200)  : ''
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : ''
    const emailValido = EMAILRE.test(email.toLowerCase())
    const temNome = nome.length >= NOME_MIN_CHARS
    if (!emailValido && !temNome) {
      return json({ error: 'Informe seu e-mail ou seu nome completo.' }, 400)
    }
    const mesInicio = typeof body.mesInicio === 'number' ? body.mesInicio : null
    const anoInicio = typeof body.anoInicio === 'number' ? body.anoInicio : null

    let prof: ProfRow | null = null
    if (emailValido) prof = (await localizarPorEmail(admin, email))?.prof ?? null

    if (!prof && temNome) {
      const { data: naCasa } = await admin
        .from('professores')
        .select('id, nome, status, data_inicio, email')
        .neq('status', 'desligado')
      let candidatos = ((naCasa ?? []) as ProfRow[]).filter(p => nomeExato(nome, p.nome))
      if (candidatos.length > 1 && mesInicio != null && anoInicio != null) {
        candidatos = candidatos.filter(p => dataInicioBate(p.data_inicio, mesInicio, anoInicio))
      }
      if (candidatos.length > 1) return json({ status: 'ambiguo' })
      prof = candidatos[0] ?? null
    }

    if (!prof) return json({ status: 'nao_encontrado' })

    const { token, expiraEm } = await criarSessao(admin, prof.id, ip, 'agendamento')
    return json({ status: 'ok', token, expiraEm, professor: { id: prof.id, nome: semSufixoInicio(prof.nome) } })
  }

  // ══ sessao ═════════════════════════════════════════════════════════════════
  if (acao === 'sessao') {
    const prof = await resolverSessao(admin, body.token)
    if (!prof) return json({ error: MSG_SESSAO }, 401)
    return json({ professor: { id: prof.id, nome: semSufixoInicio(prof.nome) } })
  }

  // ══ sair ═══════════════════════════════════════════════════════════════════
  if (acao === 'sair') {
    await encerrarSessao(admin, body.token)
    return json({ ok: true })
  }

  return json({ error: 'Ação desconhecida.' }, 400)
})
