// ─────────────────────────────────────────────────────────────────────────────
// Content script do KTM (Gestão dos Professores).
//
// A página marca cada incidente com `data-ktm-chamado` (o payload já traduzido
// para o vocabulário do T.I.) e deixa um `data-ktm-chamado-slot` vazio onde o
// botão deve nascer. Aqui só preenchemos o slot e despachamos — nenhuma regra
// de negócio mora nesta extensão, para categoria nova no KTM não exigir update.
// ─────────────────────────────────────────────────────────────────────────────

const MARCA = 'data-ktm-ti-pronto'

const ICONE = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
  <path d="M9 14h6" /><path d="M12 11v6" /></svg>`

function lerPayload(slot) {
  const fonte = slot.closest('[data-ktm-chamado]')
  if (!fonte) return null
  try {
    const payload = JSON.parse(fonte.getAttribute('data-ktm-chamado'))
    return payload?.v === 1 ? payload : null
  } catch {
    return null
  }
}

function montarBotao(slot) {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = 'ktm-ti-botao'
  botao.title = 'Abrir este incidente como chamado na plataforma do T.I., já preenchido'
  botao.innerHTML = `${ICONE}<span>Chamado T.I.</span>`

  botao.addEventListener('click', async e => {
    // O card inteiro é clicável (abre o detalhe) — este clique é só nosso.
    e.preventDefault()
    e.stopPropagation()

    const payload = lerPayload(slot)
    if (!payload) {
      botao.classList.add('ktm-ti-botao--erro')
      botao.querySelector('span').textContent = 'Dados indisponíveis'
      return
    }

    botao.disabled = true
    botao.querySelector('span').textContent = 'Abrindo…'
    try {
      await chrome.runtime.sendMessage({ tipo: 'enviarParaTi', payload })
      botao.querySelector('span').textContent = 'Aberto no T.I.'
    } catch {
      botao.classList.add('ktm-ti-botao--erro')
      botao.querySelector('span').textContent = 'Falhou — recarregue'
    }
    setTimeout(() => {
      botao.disabled = false
      botao.classList.remove('ktm-ti-botao--erro')
      botao.querySelector('span').textContent = 'Chamado T.I.'
    }, 2500)
  })

  return botao
}

function equipar() {
  for (const slot of document.querySelectorAll(`[data-ktm-chamado-slot]:not([${MARCA}])`)) {
    slot.setAttribute(MARCA, '')
    slot.appendChild(montarBotao(slot))
  }
}

// A lista é React puro: cards entram e saem a cada filtro, busca e reordenação.
const observador = new MutationObserver(() => equipar())
observador.observe(document.documentElement, { childList: true, subtree: true })
equipar()
