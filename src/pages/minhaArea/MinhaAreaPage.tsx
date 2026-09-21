import { Abas, type AbaDef } from '@/components/ui/abas'
import { useAbaUrl } from '@/hooks/useAbaUrl'
import { useCanView } from '@/hooks/usePagePermissions'
import { useAuth } from '@/contexts/AuthContext'
import { useParaFazer } from '@/hooks/useParaFazer'
import { ParaFazer } from '@/components/minhaArea/ParaFazer'
import { ProjetosPage } from '@/pages/projetos/ProjetosPage'

// ─────────────────────────────────────────────────────────────────────────────
// Minha Área — o que está na minha mão ao longo do dia. Até 2026-09 eram três
// itens de menu com nove abas no total:
//   Tarefas     (/convocacoes) Tarefas | Mensagens do dia | Convocações
//   Projetos    (/projetos)    Aguardando | Em andamento | Encerrados | Rascunhos
//   Minha Área  (/minha-area)  Anotações | Projetos
// Agora: "Para fazer" (uma lista por prazo, com as Mensagens do dia no topo e
// as anotações ao lado) e "Projetos" (o quadro de sempre). O kanban de
// Convocações saiu: 209 de 212 estavam paradas em "aguardando contato".
//
// A tela Hoje segue sendo o radar do time; a Minha Área é o que é MEU.
// Cada parte continua liberada pela própria chave de permissão
// ('minha-area' = anotações, 'convocacoes' = tarefas e mensagens, 'projetos').
// ─────────────────────────────────────────────────────────────────────────────

type Aba = 'fazer' | 'projetos'

export function MinhaAreaPage() {
  const { profile } = useAuth()
  const { canView } = useCanView()

  const veAnotacoes = canView('minha-area')
  const veTarefas = canView('convocacoes')
  const veProjetos = canView('projetos')
  // Mensagens do dia e agenda são pessoais: só quem tem a própria lista.
  const veMensagens = veTarefas && (profile?.role === 'coordenacao' || profile?.role === 'admin')

  const { total } = useParaFazer({ tarefas: veTarefas, projetos: veProjetos, mensagens: veMensagens })

  const abas: AbaDef<Aba>[] = [
    ...(veAnotacoes || veTarefas || veProjetos ? [{ id: 'fazer' as const, label: 'Para fazer', n: total || undefined, alerta: true }] : []),
    ...(veProjetos ? [{ id: 'projetos' as const, label: 'Projetos' }] : []),
  ]
  const ids = abas.map(a => a.id)
  const [aba, setAba] = useAbaUrl<Aba>(ids, 'fazer')

  return (
    <div className="px-6 py-6 max-w-[1320px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Minha Área</h1>
          <p className="text-[13px] text-ink-muted">
            {aba === 'fazer' ? 'O que está com você, do mais urgente ao que pode esperar.' : 'Projetos da King, da sugestão à entrega.'}
          </p>
        </div>
        {abas.length > 1 && <Abas<Aba> ariaLabel="Minha Área" valor={aba} onChange={setAba} abas={abas} />}
      </header>

      {aba === 'fazer' && (
        <ParaFazer veTarefas={veTarefas} veProjetos={veProjetos} veMensagens={veMensagens} veAnotacoes={veAnotacoes} />
      )}
      {aba === 'projetos' && <ProjetosPage />}
    </div>
  )
}
