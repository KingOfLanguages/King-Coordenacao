import { ImageOff, VideoOff } from 'lucide-react'
import { videoEmbed } from '@/lib/videoEmbed'
import { cn } from '@/lib/utils'
import type { BlocoEtapa } from '@/hooks/useWelcomePath'
import { CALLOUT_VARIANTES, varianteDoCallout } from './callout'

// ─────────────────────────────────────────────────────────────────────────────
// Renderização dos elementos de conteúdo de uma etapa.
//
// Os tipos espelham a área de materiais da King (KMS): h1, h2, text, video e
// callout são as mesmas chaves de lá, com a variante do callout em
// meta.calloutVariant. Assim a coordenação monta a trilha com o mesmo
// vocabulário que já usa na plataforma, e o conteúdo pode transitar entre os
// dois lados sem tradutor.
//
// `imagem` e `html` são extensões nossas: a trilha usa print de tela o tempo
// todo, e o conteúdo herdado do app antigo já veio escrito em HTML.
//
// Sobre o dangerouslySetInnerHTML do tipo `html`: é escrito pela coordenação
// (o editor é restrito a coordenacao/admin — ver pode_gerir_welcome_path na
// migration 20260739), nunca pelo professor.
// ─────────────────────────────────────────────────────────────────────────────

function BlocoVazio({ icone: Icone, texto }: { icone: typeof VideoOff; texto: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-line px-4 py-6 text-[12.5px] text-ink-muted">
      <Icone className="h-4 w-4 flex-shrink-0" />
      {texto}
    </div>
  )
}

function BlocoVideo({ bloco }: { bloco: BlocoEtapa }) {
  const embed = videoEmbed(bloco.url)

  if (!embed) {
    return <BlocoVazio icone={VideoOff} texto="O link deste vídeo não foi reconhecido. Avise a coordenação." />
  }

  if (embed.provedor === 'arquivo') {
    return (
      <video controls preload="metadata" className="w-full rounded-xl border border-line-soft bg-black">
        <source src={embed.src} />
      </video>
    )
  }

  return (
    <div className="aspect-video overflow-hidden rounded-xl border border-line-soft bg-black">
      <iframe
        src={embed.src}
        title={bloco.titulo ?? 'Vídeo da etapa'}
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  )
}

function BlocoImagem({ bloco }: { bloco: BlocoEtapa }) {
  if (!bloco.url) return <BlocoVazio icone={ImageOff} texto="Imagem não configurada." />
  return (
    <figure className="space-y-2">
      <img
        src={bloco.url}
        alt={bloco.titulo ?? ''}
        loading="lazy"
        className="w-full rounded-xl border border-line-soft"
      />
      {bloco.conteudo && (
        <figcaption className="text-[12px] text-ink-muted">{bloco.conteudo}</figcaption>
      )}
    </figure>
  )
}

function BlocoCallout({ bloco }: { bloco: BlocoEtapa }) {
  const variante = CALLOUT_VARIANTES[varianteDoCallout(bloco.meta)]
  const Icone = variante.icone
  return (
    <div className={cn('flex gap-3 rounded-xl border px-4 py-3.5', variante.cls)}>
      <Icone className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="min-w-0 space-y-1">
        {bloco.titulo && <p className="text-[13px] font-semibold">{bloco.titulo}</p>}
        {bloco.conteudo && (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{bloco.conteudo}</p>
        )}
      </div>
    </div>
  )
}

export function BlocoView({ bloco }: { bloco: BlocoEtapa }) {
  switch (bloco.tipo) {
    case 'h1':
      return (
        <h2 className="text-[19px] font-bold leading-snug tracking-[-0.02em] text-ink">
          {bloco.conteudo}
        </h2>
      )

    case 'h2':
      return (
        <h3 className="text-[15.5px] font-semibold leading-snug tracking-[-0.01em] text-ink">
          {bloco.conteudo}
        </h3>
      )

    case 'text':
      return (
        <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink-secondary">
          {bloco.conteudo}
        </p>
      )

    case 'callout':
      return <BlocoCallout bloco={bloco} />

    case 'video':
      return (
        <section className="space-y-2.5">
          {bloco.titulo && (
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{bloco.titulo}</h3>
          )}
          <BlocoVideo bloco={bloco} />
        </section>
      )

    case 'imagem':
      return <BlocoImagem bloco={bloco} />

    case 'html':
      return bloco.conteudo
        ? <div className="conteudo-etapa" dangerouslySetInnerHTML={{ __html: bloco.conteudo }} />
        : null

    default:
      return null
  }
}
