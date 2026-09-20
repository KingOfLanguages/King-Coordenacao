import { Abas, type AbaDef } from '@/components/ui/abas'
import { useAbaUrl } from '@/hooks/useAbaUrl'
import { useCanView } from '@/hooks/usePagePermissions'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { IndiceAtencao } from './IndiceAtencao'
import { CentralPendenciasPage } from '@/pages/pendencias/CentralPendenciasPage'
import { MesAnalisePage } from '@/pages/mesAnalise/MesAnalisePage'

// ─────────────────────────────────────────────────────────────────────────────
// Acompanhamento — a gestão dos professores numa tela só. Até 2026-09 eram
// quatro itens de menu sobre os mesmos professores:
//   Índice de atenção   era "Índice de Prioridade" (/acompanhamento)
//   Pendências do King  era "Central de Pendências" (/pendencias)
//   Mês de Análise      era /mes-analise
//   E-mail              era "Disparo de E-mails" (/emails) — virou ação do Índice
//
// Cada aba segue liberada pela própria chave de permissão, então os overrides
// já salvos no banco continuam valendo.
// ─────────────────────────────────────────────────────────────────────────────

type Aba = 'atencao' | 'pendencias' | 'mes-analise'

export function AcompanhamentoPage() {
  const { profile } = useAuth()
  const { canView } = useCanView()
  // O Índice também aparece para quem só tinha a tela de e-mails: é nele que se
  // seleciona quem recebe.
  const podeEmail = canView('emails') && (canEdit(profile) || profile?.is_lider === true)

  const abas: AbaDef<Aba>[] = [
    ...(canView('acompanhamento') || podeEmail ? [{ id: 'atencao' as const, label: 'Índice de atenção' }] : []),
    ...(canView('pendencias') ? [{ id: 'pendencias' as const, label: 'Pendências do King' }] : []),
    ...(canView('mes-analise') ? [{ id: 'mes-analise' as const, label: 'Mês de Análise' }] : []),
  ]
  const ids = abas.map(a => a.id)
  const [aba, setAba] = useAbaUrl<Aba>(ids, ids[0] ?? 'atencao')

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Acompanhamento</h1>
        {abas.length > 1 && <Abas<Aba> ariaLabel="Acompanhamento" valor={aba} onChange={setAba} abas={abas} />}
      </header>

      {aba === 'atencao' && <IndiceAtencao />}
      {aba === 'pendencias' && <CentralPendenciasPage embutido />}
      {aba === 'mes-analise' && <MesAnalisePage embutido />}
    </div>
  )
}
