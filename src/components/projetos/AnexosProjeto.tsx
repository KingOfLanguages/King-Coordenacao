import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileText, Upload, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useAnexosProjeto, useEnviarAnexo, useExcluirAnexo, urlAnexo,
  MAX_ANEXOS, TAMANHO_MAX_ANEXO, type AnexoProjeto,
} from '@/hooks/useProjetos'
import { fmtTamanho } from '@/lib/projetos'

// ─────────────────────────────────────────────────────────────────────────────
// PDFs com o desenho do projeto.
//
// O bucket é PRIVADO (diferente do de incidentes, que é público pra renderizar
// imagem direto): aqui é documento interno de planejamento, então cada abertura
// passa por uma URL assinada de 1h.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  projetoId: string
  podeEditar: boolean
}

export function AnexosProjeto({ projetoId, podeEditar }: Props) {
  const { data: anexos = [], isLoading } = useAnexosProjeto(projetoId)
  const enviar  = useEnviarAnexo()
  const excluir = useExcluirAnexo()
  const inputRef = useRef<HTMLInputElement>(null)
  const [abrindo, setAbrindo] = useState<string | null>(null)

  const cheio = anexos.length >= MAX_ANEXOS

  async function escolher(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      toast.error('Só PDF por aqui.')
      return
    }
    if (file.size > TAMANHO_MAX_ANEXO) {
      toast.error('O arquivo passa de 10 MB.')
      return
    }
    try {
      await enviar.mutateAsync({ projetoId, file })
      toast.success('Anexo enviado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para enviar o arquivo.')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function abrir(a: AnexoProjeto) {
    setAbrindo(a.id)
    try {
      const url = await urlAnexo(a.caminho)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para abrir o anexo.')
    } finally {
      setAbrindo(null)
    }
  }

  if (isLoading) {
    return <div className="h-14 animate-pulse rounded-lg bg-surface-subtle/50" />
  }

  return (
    <div className="space-y-2">
      {anexos.length === 0 && !podeEditar && (
        <p className="text-[12px] text-ink-muted">Nenhum PDF anexado.</p>
      )}

      {anexos.map(a => (
        <div key={a.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-canvas p-2.5">
          <FileText className="h-4 w-4 flex-shrink-0 text-urg-highFg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] text-ink">{a.nome}</p>
            {a.tamanho_bytes && (
              <p className="text-[11px] text-ink-muted tabular-nums">{fmtTamanho(a.tamanho_bytes)}</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => abrir(a)} disabled={abrindo === a.id}>
            {abrindo === a.id ? <Loader2 className="animate-spin" /> : <ExternalLink />}
            Abrir
          </Button>
          {podeEditar && (
            <button
              title="Remover anexo"
              onClick={() => excluir.mutate(a)}
              className="btn-press flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-urg-highBg hover:text-urg-highFg"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Remover anexo</span>
            </button>
          )}
        </div>
      ))}

      {podeEditar && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => escolher(e.target.files)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={enviar.isPending || cheio}
            className="w-full justify-center border border-dashed border-line"
          >
            {enviar.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
            {cheio ? `Limite de ${MAX_ANEXOS} arquivos` : enviar.isPending ? 'Enviando…' : 'Anexar PDF'}
          </Button>
        </>
      )}
    </div>
  )
}
