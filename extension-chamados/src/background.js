// ─────────────────────────────────────────────────────────────────────────────
// Service worker — o despachante.
//
// Recebe o incidente do KTM, guarda como "pendente" amarrado à aba que vai
// receber, abre/reaproveita a aba do formulário do T.I. e entrega o payload
// quando aquela aba (e só ela) pedir. Também baixa os anexos: fetch aqui não
// esbarra em CORS porque o worker tem host_permissions do bucket do KTM.
// ─────────────────────────────────────────────────────────────────────────────

const URL_NOVO_CHAMADO = 'https://chamadostikingoflanguages.lovable.app/novo-chamado'
const ORIGEM_CHAMADOS = 'https://chamadostikingoflanguages.lovable.app/*'

/** Depois disso o pendente é lixo — a pessoa desistiu no meio do caminho. */
const VALIDADE_MS = 15 * 60 * 1000

/** Limites do formulário do T.I. (o app rejeita o lote inteiro se um arquivo furar). */
const MAX_ANEXOS = 5
const MAX_BYTES = 5 * 1024 * 1024

const CONFIG_PADRAO = {
  /** Enviar sozinho ao terminar de preencher. Desligado: a pessoa confere e clica. */
  autoEnviar: false,
  /** Reanexar as imagens do incidente no chamado. */
  anexos: true,
}

async function config() {
  const { config: c } = await chrome.storage.local.get('config')
  return { ...CONFIG_PADRAO, ...(c ?? {}) }
}

/** Abre (ou reaproveita) a aba do formulário e devolve o id dela. */
async function abrirFormulario() {
  const abas = await chrome.tabs.query({ url: ORIGEM_CHAMADOS })
  if (abas.length > 0) {
    const alvo = abas[0]
    await chrome.tabs.update(alvo.id, { url: URL_NOVO_CHAMADO, active: true })
    await chrome.windows.update(alvo.windowId, { focused: true })
    return alvo.id
  }
  const nova = await chrome.tabs.create({ url: URL_NOVO_CHAMADO, active: true })
  return nova.id
}

/** Nome de arquivo legível a partir da URL do anexo (o bucket usa uuid). */
function nomeAnexo(url, ref, indice) {
  const ext = (url.split('?')[0].split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  return `incidente-${ref}-${indice + 1}.${ext}`
}

function paraBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

/** Baixa os anexos do incidente. Falha de um arquivo não derruba o chamado —
 *  o link dele continua escrito na descrição. */
async function baixarAnexos(urls, ref) {
  const resultados = []
  for (const [indice, url] of urls.slice(0, MAX_ANEXOS).entries()) {
    try {
      const resposta = await fetch(url)
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
      const buffer = await resposta.arrayBuffer()
      if (buffer.byteLength > MAX_BYTES) {
        resultados.push({ ok: false, url, erro: 'maior que 5 MB' })
        continue
      }
      resultados.push({
        ok: true,
        nome: nomeAnexo(url, ref, indice),
        mime: resposta.headers.get('content-type') || 'application/octet-stream',
        b64: paraBase64(buffer),
      })
    } catch (e) {
      resultados.push({ ok: false, url, erro: e instanceof Error ? e.message : 'falhou' })
    }
  }
  return resultados
}

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  // ── KTM: "manda este incidente pro T.I." ──────────────────────────────────
  if (msg?.tipo === 'enviarParaTi') {
    ;(async () => {
      const tabId = await abrirFormulario()
      await chrome.storage.session.set({
        pendente: { payload: msg.payload, tabId, ts: Date.now() },
      })
      responder({ ok: true })
    })()
    return true
  }

  // ── Formulário do T.I.: "tem algo pra mim?" ──────────────────────────────
  // Espiada barata, sem consumir: sem isso o content script ficaria observando
  // o DOM de toda página do app (Kanban incluso) esperando um formulário que
  // nunca vem.
  if (msg?.tipo === 'temPendente') {
    ;(async () => {
      const { pendente } = await chrome.storage.session.get('pendente')
      responder({
        pendente: !!pendente
          && pendente.tabId === sender.tab?.id
          && Date.now() - pendente.ts < VALIDADE_MS,
      })
    })()
    return true
  }

  // ── Formulário do T.I.: "sou a aba alvo? me dá o payload" ─────────────────
  // Consumir aqui (thread única do worker) evita duas abas preencherem o mesmo.
  if (msg?.tipo === 'pegarPendente') {
    ;(async () => {
      const { pendente } = await chrome.storage.session.get('pendente')
      const meu = pendente
        && pendente.tabId === sender.tab?.id
        && Date.now() - pendente.ts < VALIDADE_MS
      if (!meu) return responder({ payload: null })
      await chrome.storage.session.remove('pendente')
      responder({ payload: pendente.payload, config: await config() })
    })()
    return true
  }

  if (msg?.tipo === 'baixarAnexos') {
    ;(async () => responder({ anexos: await baixarAnexos(msg.urls ?? [], msg.ref ?? 'KTM') }))()
    return true
  }

  // ── Relatório do que aconteceu, pra mostrar no popup ──────────────────────
  if (msg?.tipo === 'registrarResultado') {
    chrome.storage.local.set({ ultimo: { ...msg.resultado, ts: Date.now() } })
    responder?.({ ok: true })
    return false
  }

  return false
})
