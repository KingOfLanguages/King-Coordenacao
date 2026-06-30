// ─────────────────────────────────────────────────────────────────────────────
// Extração best-effort de nomes de participantes do Google Meet.
//
// O DOM do Meet não é documentado publicamente e muda com frequência — por
// isso isto é "melhor esforço": tenta os seletores mais estáveis conhecidos
// e sempre existe a busca manual no painel como caminho garantido.
// ─────────────────────────────────────────────────────────────────────────────

const RUIDO = new Set([
  'mais opções', 'desativar câmera', 'ativar câmera', 'desativar microfone',
  'ativar microfone', 'fixar para mim', 'mais ações',
])

function limpar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

export function extrairNomesParticipantes(): string[] {
  const nomes = new Set<string>()

  document.querySelectorAll<HTMLElement>('[data-participant-id]').forEach(el => {
    const texto = limpar(el.textContent ?? '')
    if (texto.length > 1 && texto.length < 60 && !RUIDO.has(texto.toLowerCase())) {
      nomes.add(texto)
    }
  })

  return [...nomes]
}

export function nomeDoUsuarioLogado(): string | null {
  const el = document.querySelector<HTMLElement>('[data-self-name]')
  const valor = el?.getAttribute('data-self-name') ?? el?.textContent ?? ''
  return limpar(valor) || null
}

/** Nomes de participantes, excluindo o próprio usuário quando identificável. */
export function extrairCandidatos(): string[] {
  const self = nomeDoUsuarioLogado()
  return extrairNomesParticipantes().filter(n => n !== self)
}
