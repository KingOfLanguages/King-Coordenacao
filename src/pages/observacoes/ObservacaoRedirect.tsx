import { Navigate, useParams } from 'react-router-dom'
import { useObservacao } from '@/hooks/useObservacoes'

/**
 * /observacoes/:id → página do professor dono da observação.
 *
 * Até 2026-09 havia uma página só para a observação, mas ela repetia o card que
 * já existe no Detalhe do professor (texto, "marcar como resolvida" e o
 * contexto no momento). Links antigos continuam chegando no lugar certo.
 */
export function ObservacaoRedirect() {
  const { id } = useParams<{ id: string }>()
  const { data: observacao, isLoading } = useObservacao(id)

  if (isLoading) return (
    <div className="flex h-64 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
  )
  if (!observacao?.professor) return <Navigate to="/professores" replace />
  return <Navigate to={`/professores/${observacao.professor.id}`} replace />
}
