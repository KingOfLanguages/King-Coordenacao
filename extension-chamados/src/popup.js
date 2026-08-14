// Popup: as duas opções da extensão e o retrato do último envio.

const CONFIG_PADRAO = { autoEnviar: false, anexos: true }

const TIPO_LABEL = {
  bug: 'Bug',
  melhoria: 'Melhoria',
  duvida: 'Dúvida',
  solicitacao_diversa: 'Solicitação Diversa',
}

const campos = {
  anexos: document.getElementById('anexos'),
  autoEnviar: document.getElementById('autoEnviar'),
}

async function carregar() {
  const { config, ultimo } = await chrome.storage.local.get(['config', 'ultimo'])
  const atual = { ...CONFIG_PADRAO, ...(config ?? {}) }
  campos.anexos.checked = atual.anexos
  campos.autoEnviar.checked = atual.autoEnviar
  desenharUltimo(ultimo)
}

function desenharUltimo(ultimo) {
  const caixa = document.getElementById('ultimo')
  caixa.textContent = ''

  if (!ultimo) {
    const p = document.createElement('span')
    p.className = 'vazio'
    p.textContent = 'Nenhum incidente enviado ainda.'
    caixa.appendChild(p)
    return
  }

  const quando = new Date(ultimo.ts).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  const linhas = [
    `Último: #${ultimo.ref} · ${quando}`,
    ultimo.titulo,
    `${TIPO_LABEL[ultimo.tipo] ?? ultimo.tipo} · urgência ${ultimo.urgencia}` +
      (ultimo.anexos ? ` · ${ultimo.anexos} anexo${ultimo.anexos > 1 ? 's' : ''}` : ''),
  ]
  if (ultimo.enviadoAutomaticamente) linhas.push('Enviado automaticamente.')

  for (const [i, texto] of linhas.entries()) {
    const linha = document.createElement('div')
    if (i === 0) {
      const b = document.createElement('b')
      b.textContent = texto
      linha.appendChild(b)
    } else {
      linha.textContent = texto
    }
    caixa.appendChild(linha)
  }

  if (ultimo.pendencias?.length) {
    const alerta = document.createElement('div')
    alerta.className = 'aviso'
    alerta.textContent = `Ficou faltando preencher: ${ultimo.pendencias.join(', ')}.`
    caixa.appendChild(alerta)
  }
}

async function salvar() {
  await chrome.storage.local.set({
    config: { anexos: campos.anexos.checked, autoEnviar: campos.autoEnviar.checked },
  })
}

campos.anexos.addEventListener('change', salvar)
campos.autoEnviar.addEventListener('change', salvar)
carregar()
