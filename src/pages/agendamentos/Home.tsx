import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { usePortalLookup, type PortalLookupResult } from '@/hooks/usePortalAgendamento'
import { useTeacherLookup, type AgendaDisponivel as AgendaDisponivelType } from '@/hooks/useTeacherLookup'
import { useBookMeeting, type ReuniaoConfirmada } from '@/hooks/useBookMeeting'
import { OpcoesPortal } from '@/pages/agendamentos/OpcoesPortal'
import { AgendaDisponivel } from '@/pages/agendamentos/AgendaDisponivel'
import { Confirmacao } from '@/pages/agendamentos/Confirmacao'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 9 }, (_, i) => ANO_ATUAL - i)

const MENSAGEM_GENERICA = 'Não conseguimos confirmar seu cadastro. Confira o nome digitado ou fale com sua coordenação.'
const MENSAGEM_FINAL = 'Não conseguimos confirmar automaticamente quem você é. Fale com sua coordenação pra agendar.'

type Tentativa = 1 | 2 | 3

type Step =
  | { tipo: 'identificacao'; tentativa: Tentativa; nome: string; erro: string }
  | { tipo: 'confirmar-identidade'; resultado: PortalLookupResult }
  | { tipo: 'opcoes'; resultado: PortalLookupResult }
  | { tipo: 'grupo-agendas'; professorId: string; professorNome: string; agendas: AgendaDisponivelType[] }
  | { tipo: 'confirmacao'; reuniao: ReuniaoConfirmada }

export function Home() {
  const [step, setStep] = useState<Step>({ tipo: 'identificacao', tentativa: 1, nome: '', erro: '' })
  const [mes, setMes] = useState<number | null>(null)
  const [ano, setAno] = useState<number | null>(null)

  const lookup        = usePortalLookup()
  const teacherLookup = useTeacherLookup()
  const book          = useBookMeeting()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (step.tipo !== 'identificacao') return
    const nomeAtual = step.nome.trim()
    if (nomeAtual.length < 3) {
      setStep({ ...step, erro: 'Digite ao menos 3 letras do seu nome.' })
      return
    }
    if (step.tentativa === 3 && (mes == null || ano == null)) {
      setStep({ ...step, erro: 'Selecione o mês e o ano em que você começou.' })
      return
    }

    try {
      const resultado = await lookup.mutateAsync({
        nome: nomeAtual,
        ...(step.tentativa === 3 && mes != null && ano != null ? { mesInicio: mes, anoInicio: ano } : {}),
      })

      if (resultado.professor) {
        setStep({ tipo: 'confirmar-identidade', resultado })
        return
      }

      if (resultado.ambiguo && step.tentativa < 3) {
        setStep({ tipo: 'identificacao', tentativa: (step.tentativa + 1) as Tentativa, nome: nomeAtual, erro: '' })
        return
      }

      setStep({ ...step, nome: nomeAtual, erro: step.tentativa === 3 ? MENSAGEM_FINAL : MENSAGEM_GENERICA })
    } catch {
      setStep({ ...step, erro: 'Não foi possível verificar seu cadastro agora. Tente novamente em instantes.' })
    }
  }

  function recomecar() {
    setMes(null)
    setAno(null)
    setStep({ tipo: 'identificacao', tentativa: 1, nome: '', erro: '' })
  }

  async function handleEscolherGrupo() {
    if (step.tipo !== 'opcoes' || !step.resultado.professor) return
    const professorId = step.resultado.professor.id
    try {
      const resultado = await teacherLookup.mutateAsync({ professorId })
      if (!resultado.professor) {
        toast.error('Não foi possível carregar as reuniões em grupo agora.')
        return
      }
      setStep({
        tipo: 'grupo-agendas',
        professorId,
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
      const { reuniao } = await book.mutateAsync({ professorId: step.professorId, horarioId })
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
                {step.tentativa === 1 && 'Informe seu nome para ver as opções de agendamento disponíveis para você.'}
                {step.tentativa === 2 && 'Encontramos mais de uma pessoa com esse nome. Digite seu nome completo, como está no seu cadastro.'}
                {step.tentativa === 3 && 'Ainda encontramos mais de uma pessoa. Pra confirmar quem é você, informe também o mês e o ano em que começou na King.'}
              </p>
            </div>

            <div className="rounded-[1.625rem] p-[1.5px] bg-surface-subtle border border-line-soft
                            shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]">
              <div className="rounded-[1.5rem] bg-surface-canvas px-6 py-7 space-y-5">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="nome" className="text-[12px] text-ink-secondary font-medium">
                      Nome {step.tentativa >= 2 ? 'completo' : ''}
                    </Label>
                    <Input
                      id="nome"
                      type="text"
                      value={step.nome}
                      onChange={ev => setStep({ ...step, nome: ev.target.value })}
                      required
                      autoComplete="name"
                      placeholder="Seu nome completo"
                      className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                    />
                  </div>

                  {step.tentativa === 3 && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[12px] text-ink-secondary font-medium">Mês de início</Label>
                        <Select value={mes ? String(mes) : undefined} onValueChange={v => setMes(Number(v))}>
                          <SelectTrigger className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl">
                            <SelectValue placeholder="Mês" />
                          </SelectTrigger>
                          <SelectContent>
                            {MESES.map((m, i) => (
                              <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[12px] text-ink-secondary font-medium">Ano de início</Label>
                        <Select value={ano ? String(ano) : undefined} onValueChange={v => setAno(Number(v))}>
                          <SelectTrigger className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl">
                            <SelectValue placeholder="Ano" />
                          </SelectTrigger>
                          <SelectContent>
                            {ANOS.map(a => (
                              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {step.erro && (
                    <div className="rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5
                                    text-[12.5px] text-brand-strong font-medium space-y-2">
                      <p>{step.erro}</p>
                      {step.tentativa === 3 && step.erro === MENSAGEM_FINAL && (
                        <button type="button" onClick={recomecar} className="underline underline-offset-2">
                          Tentar novamente
                        </button>
                      )}
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

        {step.tipo === 'confirmar-identidade' && step.resultado.professor && (
          <div className="w-full max-w-sm space-y-6 text-center">
            <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
              Você é {step.resultado.professor.nome}?
            </h1>
            <p className="text-[13px] text-ink-muted">Confirme pra ver suas opções de agendamento.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={recomecar}
                className="btn-press h-10 px-5 rounded-full border border-line-soft text-[13px] font-medium text-ink-secondary hover:bg-surface-subtle"
              >
                Não sou eu
              </button>
              <button
                onClick={() => setStep({ tipo: 'opcoes', resultado: step.resultado })}
                className="btn-press h-10 px-5 rounded-full bg-ink text-white text-[13px] font-medium hover:bg-ink/90"
              >
                Sim, sou eu
              </button>
            </div>
          </div>
        )}

        {step.tipo === 'opcoes' && step.resultado.professor && (
          <OpcoesPortal
            professorNome={step.resultado.professor.nome}
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
