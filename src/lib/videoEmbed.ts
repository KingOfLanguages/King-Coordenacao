// ─────────────────────────────────────────────────────────────────────────────
// URL de vídeo → URL de embed, para os blocos de vídeo do Welcome Path.
//
// A coordenação cola o link do jeito que copiou do navegador, e isso varia:
// /watch?v=, youtu.be/, /shorts/, /live/ e /embed/ são todos comuns. O app
// original só reconhecia os dois primeiros — qualquer outro formato caía num
// iframe apontando para a página do YouTube, que recusa ser embutida e mostra
// um quadrado em branco sem nenhum erro visível.
//
// youtube-nocookie.com: mesmo player, sem cookie de rastreio antes do play.
// ─────────────────────────────────────────────────────────────────────────────

export type VideoEmbed = { src: string; provedor: 'youtube' | 'vimeo' | 'arquivo' }

const YT_ID = /^[\w-]{11}$/

function idDoYouTube(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '')

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return YT_ID.test(id) ? id : null
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v')
    if (v && YT_ID.test(v)) return v

    // /shorts/<id>, /live/<id>, /embed/<id>, /v/<id>
    const partes = url.pathname.split('/').filter(Boolean)
    if (partes.length >= 2 && ['shorts', 'live', 'embed', 'v'].includes(partes[0])) {
      return YT_ID.test(partes[1]) ? partes[1] : null
    }
  }

  return null
}

/** Converte o link colado pela coordenação num src que pode ir para o iframe.
 *  Devolve null quando não é um vídeo reconhecível. */
export function videoEmbed(urlBruta: string | null | undefined): VideoEmbed | null {
  const bruta = (urlBruta ?? '').trim()
  if (!bruta) return null

  let url: URL
  try {
    url = new URL(bruta)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const yt = idDoYouTube(url)
  if (yt) {
    // `rel=0` mantém as sugestões do fim do vídeo dentro do mesmo canal — o
    // professor não termina a etapa caindo num vídeo aleatório.
    return { src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0`, provedor: 'youtube' }
  }

  const vimeo = url.hostname.replace(/^www\./, '') === 'vimeo.com'
    ? url.pathname.split('/').filter(Boolean)[0]
    : null
  if (vimeo && /^\d+$/.test(vimeo)) {
    return { src: `https://player.vimeo.com/video/${vimeo}`, provedor: 'vimeo' }
  }

  if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) {
    return { src: url.toString(), provedor: 'arquivo' }
  }

  return null
}
