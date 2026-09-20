import { Abas, type AbaDef } from '@/components/ui/abas'
import { useAbaUrl } from '@/hooks/useAbaUrl'
import { useCanView } from '@/hooks/usePagePermissions'
import { ReunioesDiaPage } from './ReunioesDiaPage'
import { SuporteReunioesPage } from '@/pages/suporte/SuporteReunioesPage'
import { AgendasPage } from '@/pages/admin/AgendasPage'

// ─────────────────────────────────────────────────────────────────────────────
// Reuniões — uma tela para tudo que é reunião. Até 2026-09 eram três itens de
// menu em dois grupos diferentes:
//   Agenda                 era "Reuniões do Dia" (/reunioes-dia) — coordenação
//   Buscar por professor   era "Buscar Reuniões" (/suporte/reunioes) — suporte,
//                          e ficava no grupo Professores
//   Configurar agendas     era "Agendas" (/admin/agendas) — horários do portal
//                          de agendamento e os links de cada coordenador
//
// Cada aba segue liberada pela própria chave de permissão: o suporte continua
// vendo só a busca (leitura), a coordenação ganha a busca junto da agenda.
// ─────────────────────────────────────────────────────────────────────────────

type Aba = 'agenda' | 'buscar' | 'agendas'

export function ReunioesPage() {
  const { canView } = useCanView()
  const veAgenda = canView('reunioes-dia')
  const abas: AbaDef<Aba>[] = [
    ...(veAgenda ? [{ id: 'agenda' as const, label: 'Agenda' }] : []),
    ...(veAgenda || canView('suporte-reunioes') ? [{ id: 'buscar' as const, label: 'Buscar por professor' }] : []),
    ...(canView('agendas') ? [{ id: 'agendas' as const, label: 'Configurar agendas' }] : []),
  ]
  const ids = abas.map(a => a.id)
  const [aba, setAba] = useAbaUrl<Aba>(ids, ids[0] ?? 'agenda')

  return (
    <div className="px-6 py-6 max-w-[1200px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Reuniões</h1>
        {abas.length > 1 && <Abas<Aba> ariaLabel="Reuniões" valor={aba} onChange={setAba} abas={abas} />}
      </header>

      {aba === 'agenda' && <ReunioesDiaPage embutido />}
      {aba === 'buscar' && <SuporteReunioesPage embutido />}
      {aba === 'agendas' && <AgendasPage embutido />}
    </div>
  )
}
