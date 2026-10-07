import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { AvisoErro, FundoPortal } from '@/components/portal/PortalUI'
import { IdentificacaoPortal } from '@/components/portal/IdentificacaoPortal'
import { sessaoRecusada } from '@/lib/invocarFuncao'
import { usePortalSessao } from '@/hooks/usePortalIdentidade'
import { useOpcoesAgendamento, useDeclararNaoFezReuniao } from '@/hooks/usePortalAgendamento'
import { useTeacherLookup, type AgendaDisponivel as AgendaDisponivelType } from '@/hooks/useTeacherLookup'
import { useBookMeeting, type ReuniaoConfirmada } from '@/hooks/useBookMeeting'
import { OpcoesPortal } from '@/pages/agendamentos/OpcoesPortal'
import { AgendaDisponivel } from '@/pages/agendamentos/AgendaDisponivel'
import { Confirmacao } from '@/pages/agendamentos/Confirmacao'

// ─────────────────────────────────────────────────────────────────────────────
// Portal público de agendamento (/agendar). A entrada é a de todos os portais
// do professor (código no e-mail oficial — ver IdentificacaoPortal); as opções,
// as agendas em grupo e a reserva saem do servidor pela sessão.
// ─────────────────────────────────────────────────────────────────────────────

type Step =
  | { tipo: 'opcoes' }
  | { tipo: 'grupo-agendas'; professorNome: string; agendas: AgendaDisponivelType[] }
  | { tipo: 'confirmacao'; reuniao: ReuniaoConfirmada }

export function Home() {
  const { token, entrar, sair, invalidar } = usePortalSessao()
  const [step, setStep] = useState<Step>({ tipo: 'opcoes' })
  /** A faixa "já fez o acompanhamento do mês" some depois do "não aconteceu". */
  const [avisoDispensado, setAvisoDispensado] = useState(false)

  const opcoes         = useOpcoesAgendamento(token)
  const teacherLookup  = useTeacherLookup()
  const book           = useBookMeeting()
  const declararNaoFez = useDeclararNaoFezReuniao()

  if (token && opcoes.isError && sessaoRecusada(opcoes.error)) invalidar()

  function falhou(e: unknown, padrao: string) {
    if (sessaoRecusada(e)) { invalidar(); return }
    toast.error(e instanceof Error ? e.message : padrao)
  }

  async function handleSair() {
    setStep({ tipo: 'opcoes' })
    setAvisoDispensado(false)
    await sair()
  }

  async function handleEscolherGrupo() {
    if (!token) return
    try {
      const resultado = await teacherLookup.mutateAsync({ token })
      if (!resultado.professor) {
        toast.error('Não foi possível carregar as reuniões em grupo agora.')
        return
      }
      setStep({ tipo: 'grupo-agendas', professorNome: resultado.professor.nome, agendas: resultado.agendas })
    } catch (e) {
      falhou(e, 'Não foi possível carregar as reuniões em grupo agora.')
    }
  }

  /** "Essa reunião não aconteceu": libera a cadência e apaga a faixa. */
  async function handleDeclararNaoFez() {
    const aviso = opcoes.data?.avisoAgendamentoRecente
    if (!token || !aviso) return
    try {
      await declararNaoFez.mutateAsync({ token, reuniaoProfessorId: aviso.reuniaoProfessorId })
      setAvisoDispensado(true)
    } catch (e) {
      falhou(e, 'Não foi possível registrar agora. Tente novamente.')
    }
  }

  async function handleConfirmar(horarioId: string) {
    if (!token) return
    try {
      const { reuniao } = await book.mutateAsync({ token, horarioId })
      setStep({ tipo: 'confirmacao', reuniao })
    } catch (e) {
      falhou(e, 'Erro ao confirmar inscrição.')
    }
  }

  const resultado = opcoes.data
    ? { ...opcoes.data, avisoAgendamentoRecente: avisoDispensado ? null : opcoes.data.avisoAgendamentoRecente }
    : null

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface-app flex items-center justify-center p-6">
      <FundoPortal />

      <div className="relative z-10 flex items-center justify-center w-full">
        {!token && (
          <IdentificacaoPortal
            icone={CalendarClock}
            titulo="Agendamento de Reuniões"
            descricao="Pra ver suas opções de agendamento, informe seu e-mail cadastrado."
            onEntrar={entrar}
          />
        )}

        {token && step.tipo === 'opcoes' && (
          opcoes.isLoading ? (
            <p className="text-[13px] text-ink-muted">Carregando…</p>
          ) : resultado ? (
            <div className="flex w-full flex-col items-center gap-4">
              <OpcoesPortal
                professorNome={resultado.professor.nome}
                resultado={resultado}
                onEscolherGrupo={handleEscolherGrupo}
                carregandoGrupo={teacherLookup.isPending}
                pendingDeclarar={declararNaoFez.isPending}
                onDeclararNaoFez={handleDeclararNaoFez}
              />
              <button
                type="button"
                onClick={() => void handleSair()}
                className="btn-press text-[12px] text-ink-muted hover:text-ink-secondary"
              >
                Não é você? Sair
              </button>
            </div>
          ) : (
            <div className="w-full max-w-sm">
              <AvisoErro>Não foi possível carregar suas opções agora. Recarregue a página em instantes.</AvisoErro>
            </div>
          )
        )}

        {token && step.tipo === 'grupo-agendas' && (
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
