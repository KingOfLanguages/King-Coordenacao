import { useState } from 'react'
import { GraduationCap, MessageSquare, Route, PencilRuler, Eye, BarChart3 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { MensagensTab } from './MensagensTab'
import { WelcomePathTab } from './WelcomePathTab'
import { ConteudoTab } from './ConteudoTab'
import { VisaoProfessorTab } from './VisaoProfessorTab'
import { PainelTrilhaTab } from './PainelTrilhaTab'
import { Abas } from '@/components/ui/abas'

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding de professores — os dois acompanhamentos do mesmo recém-chegado,
// numa tela só:
//
//   Mensagens     o que a COORDENAÇÃO manda nos 7 primeiros dias (checklist)
//   Welcome Path  o que o PROFESSOR percorre sozinho na trilha
//   Painel da     como o conteúdo funciona: onde param, tempo real,
//   trilha        questões que mais derrubam
//   Visão do      a trilha exatamente como o professor vê, com tudo aberto e
//   professor     nada gravado, para conferir o conteúdo
//   Conteúdo      o material da trilha (só coordenação/admin edita)
//
// Antes o Welcome Path era um app separado, com login próprio. Juntar aqui é o
// que permite olhar um professor e ver as duas coisas de uma vez.
// ─────────────────────────────────────────────────────────────────────────────

type Aba = 'mensagens' | 'trilha' | 'painel' | 'visao' | 'conteudo'

export function OnboardingPage() {
  const { profile } = useAuth()
  const podeEditarConteudo = canEdit(profile)
  const [aba, setAba] = useState<Aba>('mensagens')

  const abas: { id: Aba; label: string; icone: typeof Route }[] = [
    { id: 'mensagens', label: 'Mensagens',    icone: MessageSquare },
    { id: 'trilha',    label: 'Welcome Path', icone: Route },
    { id: 'painel',    label: 'Painel da trilha', icone: BarChart3 },
    { id: 'visao',     label: 'Visão do professor', icone: Eye },
    ...(podeEditarConteudo
      ? [{ id: 'conteudo' as const, label: 'Conteúdo', icone: PencilRuler }]
      : []),
  ]

  // Largura folgada de propósito: a aba Mensagens tem 11 colunas (nome+tag,
  // telefone, início e os 7 dias) e precisam caber todas sem rolagem lateral.
  return (
    <div className="mx-auto max-w-[1560px] space-y-5 px-6 py-6">
      <header className="space-y-0.5">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-ink-secondary" />
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Onboarding de Professores</h1>
        </div>
      </header>

      <Abas<Aba>
        ariaLabel="Onboarding"
        valor={aba}
        onChange={setAba}
        abas={abas.map(a => ({ id: a.id, label: a.label, icone: a.icone }))}
      />

      {aba === 'mensagens' && <MensagensTab />}
      {aba === 'trilha'    && <WelcomePathTab />}
      {aba === 'painel'    && <PainelTrilhaTab />}
      {aba === 'visao'     && <VisaoProfessorTab />}
      {aba === 'conteudo'  && podeEditarConteudo && <ConteudoTab />}
    </div>
  )
}
