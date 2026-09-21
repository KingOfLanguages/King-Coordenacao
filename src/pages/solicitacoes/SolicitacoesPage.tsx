import { Abas, type AbaDef } from '@/components/ui/abas'
import { useAbaUrl } from '@/hooks/useAbaUrl'
import { useCanView } from '@/hooks/usePagePermissions'
import { usePausasFila } from '@/hooks/usePausas'
import { useTransferenciasFila } from '@/hooks/useTransferencias'
import { AcompanhamentoPausasPage } from '@/pages/professores/AcompanhamentoPausasPage'
import { TransferenciasPage } from '@/pages/transferencias/TransferenciasPage'

// ─────────────────────────────────────────────────────────────────────────────
// Solicitações dos professores — Pausas e Transferências de aluno numa tela.
// Até 2026-09 eram dois itens de menu com o mesmo fluxo (formulário público →
// fila → assumir → concluir), o mesmo público (suporte e coordenação) e o link
// do formulário no topo. O contador de cada aba é a fila aberta dela, para ver
// de relance onde tem pedido esperando.
//
// Cada aba segue liberada pela própria chave de permissão ('retorno-pausa' e
// 'transferencias'). O aviso de transferência atrasada chega em
// /transferencias?pedido=<id>, que redireciona para cá preservando o pedido.
// ─────────────────────────────────────────────────────────────────────────────

type Aba = 'pausas' | 'transferencias'

export function SolicitacoesPage() {
  const { canView } = useCanView()
  const vePausas = canView('retorno-pausa')
  const veTransf = canView('transferencias')
  const { data: pausas = [] } = usePausasFila()
  const { data: transferencias = [] } = useTransferenciasFila()

  const abas: AbaDef<Aba>[] = [
    ...(vePausas ? [{ id: 'pausas' as const, label: 'Pausas', n: pausas.length, alerta: true }] : []),
    ...(veTransf ? [{ id: 'transferencias' as const, label: 'Transferências', n: transferencias.length, alerta: true }] : []),
  ]
  const ids = abas.map(a => a.id)
  const [aba, setAba] = useAbaUrl<Aba>(ids, ids[0] ?? 'pausas')

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Solicitações</h1>
          <p className="text-[13px] text-ink-muted">Pedidos que os professores mandam pelos formulários públicos.</p>
        </div>
        {abas.length > 1 && <Abas<Aba> ariaLabel="Solicitações" valor={aba} onChange={setAba} abas={abas} />}
      </header>

      {aba === 'pausas' && <AcompanhamentoPausasPage embutido />}
      {aba === 'transferencias' && <TransferenciasPage embutido />}
    </div>
  )
}
