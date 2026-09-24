// Preferências do coordenador, em chrome.storage.sync (seguem a conta do navegador).
// O popup grava; o painel do Meet lê e reage à mudança sem recarregar a chamada.

const CHAVE_PRESENCA_AUTOMATICA = 'presencaAutomatica'

/** Presença automática nasce DESLIGADA: entra em piloto antes de valer para todos. */
export async function lerPresencaAutomatica(): Promise<boolean> {
  try {
    const r = await chrome.storage.sync.get(CHAVE_PRESENCA_AUTOMATICA)
    return r[CHAVE_PRESENCA_AUTOMATICA] === true
  } catch {
    return false
  }
}

export async function gravarPresencaAutomatica(ligada: boolean): Promise<void> {
  await chrome.storage.sync.set({ [CHAVE_PRESENCA_AUTOMATICA]: ligada })
}

/** Avisa quando a preferência muda (ex.: ligada no popup com a chamada aberta). Devolve o desligar. */
export function aoMudarPresencaAutomatica(cb: (ligada: boolean) => void): () => void {
  const ouvinte = (mudancas: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'sync' && CHAVE_PRESENCA_AUTOMATICA in mudancas) cb(mudancas[CHAVE_PRESENCA_AUTOMATICA].newValue === true)
  }
  chrome.storage.onChanged.addListener(ouvinte)
  return () => chrome.storage.onChanged.removeListener(ouvinte)
}
