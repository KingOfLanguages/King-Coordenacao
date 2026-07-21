import { useState } from 'react'
import {
  ChevronUp, ChevronDown, Plus, Pencil, Trash2, Eye, EyeOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LinkTrilha } from './LinkTrilha'
import {
  useEtapasAdmin, useCriarEtapa, useExcluirEtapa, useMoverEtapa, useSalvarEtapa,
  type EtapaAdmin,
} from '@/hooks/useWelcomePathAdmin'
import { EditarEtapaDialog } from './EditarEtapaDialog'

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Conteúdo": as etapas da trilha e o material de cada uma.
//
// No app original a Bianca editava um textarea de HTML sem ver o resultado —
// o editor de etapa aqui mostra o preview ao lado, com o mesmo CSS que o
// professor enxerga (.conteudo-etapa).
// ─────────────────────────────────────────────────────────────────────────────

/** Campo numérico que grava no blur. Vazio = null (sem prazo / sem trava de data). */
function CampoNumero({
  label, valor, onSalvar, dica, largura = 'w-20',
}: {
  label: string
  valor: number | null
  onSalvar: (v: number | null) => void
  dica?: string
  largura?: string
}) {
  const [texto, setTexto] = useState(valor == null ? '' : String(valor))
  const [anterior, setAnterior] = useState(valor)
  if (valor !== anterior) {
    setAnterior(valor)
    setTexto(valor == null ? '' : String(valor))
  }

  function gravar() {
    if (texto.trim() === '') {
      if (valor !== null) onSalvar(null)
      return
    }
    const n = Number(texto)
    // Lixo digitado volta ao valor do banco em vez de virar NaN na coluna.
    if (!Number.isFinite(n)) {
      setTexto(valor == null ? '' : String(valor))
      return
    }
    if (n !== valor) onSalvar(n)
  }

  return (
    <label className="flex flex-col gap-1" title={dica}>
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      <input
        type="number"
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onBlur={gravar}
        className={cn(
          'h-8 rounded-lg border border-line bg-surface-canvas px-2 text-[12.5px] tabular-nums text-ink',
          'focus:border-accentBlue focus:outline-none focus:ring-2 focus:ring-accentBlue-soft',
          largura,
        )}
      />
    </label>
  )
}

