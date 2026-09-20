import { Abas, type AbaDef } from '@/components/ui/abas'
import { useAbaUrl } from '@/hooks/useAbaUrl'
import { useCanView } from '@/hooks/usePagePermissions'
import { DashboardCoordPage } from './DashboardCoordPage'
import { DashboardGeralPage } from './DashboardGeralPage'
import { RetencaoPage } from '@/pages/retencao/RetencaoPage'

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — uma tela, três abas. Até 2026-09 eram três itens de menu:
// "Dashboard da Coordenação", "Dashboard Geral" e "Turnover & Retenção", e o
// Geral já repetia as zonas de meta de reuniões e de turnover das outras duas.
//
// Cada aba segue liberada pela própria chave de permissão ('dashboard',
// 'dashboard-geral', 'retencao'), então os overrides já salvos continuam valendo.
// ─────────────────────────────────────────────────────────────────────────────

type Aba = 'coordenacao' | 'geral' | 'retencao'

const ABAS: (AbaDef<Aba> & { chave: string })[] = [
  { id: 'coordenacao', label: 'Coordenação',        chave: 'dashboard' },
  { id: 'geral',       label: 'Geral',              chave: 'dashboard-geral' },
  { id: 'retencao',    label: 'Turnover & Retenção', chave: 'retencao' },
]

export function DashboardPage() {
  const { canView } = useCanView()
  const visiveis = ABAS.filter(a => canView(a.chave))
  const ids = visiveis.map(a => a.id)
  const [aba, setAba] = useAbaUrl<Aba>(ids, ids[0] ?? 'coordenacao')

  return (
    <div className="px-6 py-6 max-w-[1320px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Dashboard</h1>
        {visiveis.length > 1 && <Abas<Aba> ariaLabel="Dashboard" valor={aba} onChange={setAba} abas={visiveis} />}
      </header>

      {aba === 'coordenacao' && <DashboardCoordPage embutido />}
      {aba === 'geral' && <DashboardGeralPage embutido />}
      {aba === 'retencao' && <RetencaoPage embutido />}
    </div>
  )
}
