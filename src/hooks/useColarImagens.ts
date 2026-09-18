import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { toast } from 'sonner'

// ─────────────────────────────────────────────────────────────────────────────
// Ctrl+V de print direto nos campos de imagem.
//
// Quem registra incidente ou preenche ficha tem o print na área de transferência,
// não num arquivo: obrigar a salvar antes de anexar era o atrito. Aqui qualquer
// área que aceita imagem se registra, e um único ouvinte de `paste` no documento
// decide para qual delas o print vai.
//
// Com várias áreas na mesma tela (as seções da ficha de projeto, os blocos do
// Welcome Path), ganha a área cuja ZONA contém o campo em foco — ou, se nada
// relevante está em foco, o que está debaixo do mouse. A zona é o pedaço da tela
// que "pertence" à área (a seção inteira, não só o botão de anexar), porque é
// ali que a pessoa está escrevendo quando cola.
//
// Colar texto continua sendo colar texto: se o foco está num campo de texto e a
// área de transferência traz texto junto (Excel, Word copiam texto + imagem),
// o paste não é interceptado.
// ─────────────────────────────────────────────────────────────────────────────

interface Alvo {
  zona: () => HTMLElement | null
  onImagens: (files: File[]) => void
}

const alvos = new Set<Alvo>()
let ponteiro: { x: number; y: number } | null = null

function aoMoverPonteiro(e: PointerEvent) {
  ponteiro = { x: e.clientX, y: e.clientY }
}

function ehEditavel(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'file', 'submit'].includes(el.type)
  return (el as HTMLElement).isContentEditable
}

/** Nome legível para o print colado — o navegador entrega todos como "image.png". */
function renomear(file: File, i: number): File {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  const sufixo = i > 0 ? `-${i + 1}` : ''
  const nome = `print-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}h${p(d.getMinutes())}${sufixo}.${ext}`
  return new File([file], nome, { type: file.type, lastModified: d.getTime() })
}

function escolherAlvo(): Alvo | null {
  const lista = [...alvos]
  if (lista.length === 1) return lista[0]

  const dentro = (el: Element | null) =>
    el ? lista.find(a => a.zona()?.contains(el)) ?? null : null

  const foco = document.activeElement
  const peloFoco = foco && foco !== document.body ? dentro(foco) : null
  if (peloFoco) return peloFoco

  return ponteiro ? dentro(document.elementFromPoint(ponteiro.x, ponteiro.y)) : null
}

function aoColar(e: ClipboardEvent) {
  const dados = e.clipboardData
  if (!dados) return

  const imagens = Array.from(dados.items)
    .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
    .map(it => it.getAsFile())
    .filter((f): f is File => !!f)
  if (!imagens.length) return

  const temTexto = Array.from(dados.types).includes('text/plain')
  if (temTexto && ehEditavel(e.target as Element | null)) return

  const alvo = escolherAlvo()
  if (!alvo) {
    // Várias áreas na tela e nenhuma sob o foco/mouse: melhor avisar do que
    // deixar o Ctrl+V sumir em silêncio.
    toast.info('Clique na parte onde o print deve entrar e cole de novo.')
    return
  }

  e.preventDefault()
  alvo.onImagens(imagens.map(renomear))
}

/**
 * Faz a área aceitar imagem colada (Ctrl+V / ⌘V).
 * `zona` é o elemento que delimita a área na tela; `ativo=false` tira do registro
 * (ex.: sem permissão de editar).
 */
export function useColarImagens(
  zona: RefObject<HTMLElement | null> | (() => HTMLElement | null),
  onImagens: (files: File[]) => void,
  ativo = true,
) {
  // Guarda a callback mais recente sem re-registrar a cada render.
  const cb = useRef(onImagens)
  const zonaRef = useRef(zona)
  useLayoutEffect(() => {
    cb.current = onImagens
    zonaRef.current = zona
  })

  useEffect(() => {
    if (!ativo) return
    const alvo: Alvo = {
      zona: () => {
        const z = zonaRef.current
        return typeof z === 'function' ? z() : z.current
      },
      onImagens: files => cb.current(files),
    }
    if (alvos.size === 0) {
      document.addEventListener('paste', aoColar)
      document.addEventListener('pointermove', aoMoverPonteiro, { passive: true })
    }
    alvos.add(alvo)
    return () => {
      alvos.delete(alvo)
      if (alvos.size === 0) {
        document.removeEventListener('paste', aoColar)
        document.removeEventListener('pointermove', aoMoverPonteiro)
      }
    }
  }, [ativo])
}
