import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useAdicionarEtapa, useEditarEtapa, useExcluirEtapa, useTrocarOrdemEtapas,
  type EtapaProjeto,
} from '@/hooks/useProjetos'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Editor das etapas do projeto.
//
// O TI pede um fluxograma; quem sugere raramente sabe desenhar um. Então a
// pessoa lista os passos em ordem e o desenho sai daqui (ver Fluxograma).
// Reordenar é com setas, não arrastando: a lista é curta e arrastar dentro de
// um diálogo rolável é sofrível no celular.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  projetoId: string
  etapas: EtapaProjeto[]
}

export function EditorEtapas({ projetoId, etapas }: Props) {
  const adicionar = useAdicionarEtapa()
  const editar    = useEditarEtapa()
  const excluir   = useExcluirEtapa()
  const trocar    = useTrocarOrdemEtapas()

  const [novo, setNovo] = useState('')
  const [quem, setQuem] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState({ titulo: '', quem_faz: '' })

  async function add() {
    const titulo = novo.trim()
    if (titulo.length < 3) {
      toast.error('Escreva o passo com pelo menos três letras.')
      return
    }
    try {
      const ordem = etapas.length ? Math.max(...etapas.map(e => e.ordem)) + 1 : 0
      await adicionar.mutateAsync({ projetoId, titulo, quem_faz: quem, ordem })
      setNovo(''); setQuem('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para adicionar a etapa.')
    }
  }

  async function mover(i: number, delta: number) {
    const a = etapas[i]
    const b = etapas[i + delta]
    if (!a || !b) return
    try {
      await trocar.mutateAsync({ a, b })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para reordenar.')
    }
  }

  async function salvarEdicao(id: string) {
    if (rascunho.titulo.trim().length < 3) {
      toast.error('O passo ficou curto demais.')
      return
    }
    try {
      await editar.mutateAsync({
        id, titulo: rascunho.titulo.trim(), quem_faz: rascunho.quem_faz.trim() || null,
      })
      setEditando(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para salvar a etapa.')
    }
  }

  return (
    <div className="space-y-2">
      {etapas.length === 0 && (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-ink-subtle">
          Nenhuma etapa ainda. Comece pelo que acontece primeiro.
        </p>
      )}

      {etapas.map((e, i) => {
        const emEdicao = editando === e.id
        return (
          <div key={e.id} className="flex items-start gap-2 rounded-lg border border-line bg-surface-canvas p-2.5">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accentBlue-soft text-[10.5px] font-semibold text-accentBlue">
              {i + 1}
            </span>

            {emEdicao ? (
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  value={rascunho.titulo}
                  onChange={ev => setRascunho({ ...rascunho, titulo: ev.target.value })}
                  placeholder="O que acontece neste passo"
                  className="h-8"
                />
                <Input
                  value={rascunho.quem_faz}
                  onChange={ev => setRascunho({ ...rascunho, quem_faz: ev.target.value })}
                  placeholder="Quem faz (opcional)"
                  className="h-8"
                />
                <div className="flex items-center gap-1.5">
                  <Button size="sm" onClick={() => salvarEdicao(e.id)} disabled={editar.isPending}>
                    <Check /> Salvar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                    <X /> Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] leading-snug text-ink">{e.titulo}</p>
                {e.quem_faz && (
                  <p className="mt-0.5 text-[11px] text-ink-muted">Quem faz: {e.quem_faz}</p>
                )}
              </div>
            )}

            {!emEdicao && (
              <div className="flex flex-shrink-0 items-center gap-0.5">
                <IconBtn titulo="Subir" disabled={i === 0 || trocar.isPending} onClick={() => mover(i, -1)}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn titulo="Descer" disabled={i === etapas.length - 1 || trocar.isPending} onClick={() => mover(i, 1)}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn
                  titulo="Editar"
                  onClick={() => { setEditando(e.id); setRascunho({ titulo: e.titulo, quem_faz: e.quem_faz ?? '' }) }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn titulo="Remover" perigo onClick={() => excluir.mutate(e.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line p-2.5">
        <Input
          value={novo}
          onChange={ev => setNovo(ev.target.value)}
          onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); add() } }}
          placeholder={etapas.length === 0 ? 'Primeiro passo: o que acontece?' : 'Próximo passo…'}
          className="h-8 min-w-[180px] flex-1"
        />
        <Input
          value={quem}
          onChange={ev => setQuem(ev.target.value)}
          onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); add() } }}
          placeholder="Quem faz"
          className="h-8 w-full sm:w-32"
        />
        <Button size="sm" onClick={add} disabled={adicionar.isPending}>
          <Plus /> Adicionar
        </Button>
      </div>
    </div>
  )
}

function IconBtn({ titulo, onClick, disabled, perigo, children }: {
  titulo: string; onClick: () => void; disabled?: boolean; perigo?: boolean; children: React.ReactNode
}) {
  return (
    <button
      title={titulo}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'btn-press flex h-6 w-6 items-center justify-center rounded-md text-ink-muted transition-colors disabled:opacity-30',
        perigo ? 'hover:bg-urg-highBg hover:text-urg-highFg' : 'hover:bg-surface-subtle hover:text-ink',
      )}
    >
      {children}
      <span className="sr-only">{titulo}</span>
    </button>
  )
}
