// ─────────────────────────────────────────────────────────────────────────────
// Content script da plataforma de chamados do T.I. (/novo-chamado).
//
// O formulário é react-hook-form + Radix, então cada campo pede um jeito
// diferente de ser preenchido "de fora":
//   · Título e Descrição são inputs registrados → setter nativo + evento input;
//   · Urgência é um Radix Select (o <select> visível não existe) → abrir e clicar
//     na opção com eventos de ponteiro de verdade;
//   · Tipo é um Radix RadioGroup → clique no item pelo id (`tipo-bug`, …);
//   · Anexos entram por DataTransfer no <input type="file"> escondido.
//
// Nada é enviado sozinho: preenchemos, mostramos o que foi preenchido e a
// pessoa confere e clica em "Criar chamado" (a menos que ligue o envio
// automático no popup).
// ─────────────────────────────────────────────────────────────────────────────

const ESPERA_FORMULARIO_MS = 3 * 60 * 1000 // dá tempo de fazer login antes
const ROTULO_URGENCIA = 'urgencia'

const pausa = ms => new Promise(r => setTimeout(r, ms))

function normalizar(texto) {
  return (texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

/** Espera `obter()` devolver algo verdadeiro. Observa o DOM em vez de pollar,
 *  porque o login é um redirect de SPA — pode demorar minutos. */
function esperar(obter, timeout) {
  return new Promise(resolve => {
    const achado = obter()
    if (achado) return resolve(achado)

    const observador = new MutationObserver(() => {
      const agora = obter()
      if (agora) {
        observador.disconnect()
        clearTimeout(relogio)
        resolve(agora)
      }
    })
    observador.observe(document.documentElement, { childList: true, subtree: true })

    const relogio = setTimeout(() => {
      observador.disconnect()
      resolve(null)
    }, timeout)
  })
}

/** Espera uma condição virar verdadeira (usado para confirmar que o React
 *  aceitou o que mandamos). */
async function esperarAte(condicao, timeout) {
  const fim = Date.now() + timeout
  while (Date.now() < fim) {
    if (condicao()) return true
    await pausa(50)
  }
  return condicao()
}

// ── Campos de texto ──────────────────────────────────────────────────────────

/** React guarda o valor num "value tracker" próprio: escrever em `el.value`
 *  direto faz ele achar que nada mudou. Por isso o setter do protótipo. */
function preencherTexto(el, valor) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return el.value === valor
}

// ── Radix: ponteiro ──────────────────────────────────────────────────────────

function eventoPonteiro(el, tipo) {
  const r = el.getBoundingClientRect()
  el.dispatchEvent(new PointerEvent(tipo, {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    buttons: tipo === 'pointerup' ? 0 : 1,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
  }))
}

// ── Urgência (Radix Select) ──────────────────────────────────────────────────

function acharTriggerUrgencia(form) {
  const porRotulo = [...form.querySelectorAll('label')]
    .find(l => normalizar(l.textContent) === ROTULO_URGENCIA)
  const alvo = porRotulo?.parentElement?.querySelector('[role="combobox"], button[aria-haspopup="listbox"]')
  return alvo ?? form.querySelector('[role="combobox"]')
}

/** Confere se a urgência escolhida "pegou".
 *
 *  O Radix mantém, ao lado do gatilho, um <select aria-hidden> nativo com o
 *  valor real (é o que faz o formulário funcionar sem JS). Ele é a fonte de
 *  verdade — imune a ícone, tema e tradução. Só serve para LER: escrever nele
 *  não avisa o Radix, então continuamos escolhendo por clique.
 *
 *  Sem ele, sobra o texto do gatilho, que pode vir colado ao ícone de seta
 *  quando este é texto ("▾") em vez de SVG — daí "contém" e não "é igual". */
function urgenciaConfirmada(trigger, valor) {
  const sombra = trigger?.parentElement?.querySelector('select[aria-hidden="true"]')
  if (sombra?.value) return normalizar(sombra.value) === normalizar(valor)
  return normalizar(trigger?.textContent).includes(normalizar(valor))
}

async function escolherUrgencia(form, valor) {
  const trigger = acharTriggerUrgencia(form)
  if (!trigger) return false
  if (urgenciaConfirmada(trigger, valor)) return true // já é o padrão ("Média")

  trigger.focus()
  eventoPonteiro(trigger, 'pointerdown')
  let aberto = await esperarAte(() => trigger.getAttribute('aria-expanded') === 'true', 600)
  if (!aberto) {
    trigger.click()
    aberto = await esperarAte(() => trigger.getAttribute('aria-expanded') === 'true', 600)
  }
  if (!aberto) return false

  // A lista abre num portal fora do formulário — busca no documento inteiro.
  const opcao = await esperar(
    () => [...document.querySelectorAll('[role="option"]')]
      .find(o => normalizar(o.textContent) === normalizar(valor)),
    2000,
  )
  if (!opcao) {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    return false
  }

  // Radix seleciona no pointerup; o pointermove antes é o que dá foco ao item.
  await pausa(120)
  eventoPonteiro(opcao, 'pointermove')
  eventoPonteiro(opcao, 'pointerdown')
  eventoPonteiro(opcao, 'pointerup')
  if (await esperarAte(() => urgenciaConfirmada(trigger, valor), 800)) return true

  opcao.click()
  if (await esperarAte(() => urgenciaConfirmada(trigger, valor), 500)) return true

  // Último recurso: teclado, que a lista também escuta.
  opcao.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  return esperarAte(() => urgenciaConfirmada(trigger, valor), 500)
}

// ── Tipo (Radix RadioGroup) ──────────────────────────────────────────────────

async function escolherTipo(tipo) {
  const item = document.getElementById(`tipo-${tipo.replace(/_/g, '-')}`)
  if (!item) return false
  const marcado = () => item.getAttribute('aria-checked') === 'true' || item.dataset.state === 'checked'
  if (marcado()) return true
  item.click()
  if (await esperarAte(marcado, 500)) return true
  eventoPonteiro(item, 'pointerdown')
  eventoPonteiro(item, 'pointerup')
  return esperarAte(marcado, 500)
}

// ── Anexos ───────────────────────────────────────────────────────────────────

function base64ParaBytes(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function anexar(form, urls, ref) {
  const entrada = form.querySelector('input[type="file"]')
  if (!entrada) return { enviados: 0, falhas: urls.length }

  const { anexos } = await chrome.runtime.sendMessage({ tipo: 'baixarAnexos', urls, ref })
  const baixados = (anexos ?? []).filter(a => a.ok)
  if (baixados.length === 0) return { enviados: 0, falhas: (anexos ?? []).length }

  const dt = new DataTransfer()
  for (const a of baixados) {
    dt.items.add(new File([base64ParaBytes(a.b64)], a.nome, { type: a.mime }))
  }
  entrada.files = dt.files
  entrada.dispatchEvent(new Event('change', { bubbles: true }))

  return { enviados: baixados.length, falhas: (anexos ?? []).length - baixados.length }
}

// ── Aviso no topo do formulário ──────────────────────────────────────────────

function mostrarAviso(form, payload, pendencias, resumoAnexos) {
  document.querySelector('.ktm-ti-aviso')?.remove()

  const aviso = document.createElement('div')
  aviso.className = 'ktm-ti-aviso'

  const titulo = document.createElement('p')
  titulo.className = 'ktm-ti-aviso__titulo'
  titulo.textContent = pendencias.length
    ? `Preenchido a partir do incidente #${payload.ref} — confira os campos marcados abaixo`
    : `Preenchido a partir do incidente #${payload.ref} da Gestão dos Professores`
  aviso.appendChild(titulo)

  const detalhe = document.createElement('p')
  detalhe.className = 'ktm-ti-aviso__texto'
  const partes = []
  if (pendencias.length) partes.push(`Preencha à mão: ${pendencias.join(', ')}.`)
  if (resumoAnexos) partes.push(resumoAnexos)
  partes.push('Revise e clique em "Criar chamado".')
  detalhe.textContent = partes.join(' ')
  aviso.appendChild(detalhe)

  const link = document.createElement('a')
  link.className = 'ktm-ti-aviso__link'
  link.href = payload.link
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = 'Ver o incidente original'
  aviso.appendChild(link)

  if (pendencias.length) aviso.classList.add('ktm-ti-aviso--atencao')
  if (form.parentElement) form.parentElement.insertBefore(aviso, form)
  else form.prepend(aviso)
}

// ── Orquestração ─────────────────────────────────────────────────────────────

async function principal() {
  // Nada pendente para esta aba: sai na hora, sem observar o DOM à toa.
  const { pendente } = await chrome.runtime.sendMessage({ tipo: 'temPendente' })
  if (!pendente) return

  const form = await esperar(
    () => {
      const f = document.querySelector('form')
      return f && f.querySelector('#titulo') && f.querySelector('#descricao') ? f : null
    },
    ESPERA_FORMULARIO_MS,
  )
  if (!form) return

  // Só a aba que o botão do KTM abriu recebe o payload — e só uma vez.
  const { payload, config } = await chrome.runtime.sendMessage({ tipo: 'pegarPendente' })
  if (!payload) return

  const pendencias = []
  if (!preencherTexto(form.querySelector('#titulo'), payload.titulo)) pendencias.push('título')
  if (!preencherTexto(form.querySelector('#descricao'), payload.descricao)) pendencias.push('descrição')
  if (!(await escolherTipo(payload.tipo))) pendencias.push('tipo')
  if (!(await escolherUrgencia(form, payload.urgencia))) pendencias.push('urgência')

  let resumoAnexos = ''
  let anexosEnviados = 0
  if (config?.anexos && payload.anexos?.length) {
    const { enviados, falhas } = await anexar(form, payload.anexos, payload.ref)
    anexosEnviados = enviados
    if (enviados) resumoAnexos = `${enviados} anexo${enviados > 1 ? 's' : ''} do incidente ${enviados > 1 ? 'foram anexados' : 'foi anexado'}.`
    if (falhas) resumoAnexos += ` ${falhas} não ${falhas > 1 ? 'vieram' : 'veio'} (o link está na descrição).`
  }

  mostrarAviso(form, payload, pendencias, resumoAnexos.trim())

  const enviarSozinho = config?.autoEnviar && pendencias.length === 0
  if (enviarSozinho) {
    await pausa(400)
    form.querySelector('button[type="submit"]')?.click()
  }

  chrome.runtime.sendMessage({
    tipo: 'registrarResultado',
    resultado: {
      ref: payload.ref,
      titulo: payload.titulo,
      urgencia: payload.urgencia,
      tipo: payload.tipo,
      anexos: anexosEnviados,
      pendencias,
      enviadoAutomaticamente: !!enviarSozinho,
    },
  })
}

// Uma extensão recarregada no meio do caminho invalida o canal de mensagens —
// não é motivo para explodir no console do site.
principal().catch(e => console.debug('[King → Chamado T.I.]', e))
