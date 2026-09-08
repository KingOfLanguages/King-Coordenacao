import { useState } from 'react'
import { toast } from 'sonner'
import { Link2, Plus, Trash2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLinksProjeto, useAdicionarLink, useExcluirLink } from '@/hooks/useProjetos'

// ─────────────────────────────────────────────────────────────────────────────
// Onde o projeto pode ser visto por inteiro: protótipo no Figma, pasta do
// Drive, planilha, documento.
//
// Área própria, separada dos anexos, de propósito: link muda sozinho, não tem
// dono aqui e não se baixa. Misturado com arquivo, o time não acha nenhum dos
// dois — e "o protótipo tá no Drive" é justamente o que o TI procura primeiro.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  projetoId: string
  podeEditar: boolean
}

/** Só o domínio, pra dar contexto sem poluir ("figma.com", "drive.google.com"). */
function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function LinksProjeto({ projetoId, podeEditar }: Props) {
  const { data: links = [], isLoading } = useLinksProjeto(projetoId)
  const adicionar = useAdicionarLink()
  const excluir   = useExcluirLink()

  const [titulo, setTitulo] = useState('')
  const [url, setUrl] = useState('')

  async function add() {
    if (!url.trim()) {
      toast.error('Cole o endereço do link.')
      return
    }
    try {
      await adicionar.mutateAsync({ projetoId, titulo, url })
      setTitulo(''); setUrl('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Endereço inválido — precisa ser um link http(s).')
    }
  }

  if (isLoading) return <div className="h-9 animate-pulse rounded-lg bg-surface-subtle/50" />

  return (
    <div className="space-y-2">
      {links.length === 0 && !podeEditar && (
        <p className="text-[12px] text-ink-muted">Nenhum link externo.</p>
      )}

      {links.map(l => (
        <div key={l.id} className="group flex items-center gap-2.5 rounded-lg border border-line bg-surface-canvas p-2.5">
          <Link2 className="h-4 w-4 flex-shrink-0 text-accentBlue" />
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1"
          >
            <span className="block truncate text-[12.5px] font-medium text-ink hover:underline">{l.titulo}</span>
            <span className="block truncate text-[11px] text-ink-muted">{dominio(l.url)}</span>
          </a>
          <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-ink-subtle" />
          {podeEditar && (
            <button
              title="Remover link"
              onClick={() => excluir.mutate(l.id)}
              className="btn-press flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-ink-muted opacity-0 transition-opacity hover:bg-urg-highBg hover:text-urg-highFg group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Remover link</span>
            </button>
          )}
        </div>
      ))}

      {podeEditar && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line p-2.5">
          <Input
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder="Nome (ex.: protótipo no Figma)"
            className="h-8 min-w-[150px] flex-1"
          />
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="Cole o endereço"
            className="h-8 min-w-[180px] flex-[1.5]"
          />
          <Button size="sm" onClick={add} disabled={adicionar.isPending}>
            <Plus /> Adicionar
          </Button>
        </div>
      )}
    </div>
  )
}
