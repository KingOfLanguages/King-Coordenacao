import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileText, ImagePlus, Trash2, ExternalLink, Loader2, X } from 'lucide-react'
import {
  useAnexosProjeto, useEnviarAnexo, useExcluirAnexo, limiteDoArquivo,
  MAX_ARQUIVOS_SECAO, type AnexoProjeto,
} from '@/hooks/useProjetos'
import { ehImagem, fmtTamanho, type ProjetoSecao } from '@/lib/projetos'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Imagens (e PDFs) de UMA parte da ficha.
//
// A primeira ficha real veio com zero anexos porque só aceitávamos PDF: o que a
// pessoa tem é print com seta. Aqui a imagem entra grudada na seção que ela
// explica e aparece junto do texto — quem lê não precisa cruzar "figura 3".
//
// O bucket é privado; a url assinada já vem resolvida do hook.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  projetoId: string
  secao: ProjetoSecao
  podeEditar: boolean
  /** Texto do botão. O padrão serve para a maioria das seções. */
  rotulo?: string
}

export function ArquivosSecao({ projetoId, secao, podeEditar, rotulo }: Props) {
  const { data: todos = [], isLoading } = useAnexosProjeto(projetoId)
  const enviar   = useEnviarAnexo()
  const excluir  = useExcluirAnexo()
  const inputRef = useRef<HTMLInputElement>(null)
  const [ampliada, setAmpliada] = useState<AnexoProjeto | null>(null)

  const arquivos = todos.filter(a => a.secao === secao)
  const cheio = arquivos.length >= MAX_ARQUIVOS_SECAO

  async function escolher(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    const limite = limiteDoArquivo(file)
    if (!limite.ok) {
      toast.error(limite.erro!)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    try {
      await enviar.mutateAsync({ projetoId, file, secao })
      toast.success('Arquivo anexado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para enviar o arquivo.')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (isLoading) return <div className="h-9 animate-pulse rounded-lg bg-surface-subtle/50" />
  if (!podeEditar && arquivos.length === 0) return null

  return (
    <div className="space-y-2">
      {arquivos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {arquivos.map(a => (
            <figure key={a.id} className="group relative">
              {ehImagem(a.mime) && a.url ? (
                <button
                  onClick={() => setAmpliada(a)}
                  className="btn-press block overflow-hidden rounded-lg border border-line"
                  title={`Ampliar ${a.nome}`}
                >
                  <img
                    src={a.url}
                    alt={a.nome}
                    loading="lazy"
                    className="h-28 w-auto max-w-[220px] object-cover"
                  />
                </button>
              ) : (
                <a
                  href={a.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-28 w-[180px] flex-col justify-between rounded-lg border border-line bg-surface-canvas p-2.5 transition-colors hover:bg-surface-subtle/40"
                >
                  <FileText className="h-4 w-4 text-urg-highFg" />
                  <span className="line-clamp-2 text-[11.5px] leading-snug text-ink">{a.nome}</span>
                  <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-muted">
                    <ExternalLink className="h-3 w-3" />{fmtTamanho(a.tamanho_bytes)}
                  </span>
                </a>
              )}

              {podeEditar && (
                <button
                  title="Remover"
                  onClick={() => excluir.mutate(a)}
                  className="btn-press absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface-canvas/90 text-ink-muted opacity-0 transition-opacity hover:text-urg-highFg group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="sr-only">Remover</span>
                </button>
              )}
            </figure>
          ))}
        </div>
      )}

      {podeEditar && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={e => escolher(e.target.files)}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={enviar.isPending || cheio}
            className={cn(
              'btn-press inline-flex items-center gap-1.5 rounded-md border border-dashed border-line px-2.5 py-1.5',
              'text-[11.5px] text-ink-muted transition-colors hover:text-ink disabled:opacity-50',
            )}
          >
            {enviar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            {cheio
              ? `Limite de ${MAX_ARQUIVOS_SECAO} arquivos nesta parte`
              : enviar.isPending ? 'Enviando…' : (rotulo ?? 'Anexar imagem ou PDF')}
          </button>
        </>
      )}

      {/* Lightbox: print de tela é inútil em 28px de altura. */}
      {ampliada?.url && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setAmpliada(null)}
          role="presentation"
        >
          <img
            src={ampliada.url}
            alt={ampliada.nome}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          <button
            onClick={() => setAmpliada(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-surface-canvas text-ink"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Fechar</span>
          </button>
        </div>
      )}
    </div>
  )
}