function LinhaEtapa({
  etapa, primeira, ultima, onEditar,
}: {
  etapa: EtapaAdmin
  primeira: boolean
  ultima: boolean
  onEditar: () => void
}) {
  const salvar = useSalvarEtapa()
  const mover = useMoverEtapa()
  const excluir = useExcluirEtapa()

  function patch(campos: Partial<EtapaAdmin>) {
    salvar.mutate({ id: etapa.id, ...campos }, {
      onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'),
    })
  }

  return (
    <li className={cn(
      'rounded-2xl border p-4',
      etapa.ativa ? 'border-line-soft bg-surface-canvas' : 'border-dashed border-line bg-surface-canvas/50',
    )}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            disabled={primeira || mover.isPending}
            onClick={() => mover.mutate({ id: etapa.id, direcao: -1 })}
            className="btn-press rounded p-0.5 text-ink-muted hover:bg-surface-subtle hover:text-ink disabled:opacity-30"
            title="Subir"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={ultima || mover.isPending}
            onClick={() => mover.mutate({ id: etapa.id, direcao: 1 })}
            className="btn-press rounded p-0.5 text-ink-muted hover:bg-surface-subtle hover:text-ink disabled:opacity-30"
            title="Descer"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-subtle text-[12.5px] font-semibold text-ink-secondary">
          {etapa.ordem}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <input
            value={etapa.titulo}
            onChange={e => patch({ titulo: e.target.value })}
            placeholder="Título da etapa"
            className="w-full bg-transparent text-[14.5px] font-semibold tracking-[-0.01em] text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          <input
            value={etapa.descricao}
            onChange={e => patch({ descricao: e.target.value })}
            placeholder="Descrição curta (aparece no card da trilha)"
            className="w-full bg-transparent text-[12.5px] text-ink-muted placeholder:text-ink-subtle focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm" variant="outline"
            className="btn-press h-8 gap-1.5 border-line text-[12px]"
            onClick={onEditar}
          >
            <Pencil className="h-3.5 w-3.5" /> Conteúdo
          </Button>
          <button
            type="button"
            onClick={() => patch({ ativa: !etapa.ativa })}
            title={etapa.ativa ? 'Publicada — clique para esconder do professor' : 'Escondida — clique para publicar'}
            className="btn-press rounded-md p-1.5 text-ink-muted hover:bg-surface-subtle hover:text-ink"
          >
            {etapa.ativa ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm(`Excluir a etapa ${etapa.ordem} e todo o conteúdo dela? O progresso dos professores nesta etapa também se perde.`)) return
              excluir.mutate(etapa.id, {
                onSuccess: () => toast.success('Etapa excluída'),
                onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível excluir.'),
              })
            }}
            title="Excluir etapa"
            className="btn-press rounded-md p-1.5 text-ink-muted hover:bg-surface-subtle hover:text-urg-highFg"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4 border-t border-line-soft pt-3">
        <CampoNumero
          label="Nota mínima %"
          valor={etapa.nota_minima}
          dica="Percentual de acerto para concluir a etapa e liberar a próxima."
          onSalvar={v => patch({ nota_minima: Math.min(100, Math.max(0, v ?? 80)) })}
        />
        <CampoNumero
          label="Prazo (dias)"
          valor={etapa.prazo_dias}
          dica="Prazo contado do primeiro dia do professor. Vazio = sem prazo. Alimenta o alerta de atraso."
          onSalvar={v => patch({ prazo_dias: v == null ? null : Math.max(1, v) })}
        />
        <CampoNumero
          label="Abre no dia"
          valor={etapa.liberacao_dia}
          dica="Dia mínimo (desde o início do professor) em que a etapa abre, mesmo com a anterior concluída. Vazio = abre assim que a anterior conclui."
          onSalvar={v => patch({ liberacao_dia: v == null ? null : Math.max(1, v) })}
        />
        <label className="flex items-center gap-2 pb-1.5 text-[12.5px] text-ink-secondary">
          <input
            type="checkbox"
            checked={etapa.obrigatoria}
            onChange={e => patch({ obrigatoria: e.target.checked })}
            className="h-3.5 w-3.5 accent-current"
          />
          Obrigatória
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-ink-muted">
            Recado da coordenação (o professor vê)
          </span>
          <input
            value={etapa.notas_coordenacao ?? ''}
            onChange={e => patch({ notas_coordenacao: e.target.value || null })}
            placeholder="Opcional…"
            className="h-8 w-full rounded-lg border border-line bg-surface-canvas px-2 text-[12.5px] text-ink placeholder:text-ink-subtle focus:border-accentBlue focus:outline-none focus:ring-2 focus:ring-accentBlue-soft"
          />
        </label>
      </div>
    </li>
  )
}

export function ConteudoTab() {
  const { data: etapas = [], isLoading } = useEtapasAdmin()
  const criar = useCriarEtapa()
  const [editando, setEditando] = useState<EtapaAdmin | null>(null)

  // A lista pode mudar debaixo do dialog (salvar título, reordenar): pega
  // sempre a versão fresca da etapa aberta, senão o dialog congela dados velhos.
  const etapaAberta = editando ? etapas.find(e => e.id === editando.id) ?? null : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-ink-muted">
          O material que o professor percorre. A ordem aqui é a ordem da trilha, e cada etapa só abre
          quando a anterior é concluída. Etapas escondidas não aparecem para ninguém.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <LinkTrilha />
          <Button
            size="sm"
            className="btn-press h-9 gap-1.5"
            disabled={criar.isPending}
            onClick={() => criar.mutate(
              (etapas.at(-1)?.ordem ?? 0) + 1,
              {
                onSuccess: () => toast.success('Etapa criada'),
                onError: e => toast.error(e instanceof Error ? e.message : 'Não foi possível criar.'),
              },
            )}
          >
            <Plus className="h-4 w-4" /> Nova etapa
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">Carregando…</div>
      ) : etapas.length === 0 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          Nenhuma etapa ainda. Clique em "Nova etapa" para começar.
        </div>
      ) : (
        <ul className="space-y-3">
          {etapas.map((e, i) => (
            <LinhaEtapa
              key={e.id}
              etapa={e}
              primeira={i === 0}
              ultima={i === etapas.length - 1}
              onEditar={() => setEditando(e)}
            />
          ))}
        </ul>
      )}

      {etapaAberta && (
        <EditarEtapaDialog etapa={etapaAberta} onFechar={() => setEditando(null)} />
      )}
    </div>
  )
}
