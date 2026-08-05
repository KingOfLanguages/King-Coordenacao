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

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

/**
 * E-mails de participantes visíveis no DOM do Meet (best-effort).
 *
 * O Meet às vezes expõe o e-mail em atributos/rótulos (aria-label, tooltip) de
 * contatos da organização; participantes externos (gmail pessoal do professor)
 * costumam trazer só o nome — por isso o match por nome segue como caminho
 * principal. Mas quando um e-mail aparece, ele identifica o professor sem
 * ambiguidade, então tem prioridade sobre o nome (ver handleBuscarProfessor).
 *
 * Passar e-mails a mais é inofensivo: o background só casa com e-mail de
 * professor ATIVO — o e-mail do próprio coordenador (ou de terceiros) não bate
 * com ninguém e é simplesmente ignorado.
 */
export function extrairEmailsParticipantes(): string[] {
  const emails = new Set<string>()
  const coletar = (txt: string | null | undefined) => {
    for (const e of txt?.match(EMAIL_RE) ?? []) emails.add(e.toLowerCase())
  }

  document
    .querySelectorAll<HTMLElement>('[data-participant-id], [data-self-email], [data-tooltip], [aria-label]')
    .forEach(el => {
      coletar(el.getAttribute('data-self-email'))
      coletar(el.getAttribute('data-tooltip'))
      coletar(el.getAttribute('aria-label'))
      // Painel "Pessoas": o e-mail às vezes vem no próprio texto do item.
      if (el.hasAttribute('data-participant-id')) coletar(el.textContent)
    })

  return [...emails]
}
