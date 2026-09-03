import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { CircleHelp, FolderKanban, Plus, Send, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNomesPorPerfilId } from '@/hooks/usePerfisPublicos'
import {
  useMeusProjetos, useProjetos, useResponderInfo, type Projeto,
} from '@/hooks/useProjetos'
import { NovoProjetoDialog } from '@/components/projetos/NovoProjetoDialog'
import { ProjetoDetalheDialog } from '@/components/projetos/ProjetoDetalheDialog'
import {
  FASE_LABEL, PRIORIDADE_META, STATUS_META, TIPO_LABEL,
  FAIXA_PRAZO_CLS, prazoProjeto, fmtData,
} from '@/lib/projetos'
import { cn } from '@/lib/utils'

/**
 * Aba "Projetos" da Minha Área: o que EU sugeri (ou toco) e — o ponto central —
 * as perguntas da liderança que estão esperando resposta minha. É aqui que o
 * pedido de informação chega; o sino aponta para esta tela.
 */
export function MeusProjetosPanel() {
  const { projetos, pedidosAbertos, isLoading } = useMeusProjetos()
  const { data: todos = [] } = useProjetos()
  const { mapa: nomes } = useNomesPorPerfilId()
  const responder = useResponderInfo()

  const [novo, setNovo] = useState(false)
  const [detalhe, setDetalhe] = useState<Projeto | null>(null)
  const [respostas, setRespostas] = useState<Record<string, string>>({})

  const tituloDoProjeto = (id: string) => todos.find(p => p.id === id)?.titulo ?? 'Projeto'

  async function enviarResposta(id: string) {
    const texto = (respostas[id] ?? '').trim()
    if (!texto) return
    try {
      await responder.mutateAsync({ id, resposta: texto })
      toast.success('Resposta enviada para quem perguntou.')
      setRespostas(r => ({ ...r, [id]: '' }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao responder.')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card-surface h-24 animate-pulse bg-surface-subtle/50 p-4" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Perguntas esperando por mim ── */}
      {pedidosAbertos.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-aviso-warnFg">
            <CircleHelp className="h-3.5 w-3.5" />
            Pedidos de informação esperando você ({pedidosAbertos.length})
          </h2>
          {pedidosAbertos.map(q => (
            <div key={q.id} className="rounded-lg border border-aviso-warnBd bg-aviso-warnBg/40 p-3.5 space-y-2.5">
              <div className="space-y-0.5">
                <p className="text-[12.5px] font-medium text-ink">{tituloDoProjeto(q.projeto_id)}</p>
                <p className="text-[10.5px] uppercase tracking-wide text-ink-muted">
                  {nomes.get(q.solicitado_por ?? '') ?? 'Liderança'} perguntou · {fmtData(q.created_at)}
                </p>
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-secondary">{q.pergunta}</p>
              <textarea
                value={respostas[q.id] ?? ''}
                onChange={e => setRespostas(r => ({ ...r, [q.id]: e.target.value }))}
                rows={3}
                placeholder="Sua resposta…"
                className="w-full resize-y rounded-md border border-line bg-surface-canvas px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accentBlue"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={() => enviarResposta(q.id)} disabled={responder.isPending}>
                  <Send /> Responder
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Meus projetos ── */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            <FolderKanban className="h-3.5 w-3.5" />
            Projetos que eu sugeri ou conduzo
          </h2>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/projetos">Ver todos <ArrowUpRight /></Link>
            </Button>
            <Button size="sm" onClick={() => setNovo(true)}>
              <Plus /> Sugerir
            </Button>
          </div>
        </div>

        {projetos.length === 0 ? (
          <div className="card-surface flex flex-col items-center justify-center gap-2 py-12 text-center">
            <FolderKanban className="h-7 w-7 text-ink-subtle" />
            <p className="text-[13px] font-medium text-ink-secondary">Você ainda não sugeriu nenhum projeto.</p>
            <p className="max-w-xs text-[12px] text-ink-muted">
              Viu uma melhoria de sistema ou de processo que faria diferença? Mande pra liderança avaliar.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {projetos.map(p => {
              const st = STATUS_META[p.status]
              const prazo = prazoProjeto(p.data_entrega, p.fase)
              return (
                <button
                  key={p.id}
                  onClick={() => setDetalhe(p)}
                  className="card-surface w-full space-y-2 p-3.5 text-left transition-colors hover:bg-surface-subtle/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[13.5px] font-medium text-ink">{p.titulo}</p>
                    <span className={cn('flex-shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium', st.cls)}>
                      {p.status === 'aprovado' ? FASE_LABEL[p.fase] : st.label}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-[12px] leading-relaxed text-ink-muted">{p.descricao}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10.5px] font-medium text-ink-secondary">
                      {TIPO_LABEL[p.tipo]}
                    </span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-medium', PRIORIDADE_META[p.prioridade].cls)}>
                      {PRIORIDADE_META[p.prioridade].label}
                    </span>
                    {p.status === 'aprovado' && (
                      <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-medium', FAIXA_PRAZO_CLS[prazo.faixa])}>
                        {prazo.texto}
                      </span>
                    )}
                  </div>
                  {p.status === 'recusado' && p.motivo_decisao && (
                    <p className="border-l-2 border-line pl-2 text-[11.5px] leading-relaxed text-ink-muted">
                      {p.motivo_decisao}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>

      <NovoProjetoDialog open={novo} onOpenChange={setNovo} />
      <ProjetoDetalheDialog
        open={!!detalhe}
        onOpenChange={v => { if (!v) setDetalhe(null) }}
        projeto={detalhe ? todos.find(p => p.id === detalhe.id) ?? detalhe : null}
      />
    </div>
  )
}
