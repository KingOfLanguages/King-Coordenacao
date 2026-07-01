import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { usePortalLookup, type PortalLookupResult } from '@/hooks/usePortalAgendamento'
import { useTeacherLookup, type AgendaDisponivel as AgendaDisponivelType } from '@/hooks/useTeacherLookup'
import { useBookMeeting, type ReuniaoConfirmada } from '@/hooks/useBookMeeting'
import { OpcoesPortal } from '@/pages/agendamentos/OpcoesPortal'
import { AgendaDisponivel } from '@/pages/agendamentos/AgendaDisponivel'
import { Confirmacao } from '@/pages/agendamentos/Confirmacao'

type Step =
  | { tipo: 'identificacao' }
  | { tipo: 'opcoes'; email: string; resultado: PortalLookupResult }
  | { tipo: 'grupo-agendas'; email: string; professorNome: string; agendas: AgendaDisponivelType[] }
  | { tipo: 'confirmacao'; reuniao: ReuniaoConfirmada }

export function Home() {
  const [step, setStep] = useState<Step>({ tipo: 'identificacao' })
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')

  const lookup       = usePortalLookup()
  const teacherLookup = useTeacherLookup()
  const book          = useBookMeeting()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    try {
      const resultado = await lookup.mutateAsync({ nome: nome.trim(), email: email.trim() })
      if (!resultado.professor) {
        setErro('Não encontramos um cadastro ativo com esse nome e e-mail. Confira se digitou corretamente ou fale com sua coordenação.')
        return
      }
      setStep({ tipo: 'opcoes', email: email.trim(), resultado })
    } catch {
      setErro('Não foi possível buscar suas opções de agendamento agora. Tente novamente em instantes.')
    }
  }

  async function handleEscolherGrupo() {
    if (step.tipo !== 'opcoes') return
    try {
      const resultado = await teacherLookup.mutateAsync(step.email)
      if (!resultado.professor) {
        toast.error('Não foi possível carregar as reuniões em grupo agora.')
        return
      }
      setStep({
        tipo: 'grupo-agendas',
        email: step.email,
        professorNome: resultado.professor.nome,
        agendas: resultado.agendas,
      })
    } catch {
      toast.error('Não foi possível carregar as reuniões em grupo agora.')
    }
  }

  async function handleConfirmar(horarioId: string) {
    if (step.tipo !== 'grupo-agendas') return
    try {
      const { reuniao } = await book.mutateAsync({ email: step.email, horarioId })
      setStep({ tipo: 'confirmacao', reuniao })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao confirmar inscrição.'
      toast.error(msg)
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface-app flex items-center justify-center p-6">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: [
            'radial-gradient(ellipse 60% 50% at 15% 0%,   rgba(209,51,58,0.09),  transparent 55%)',
            'radial-gradient(ellipse 50% 40% at 90% 95%,  rgba(42,92,255,0.07),  transparent 60%)',
          ].join(','),
        }}
      />

      <div className="relative z-10 flex items-center justify-center w-full">
        {step.tipo === 'identificacao' && (
          <div className="w-full max-w-sm space-y-7">
            <div className="space-y-1.5">
              <h1 className="text-[1.85rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                Agendamento de Reuniões
              </h1>
              <p className="text-[14px] text-ink-muted leading-relaxed">
                Informe seu nome completo e o e-mail utilizado no seu cadastro como professor da King of
                Languages para ver as opções de agendamento disponíveis para você.
              </p>
            </div>

            <div className="rounded-[1.625rem] p-[1.5px] bg-surface-subtle border border-line-soft
                            shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]">
              <div className="rounded-[1.5rem] bg-surface-canvas px-6 py-7 space-y-5">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="nome" className="text-[12px] text-ink-secondary font-medium">
                      Nome completo
                    </Label>
                    <Input
                      id="nome"
                      type="text"
                      value={nome}
                      onChange={ev => setNome(ev.target.value)}
                      required
                      autoComplete="name"
                      placeholder="Seu nome completo"
                      className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-[12px] text-ink-secondary font-medium">
                      E-mail cadastrado
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={ev => setEmail(ev.target.value)}
                      required
                      autoComplete="email"
                      placeholder="professor@exemplo.com"
                      className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                    />
                  </div>

                  {erro && (
                    <div className="rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5
                                    text-[12.5px] text-brand-strong font-medium">
                      {erro}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={lookup.isPending}
                    className={cn(
                      'btn-press w-full h-11 rounded-full bg-ink text-white',
                      'flex items-center justify-center',
                      'hover:bg-ink/90 disabled:opacity-60 disabled:cursor-not-allowed',
                      'font-medium text-[13.5px]',
                    )}
                  >
                    {lookup.isPending ? 'Buscando…' : 'Continuar'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {step.tipo === 'opcoes' && (
          <OpcoesPortal
            professorNome={step.resultado.professor!.nome}
            resultado={step.resultado}
            onEscolherGrupo={handleEscolherGrupo}
            carregandoGrupo={teacherLookup.isPending}
          />
        )}

        {step.tipo === 'grupo-agendas' && (
          <AgendaDisponivel
            professorNome={step.professorNome}
            agendas={step.agendas}
            onConfirmar={handleConfirmar}
            pending={book.isPending}
          />
        )}

        {step.tipo === 'confirmacao' && <Confirmacao reuniao={step.reuniao} />}
      </div>
    </div>
  )
}
