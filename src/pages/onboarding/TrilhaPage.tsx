import { Route, Users, KeyRound, Clock3, PencilRuler, Eye, BarChart3 } from 'lucide-react'
import { Abas, type AbaDef } from '@/components/ui/abas'
import { useAbaUrl } from '@/hooks/useAbaUrl'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { useAcompanhamentoTrilha, useConfigTrilha } from '@/hooks/useWelcomePathAdmin'
import { WelcomePathTab } from './WelcomePathTab'
import { AcessoTab } from './AcessoTab'
import { RevisoesTab } from './RevisoesTab'
import { ConteudoTab } from './ConteudoTab'
import { VisaoProfessorTab } from './VisaoProfessorTab'
import { PainelTrilhaTab } from './PainelTrilhaTab'

// ─────────────────────────────────────────────────────────────────────────────
// Área do Welcome Path (/trilha) — desde 22/10/2026, tudo da trilha num lugar:
//
//   Professores         onde cada um está: o que pede ação, o funil por fase e
//                       a lista, com o painel do professor ao lado
//   Acesso e convites   quem pode fazer a trilha (o grupo do RH) e o convite
//   Revisões            as dissertativas esperando nota, de todo mundo
//   Conteúdo            o material da trilha (só coordenação/suporte/admin edita)
//   Visão do professor  a trilha como o professor vê, nada gravado
//   Painel              como o conteúdo funciona: onde param, tempo, questões
//
// Era a tela /onboarding, que juntava a trilha com o checklist de Mensagens da
// coordenação. O checklist foi aposentado e a trilha ganhou item próprio no
// menu — é a tela principal do cargo RH (que também consulta Professores).
// ─────────────────────────────────────────────────────────────────────────────

type Aba = 'professores' | 'acesso' | 'revisoes' | 'conteudo' | 'visao' | 'painel'

export function TrilhaPage() {
  const { profile } = useAuth()
  const podeEditarConteudo = canEdit(profile)
  const { data: acompanhamento = [] } = useAcompanhamentoTrilha()
  const { data: config } = useConfigTrilha()
  const revisoes = acompanhamento.reduce((s, l) => s + l.revisoes_pendentes, 0)

  const abas: AbaDef<Aba>[] = [
    { id: 'professores', label: 'Professores', icone: Users },
    { id: 'acesso',      label: 'Acesso e convites', icone: KeyRound },
    { id: 'revisoes',    label: 'Revisões', icone: Clock3, n: revisoes, alerta: true },
    ...(podeEditarConteudo ? [{ id: 'conteudo' as const, label: 'Conteúdo', icone: PencilRuler }] : []),
    { id: 'visao',       label: 'Visão do professor', icone: Eye },
    { id: 'painel',      label: 'Painel', icone: BarChart3 },
  ]
  const ids = abas.map(a => a.id)
  const [aba, setAba] = useAbaUrl<Aba>(ids, 'professores')

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Route className="h-5 w-5 text-ink-secondary" />
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Welcome Path</h1>
        </div>
        {config && (
          <span className={
            config.so_liberados
              ? 'rounded-full bg-aviso-warnBg px-3 py-1 text-[11.5px] font-medium text-aviso-warnFg'
              : 'rounded-full bg-surface-subtle px-3 py-1 text-[11.5px] font-medium text-ink-secondary'
          }>
            {config.so_liberados ? 'Só liberados entram · convite manual' : 'Aberta a todos · convite manual'}
          </span>
        )}
      </header>

      <Abas<Aba> ariaLabel="Welcome Path" valor={aba} onChange={setAba} abas={abas} />

      {aba === 'professores' && <WelcomePathTab onIrAcesso={() => setAba('acesso')} />}
      {aba === 'acesso'      && <AcessoTab />}
      {aba === 'revisoes'    && <RevisoesTab />}
      {aba === 'conteudo'    && podeEditarConteudo && <ConteudoTab />}
      {aba === 'visao'       && <VisaoProfessorTab />}
      {aba === 'painel'      && <PainelTrilhaTab />}
    </div>
  )
}
