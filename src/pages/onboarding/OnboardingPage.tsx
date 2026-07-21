import { useState } from 'react'
import { GraduationCap, MessageSquare, Route, PencilRuler } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { MensagensTab } from './MensagensTab'
import { WelcomePathTab } from './WelcomePathTab'
import { ConteudoTab } from './ConteudoTab'

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding de professores — os dois acompanhamentos do mesmo recém-chegado,
// numa tela só:
//
//   Mensagens     o que a COORDENAÇÃO manda nos 7 primeiros dias (checklist)
//   Welcome Path  o que o PROFESSOR percorre sozinho na trilha
//   Conteúdo      o material da trilha (só coordenação/admin edita)
//
// Antes o Welcome Path era um app separado, com login próprio. Juntar aqui é o
// que permite olhar um professor e ver as duas coisas de uma vez.
// ─────────────────────────────────────────────────────────────────────────────

type Aba = 'mensagens' | 'trilha' | 'conteudo'

export function OnboardingPage() {
  const { profile } = useAuth()
  const podeEditarConteudo = canEdit(profile)
  const [aba, setAba] = useState<Aba>('mensagens')

  const abas: { id: Aba; label: string; icone: typeof Route }[] = [
    { id: 'mensagens', label: 'Mensagens',    icone: MessageSquare },
    { id: 'trilha',    label: 'Welcome Path', icone: Route },
    ...(podeEditarConteudo
      ? [{ id: 'conteudo' as const, label: 'Conteúdo', icone: PencilRuler }]
      : []),
  ]

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-6 py-6">
      <header className="space-y-0.5">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-ink-secondary" />
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Onboarding de Professores</h1>
        </div>
      </header>

      <nav className="flex items-center gap-1 border-b border-line-soft">
        {abas.map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={cn(
              'btn-press -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              aba === a.id
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-muted hover:text-ink-secondary',
            )}
          >
            <a.icone className="h-4 w-4" />
            {a.label}
          </button>
        ))}
      </nav>

      {aba === 'mensagens' && <MensagensTab />}
      {aba === 'trilha'    && <WelcomePathTab />}
      {aba === 'conteudo'  && podeEditarConteudo && <ConteudoTab />}
    </div>
  )
}
