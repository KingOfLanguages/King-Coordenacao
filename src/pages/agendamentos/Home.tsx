import { useState } from 'react'
import { CalendarClock, Phone, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { usePortalLookup, useDeclararNaoFezReuniao, type PortalLookupResult } from '@/hooks/usePortalAgendamento'
import { useTeacherLookup, type AgendaDisponivel as AgendaDisponivelType } from '@/hooks/useTeacherLookup'
import { useBookMeeting, type ReuniaoConfirmada } from '@/hooks/useBookMeeting'
import { OpcoesPortal } from '@/pages/agendamentos/OpcoesPortal'
import { AvisoAgendamentoRecente } from '@/pages/agendamentos/AvisoAgendamentoRecente'
import { AgendaDisponivel } from '@/pages/agendamentos/AgendaDisponivel'
import { Confirmacao } from '@/pages/agendamentos/Confirmacao'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 9 }, (_, i) => ANO_ATUAL - i)

// Contato da coordenação de professores (solução de desafios) quando não
// conseguimos identificar o professor nem por e-mail nem por nome completo.
const COORD_WHATSAPP_NUM = '5511913027763'
const COORD_TELEFONE     = '+55 11 91302-7763'

/** Iniciais do professor (primeiro + último nome) pro avatar da confirmação. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primeira = partes[0][0]
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type Step =
  | { tipo: 'identificacao-email'; email: string; erro: string }
  // tentativa: 1ª ou 2ª tentativa de nome. desempate: pede mês/ano (nomes idênticos).
  | { tipo: 'identificacao'; tentativa: 1 | 2; desempate: boolean; nome: string; erro: string; emailInformado: string }
  // Achou pelo nome → pede o e-mail pra cadastrar antes de seguir.
  | { tipo: 'cadastro-email'; resultado: PortalLookupResult; email: string; erro: string }
  | { tipo: 'confirmar-identidade'; resultado: PortalLookupResult }
  | { tipo: 'aviso-agendamento-recente'; resultado: PortalLookupResult }
  | { tipo: 'opcoes'; resultado: PortalLookupResult }
  | { tipo: 'contato-coordenacao' }
  | { tipo: 'grupo-agendas'; professorId: string; professorNome: string; agendas: AgendaDisponivelType[] }
  | { tipo: 'confirmacao'; reuniao: ReuniaoConfirmada }

export function Home() {
  const [step, setStep] = useState<Step>({ tipo: 'identificacao-email', email: '', erro: '' })
  const [mes, setMes] = useState<number | null>(null)
  const [ano, setAno] = useState<number | null>(null)

  const lookup           = usePortalLookup()
  const teacherLookup    = useTeacherLookup()
  const book             = useBookMeeting()
  const declararNaoFez   = useDeclararNaoFezReuniao()

  async function handleSubmitEmail(e: React.FormEvent) {
    e.preventDefault()
    if (step.tipo !== 'identificacao-email') return
    const emailAtual = step.email.trim()
    if (!EMAIL_RE.test(emailAtual)) {
      setStep({ ...step, erro: 'Digite um e-mail válido.' })
      return
    }

    try {
      const resultado = await lookup.mutateAsync({ email: emailAtual })

      if (resultado.professor) {
        // E-mail bateu → confirma o nome e segue.
        setStep({ tipo: 'confirmar-identidade', resultado })
        return
      }

      // E-mail não bateu → pede o nome completo (guardando o e-mail informado
      // pra pré-preencher o cadastro quando o professor for identificado).
      setStep({ tipo: 'identificacao', tentativa: 1, desempate: false, nome: '', erro: '', emailInformado: emailAtual })
    } catch {
      setStep({ ...step, erro: 'Não foi possível verificar seu cadastro agora. Tente novamente em instantes.' })
    }
  }

  async function handleSubmitNome(e: React.FormEvent) {
    e.preventDefault()
    if (step.tipo !== 'identificacao') return
    const nomeAtual = step.nome.trim()
    if (nomeAtual.length < 3) {
      setStep({ ...step, erro: 'Digite ao menos 3 letras do seu nome.' })
      return
    }
    if (step.desempate && (mes == null || ano == null)) {
      setStep({ ...step, erro: 'Selecione o mês e o ano em que você começou.' })
      return
    }

    try {
      const resultado = await lookup.mutateAsync({
        nome: nomeAtual,
        ...(step.emailInformado ? { email: step.emailInformado } : {}),
        ...(step.desempate && mes != null && ano != null ? { mesInicio: mes, anoInicio: ano } : {}),
      })

      if (resultado.professor) {
        // Nome completo bateu → pede o e-mail pra cadastrar.
        setStep({ tipo: 'cadastro-email', resultado, email: step.emailInformado, erro: '' })
        return
      }

      if (resultado.ambiguo) {
        // Mais de uma pessoa com o mesmo nome. Se ainda não pedimos mês/ano, pede;
        // se já pedimos e continua ambíguo, manda pro contato da coordenação.
        if (!step.desempate) {
          setStep({ ...step, nome: nomeAtual, desempate: true, erro: '' })
        } else {
          setStep({ tipo: 'contato-coordenacao' })
        }
        return
      }

      // Não encontrado. 1ª tentativa → reforça "nome completo" e deixa tentar de
      // novo; 2ª tentativa (ou desempate sem match) → contato da coordenação.
      if (step.desempate || step.tentativa >= 2) {
        setStep({ tipo: 'contato-coordenacao' })
      } else {
        setStep({ ...step, nome: nomeAtual, tentativa: 2, erro: 'reforco' })
      }
    } catch {
      setStep({ ...step, erro: 'Não foi possível verificar seu cadastro agora. Tente novamente em instantes.' })
    }
  }

  async function handleCadastroEmail(e: React.FormEvent) {
    e.preventDefault()
    if (step.tipo !== 'cadastro-email' || !step.resultado.professor) return
    const emailAtual = step.email.trim()
    if (!EMAIL_RE.test(emailAtual)) {
      setStep({ ...step, erro: 'Digite um e-mail válido.' })
      return
    }
    try {
      // Reenvia com professorId + e-mail → o servidor cadastra o e-mail e devolve
      // as opções de agendamento já com o professor resolvido.
      const resultado = await lookup.mutateAsync({ professorId: step.resultado.professor.id, email: emailAtual })
      if (resultado.professor) {
        handleConfirmarIdentidade(resultado)
      } else {
        setStep({ ...step, erro: 'Não foi possível concluir agora. Tente novamente.' })
      }
    } catch {
      setStep({ ...step, erro: 'Não foi possível concluir agora. Tente novamente.' })
    }
  }

  function recomecar() {
    setMes(null)
    setAno(null)
    setStep({ tipo: 'identificacao-email', email: '', erro: '' })
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

  function handleConfirmarIdentidade(resultado: PortalLookupResult) {
    if (resultado.avisoAgendamentoRecente) {
      setStep({ tipo: 'aviso-agendamento-recente', resultado })
    } else {
      setStep({ tipo: 'opcoes', resultado })
    }
  }

  async function handleDeclararNaoFez() {
    if (step.tipo !== 'aviso-agendamento-recente' || !step.resultado.professor || !step.resultado.avisoAgendamentoRecente) return
    try {
      await declararNaoFez.mutateAsync({
        professorId: step.resultado.professor.id,
        reuniaoProfessorId: step.resultado.avisoAgendamentoRecente.reuniaoProfessorId,
      })
      setStep({ tipo: 'opcoes', resultado: { ...step.resultado, avisoAgendamentoRecente: null } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível registrar agora. Tente novamente.')
    }
  }

  function handleSoTirarDuvida() {
    if (step.tipo !== 'aviso-agendamento-recente') return
    setStep({ tipo: 'opcoes', resultado: step.resultado })
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
        {step.tipo === 'identificacao-email' && (
          <div className="w-full max-w-sm space-y-6 animate-fade-up">
            <div className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accentBlue-soft text-accentBlue shadow-inner-top">
                <CalendarClock className="h-6 w-6" />
              </div>
              <div className="space-y-1.5">
                <span className="label-micro flex items-center gap-1.5 text-accentBlue">
                  <span className="h-1.5 w-1.5 rounded-full bg-accentBlue" />
                  Portal do professor
                </span>
                <h1 className="text-[1.85rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Agendamento de Reuniões
                </h1>
                <p className="text-[14px] text-ink-muted leading-relaxed">
                  Informe seu e-mail cadastrado para ver as opções de agendamento disponíveis para você.
                </p>
              </div>
            </div>

            <div className="rounded-[1.625rem] p-[1.5px] bg-surface-subtle border border-line-soft
                            shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]">
              <div className="rounded-[1.5rem] bg-surface-canvas px-6 py-7 space-y-5">
                <form onSubmit={handleSubmitEmail} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-[12px] text-ink-secondary font-medium">
                      E-mail
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      inputMode="email"
                      value={step.email}
                      onChange={ev => setStep({ ...step, email: ev.target.value })}
                      required
                      autoComplete="email"
                      placeholder="seu.email@exemplo.com"
                      className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                    />
                  </div>

                  {step.erro && (
                    <div className="rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5
                                    text-[12.5px] text-brand-strong font-medium">
                      <p>{step.erro}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={lookup.isPending}
                    className={cn(
                      'btn-press w-full h-11 rounded-full bg-ink text-ink-inverse',
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

        {step.tipo === 'identificacao' && (
          <div className="w-full max-w-sm space-y-6 animate-fade-up">
            <div className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accentBlue-soft text-accentBlue shadow-inner-top">
                <CalendarClock className="h-6 w-6" />
              </div>
              <div className="space-y-1.5">
                <span className="label-micro flex items-center gap-1.5 text-accentBlue">
                  <span className="h-1.5 w-1.5 rounded-full bg-accentBlue" />
                  Portal do professor
                </span>
                <h1 className="text-[1.85rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Agendamento de Reuniões
                </h1>
                <p className="text-[14px] text-ink-muted leading-relaxed">
                  {step.desempate
                    ? 'Encontramos mais de uma pessoa com esse nome. Pra confirmar quem é você, informe também o mês e o ano em que começou na King.'
                    : 'Não encontramos esse e-mail no cadastro. Digite seu nome completo, exatamente como aparece na plataforma da King.'}
                </p>
              </div>
            </div>

            <div className="rounded-[1.625rem] p-[1.5px] bg-surface-subtle border border-line-soft
                            shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]">
              <div className="rounded-[1.5rem] bg-surface-canvas px-6 py-7 space-y-5">
                <form onSubmit={handleSubmitNome} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="nome" className="text-[12px] text-ink-secondary font-medium">
                      Nome completo
                    </Label>
                    <Input
                      id="nome"
                      type="text"
                      value={step.nome}
                      onChange={ev => setStep({ ...step, nome: ev.target.value })}
                      required
                      autoComplete="name"
                      placeholder="Seu nome completo, como no cadastro"
                      className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                    />
                    <p className="text-[11.5px] text-ink-muted">
                      Digite o nome completo, igual ao que aparece na plataforma da King (sem abreviações nem apelido).
                    </p>
                  </div>

                  {step.desempate && (
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

                  {step.erro === 'reforco' ? (
                    <div className="rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5
                                    text-[12.5px] text-brand-strong font-medium space-y-1">
                      <p className="font-semibold">Ainda não encontramos você.</p>
                      <p>Confira: precisa ser o <strong>nome completo</strong>, exatamente igual ao cadastro na plataforma — sem abreviações e sem apelido.</p>
                    </div>
                  ) : step.erro ? (
                    <div className="rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5
                                    text-[12.5px] text-brand-strong font-medium">
                      <p>{step.erro}</p>
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={lookup.isPending}
                    className={cn(
                      'btn-press w-full h-11 rounded-full bg-ink text-ink-inverse',
                      'flex items-center justify-center',
                      'hover:bg-ink/90 disabled:opacity-60 disabled:cursor-not-allowed',
                      'font-medium text-[13.5px]',
                    )}
                  >
                    {lookup.isPending ? 'Buscando…' : 'Continuar'}
                  </button>

                  <button
                    type="button"
                    onClick={recomecar}
                    className="btn-press w-full text-[12px] text-ink-muted hover:text-ink-secondary"
                  >
                    Voltar e usar o e-mail
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {step.tipo === 'cadastro-email' && step.resultado.professor && (
          <div className="w-full max-w-sm space-y-6 animate-fade-up">
            <div className="flex flex-col items-center gap-3.5 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accentBlue-soft text-[19px] font-semibold text-accentBlue shadow-inner-top">
                {iniciais(step.resultado.professor.nome)}
              </span>
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Encontramos você, {step.resultado.professor.nome.split(' ')[0]}!
                </h1>
                <p className="text-[13px] text-ink-muted">
                  Confirme seu e-mail para cadastrarmos — assim seu agendamento fica mais rápido da próxima vez.
                </p>
              </div>
            </div>

            <div className="rounded-[1.625rem] p-[1.5px] bg-surface-subtle border border-line-soft
                            shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]">
              <div className="rounded-[1.5rem] bg-surface-canvas px-6 py-7 space-y-5">
                <form onSubmit={handleCadastroEmail} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cadastro-email" className="text-[12px] text-ink-secondary font-medium">
                      Seu e-mail
                    </Label>
                    <Input
                      id="cadastro-email"
                      type="email"
                      inputMode="email"
                      value={step.email}
                      onChange={ev => setStep({ ...step, email: ev.target.value })}
                      required
                      autoComplete="email"
                      placeholder="seu.email@exemplo.com"
                      className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                    />
                  </div>

                  {step.erro && (
                    <div className="rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5
                                    text-[12.5px] text-brand-strong font-medium">
                      <p>{step.erro}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={lookup.isPending}
                    className={cn(
                      'btn-press w-full h-11 rounded-full bg-ink text-ink-inverse',
                      'flex items-center justify-center',
                      'hover:bg-ink/90 disabled:opacity-60 disabled:cursor-not-allowed',
                      'font-medium text-[13.5px]',
                    )}
                  >
                    {lookup.isPending ? 'Salvando…' : 'Continuar'}
                  </button>

                  <button
                    type="button"
                    onClick={recomecar}
                    className="btn-press w-full text-[12px] text-ink-muted hover:text-ink-secondary"
                  >
                    Não sou eu
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {step.tipo === 'confirmar-identidade' && step.resultado.professor && (
          <div className="w-full max-w-sm space-y-6 text-center animate-fade-up">
            <div className="flex flex-col items-center gap-3.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accentBlue-soft text-[19px] font-semibold text-accentBlue shadow-inner-top">
                {iniciais(step.resultado.professor.nome)}
              </span>
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Você é {step.resultado.professor.nome}?
                </h1>
                <p className="text-[13px] text-ink-muted">Confirme pra ver suas opções de agendamento.</p>
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={recomecar}
                className="btn-press h-10 px-5 rounded-full border border-line-soft text-[13px] font-medium text-ink-secondary hover:bg-surface-subtle"
              >
                Não sou eu
              </button>
              <button
                onClick={() => handleConfirmarIdentidade(step.resultado)}
                className="btn-press h-10 px-5 rounded-full bg-ink text-ink-inverse text-[13px] font-medium hover:bg-ink/90"
              >
                Sim, sou eu
              </button>
            </div>
          </div>
        )}

        {step.tipo === 'contato-coordenacao' && (
          <div className="w-full max-w-sm space-y-6 text-center animate-fade-up">
            <div className="flex flex-col items-center gap-3.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand shadow-inner-top">
                <Phone className="h-6 w-6" />
              </span>
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Vamos te ajudar pessoalmente
                </h1>
                <p className="text-[13.5px] text-ink-muted leading-relaxed">
                  Não conseguimos te identificar pelo e-mail nem pelo nome. Fale com a coordenação de professores
                  para resolver e agendar sua reunião.
                </p>
              </div>
            </div>

            <a
              href={`https://wa.me/${COORD_WHATSAPP_NUM}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand text-white text-[13.5px] font-medium hover:bg-brand-strong"
            >
              <MessageCircle className="h-4 w-4" />
              Falar com a coordenação ({COORD_TELEFONE})
            </a>

            <button
              onClick={recomecar}
              className="btn-press w-full h-10 rounded-full border border-line-soft text-[13px] font-medium text-ink-secondary hover:bg-surface-subtle"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {step.tipo === 'aviso-agendamento-recente' && step.resultado.professor && step.resultado.avisoAgendamentoRecente && (
          <AvisoAgendamentoRecente
            professorNome={step.resultado.professor.nome}
            aviso={step.resultado.avisoAgendamentoRecente}
            pendingDeclarar={declararNaoFez.isPending}
            onDeclararNaoFez={handleDeclararNaoFez}
            onSoTirarDuvida={handleSoTirarDuvida}
          />
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
