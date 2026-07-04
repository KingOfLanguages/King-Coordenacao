import { cn } from '@/lib/utils'
import { faixaCls } from '@/hooks/useProfessorAcompanhamento'
import type { ObservacaoSnapshot } from '@/hooks/useObservacoes'

/** Renderiza a "foto do momento" congelada numa observação — reaproveitado
 *  tanto no bloco expansível de ProfessorDetalhePage quanto na tela
 *  dedicada ObservacaoDetalhePage. Mostra sempre o estado congelado no
 *  snapshot, nunca dados live de professor_acompanhamento. */
export function ObservacaoSnapshotDetalhe({ snapshot, compact = false }: {
  snapshot: ObservacaoSnapshot
  compact?: boolean
}) {
  if (!snapshot.acompanhamento_encontrado) {
    return (
      <p className="text-[11.5px] text-ink-subtle italic">
        Nenhum dado de acompanhamento disponível no momento da criação desta observação.
      </p>
    )
  }

  const itens: { label: string; valor: string }[] = [
    { label: 'Pendências',        valor: `${snapshot.aulas_pendentes_qtd} aula(s)` },
    { label: 'Faltas (professor)', valor: `${snapshot.faltas_professor?.quantidade ?? 0}` },
    { label: 'No-show 1ª aula',   valor: `${snapshot.no_show_primeira_aula?.quantidade ?? 0}` },
    { label: 'Agendas bloqueadas', valor: `${snapshot.agendas_bloqueadas?.quantidade_horarios ?? 0}` },
    { label: 'Trocas de professor', valor: `${snapshot.trocas_professor?.length ?? 0}` },
    { label: 'Alunos',             valor: `${snapshot.quantidade_alunos}` },
  ]

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-ink-muted">Score no momento</span>
        <span className={cn('text-ink font-semibold tabular-nums', compact ? 'text-[13px]' : 'text-lg')}>
          {snapshot.score_atual ?? '—'}
        </span>
        {snapshot.score_faixa && (
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', faixaCls[snapshot.score_faixa] ?? 'bg-surface-subtle text-ink-secondary')}>
            {snapshot.score_faixa}
          </span>
        )}
        <span className="text-[11px] text-ink-muted">
          {snapshot.elegivel_alocacao ? 'Elegível para alocação' : 'Não elegível para alocação'}
        </span>
      </div>

      <div className={cn('grid gap-x-4 gap-y-1.5 text-[12px]', compact ? 'grid-cols-2' : 'grid-cols-3')}>
        {itens.map(item => (
          <div key={item.label} className="flex items-baseline justify-between gap-2">
            <span className="text-ink-muted">{item.label}</span>
            <span className="text-ink tabular-nums font-medium">{item.valor}</span>
          </div>
        ))}
      </div>

      {snapshot.reuniao_status && (
        <p className="text-[11.5px] text-ink-muted">
          Reunião de monitoramento: <span className="text-ink capitalize">{snapshot.reuniao_status.replace(/_/g, ' ')}</span>
        </p>
      )}

      {snapshot.api_atualizado_em && (
        <p className="text-[10.5px] text-ink-subtle">
          Dado do KMS atualizado em {new Date(snapshot.api_atualizado_em).toLocaleString('pt-BR')} · foto capturada em {new Date(snapshot.capturado_em).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  )
}
