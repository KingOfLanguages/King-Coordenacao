import { useMemo, useState } from 'react'
import {
  UserCog, Phone, CheckCircle2, Search, AlertTriangle, ChevronLeft, Users, Clock,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  CabecalhoPortal, CartaoPortal, AvisoErro, BotaoPrimario, BotaoWhatsApp,
  FundoPortal, AvatarPortal,
} from '@/components/portal/PortalUI'
import {
  MOTIVOS_TRANSFERENCIA, tempoDeVinculo, diasUteisLabel,
  PRAZO_DIAS_UTEIS, ANTECEDENCIA_MIN_DIAS, FUTURO_MAX_DIAS,
  type MotivoTransferencia,
} from '@/lib/transferenciaLabels'
import { diasUteisEntre, hojeLocal, parseISODate } from '@/lib/diasUteis'
import { dataBR } from '@/lib/formato'
import {
  useTransferenciaLookup, useSolicitarTransferencia,
  type TransferenciaLookupResult, type AlunoPortal,
} from '@/hooks/usePortalTransferencia'
import { cn } from '@/lib/utils'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 9 }, (_, i) => ANO_ATUAL - i)

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DETALHE_MIN = 15

/** Dias desde uma data ISO — o "há quanto tempo" que aparece em cada aluno. */
function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  const [a, m, d] = iso.split('-').map(Number)
  const inicio = Date.UTC(a, m - 1, d)
  const agora = new Date()
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.round((hoje - inicio) / 86_400_000)
}

/** Data ISO de N dias de calendário a partir de hoje — limites do input date. */
function isoEmDias(n: number): string {
  const d = hojeLocal()
  d.setDate(d.getDate() + n)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Aluno escolhido — da lista (com id) ou digitado à mão (sem id). */
type AlunoEscolhido = { alunoId: number | null; nome: string; dataAdicao: string | null }

type Step =
  | { tipo: 'identificacao-email'; email: string; erro: string }
  // tentativa: 1ª ou 2ª tentativa de nome. desempate: pede mês/ano (nomes idênticos).
  | { tipo: 'identificacao'; tentativa: 1 | 2; desempate: boolean; nome: string; erro: string; emailInformado: string }
  // Achou pelo nome → pede o e-mail pra cadastrar antes de seguir.
  | { tipo: 'cadastro-email'; resultado: TransferenciaLookupResult; email: string; erro: string }
  | { tipo: 'confirmar-identidade'; resultado: TransferenciaLookupResult }
  | { tipo: 'contato-coordenacao' }
  // Escolha do aluno: a lista vem do cadastro, então o pedido nasce com aluno_id.
  | { tipo: 'escolher-aluno'; professorId: string; nome: string; alunos: AlunoPortal[]; busca: string; manual: string; erro: string }
  | {
      tipo: 'formulario'; professorId: string; nome: string; alunos: AlunoPortal[]
      aluno: AlunoEscolhido
      motivo: MotivoTransferencia | ''
      detalhe: string
      dataUltimaAula: string
      jaConversou: boolean | null
      aceitaManter: boolean | null
      erro: string
    }
  | { tipo: 'confirmacao'; nome: string; alunoNome: string; dataUltimaAula: string }

export function Home() {
  const [step, setStep] = useState<Step>({ tipo: 'identificacao-email', email: '', erro: '' })
  const [mes, setMes] = useState<number | null>(null)
  const [ano, setAno] = useState<number | null>(null)

  const lookup    = useTransferenciaLookup()
  const solicitar = useSolicitarTransferencia()

  function recomecar() {
    setMes(null)
    setAno(null)
    setStep({ tipo: 'identificacao-email', email: '', erro: '' })
  }

  /** Ponto único de entrada na escolha do aluno. */
  function seguirParaEscolha(resultado: TransferenciaLookupResult) {
    if (!resultado.professor) return
    setStep({
      tipo: 'escolher-aluno',
      professorId: resultado.professor.id,
      nome: resultado.professor.nome,
      alunos: resultado.alunos,
      busca: '', manual: '', erro: '',
    })
  }

  function escolherAluno(aluno: AlunoEscolhido) {
    if (step.tipo !== 'escolher-aluno') return
    setStep({
      tipo: 'formulario',
      professorId: step.professorId,
      nome: step.nome,
      alunos: step.alunos,
      aluno,
      motivo: '', detalhe: '', dataUltimaAula: '',
      jaConversou: null, aceitaManter: null,
      erro: '',
    })
  }

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
        setStep({ tipo: 'confirmar-identidade', resultado })
        return
      }
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
        setStep({ tipo: 'cadastro-email', resultado, email: step.emailInformado, erro: '' })
        return
      }

      if (resultado.ambiguo) {
        if (!step.desempate) {
          setStep({ ...step, nome: nomeAtual, desempate: true, erro: '' })
        } else {
          setStep({ tipo: 'contato-coordenacao' })
        }
        return
      }

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
      const resultado = await lookup.mutateAsync({ professorId: step.resultado.professor.id, email: emailAtual })
      if (resultado.professor) {
        seguirParaEscolha(resultado)
      } else {
        setStep({ ...step, erro: 'Não foi possível concluir agora. Tente novamente.' })
      }
    } catch {
      setStep({ ...step, erro: 'Não foi possível concluir agora. Tente novamente.' })
    }
  }

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    if (step.tipo !== 'formulario') return

    if (!step.motivo) {
      setStep({ ...step, erro: 'Escolha o motivo da transferência.' })
      return
    }
    if (step.detalhe.trim().length < DETALHE_MIN) {
      setStep({ ...step, erro: 'Conte com um pouco mais de detalhe o que está acontecendo — é o que orienta quem vai atender.' })
      return
    }
    if (!step.dataUltimaAula) {
      setStep({ ...step, erro: 'Informe a data da última aula do aluno.' })
      return
    }
    if (step.dataUltimaAula < isoEmDias(ANTECEDENCIA_MIN_DIAS)) {
      setStep({ ...step, erro: 'A última aula precisa ser a partir de amanhã. Se a aula já aconteceu, fale com o suporte.' })
      return
    }

    try {
      await solicitar.mutateAsync({
        professorId: step.professorId,
        alunoId: step.aluno.alunoId,
        alunoNome: step.aluno.nome,
        motivo: step.motivo,
        detalhe: step.detalhe.trim(),
        dataUltimaAula: step.dataUltimaAula,
        jaConversou: step.jaConversou,
        aceitaManter: step.aceitaManter,
      })
      setStep({
        tipo: 'confirmacao', nome: step.nome, alunoNome: step.aluno.nome,
        dataUltimaAula: step.dataUltimaAula,
      })
    } catch (err) {
      setStep({ ...step, erro: err instanceof Error ? err.message : 'Não foi possível registrar agora. Tente novamente.' })
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface-app flex items-center justify-center p-6">
      <FundoPortal />

      <div className="relative z-10 flex items-center justify-center w-full">
        {step.tipo === 'identificacao-email' && (
          <div className="w-full max-w-sm space-y-6 animate-fade-up">
            <CabecalhoPortal
              icone={UserCog}
              titulo="Transferência de aluno"
              descricao="Informe seu e-mail cadastrado para pedir a transferência de um aluno da sua agenda."
            />
            <CartaoPortal>
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

                {step.erro && <AvisoErro>{step.erro}</AvisoErro>}

                <BotaoPrimario pending={lookup.isPending} pendingLabel="Buscando…">
                  Continuar
                </BotaoPrimario>
              </form>
            </CartaoPortal>
          </div>
        )}

        {step.tipo === 'identificacao' && (
          <div className="w-full max-w-sm space-y-6 animate-fade-up">
            <CabecalhoPortal
              icone={UserCog}
              titulo="Transferência de aluno"
              descricao={step.desempate
                ? 'Encontramos mais de uma pessoa com esse nome. Pra confirmar quem é você, informe também o mês e o ano em que começou na King.'
                : 'Não encontramos esse e-mail no cadastro. Digite seu nome completo, exatamente como aparece na plataforma da King.'}
            />
            <CartaoPortal>
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
                  <AvisoErro>{step.erro}</AvisoErro>
                ) : null}

                <BotaoPrimario pending={lookup.isPending} pendingLabel="Buscando…">
                  Continuar
                </BotaoPrimario>

                <button
                  type="button"
                  onClick={recomecar}
                  className="btn-press w-full text-[12px] text-ink-muted hover:text-ink-secondary"
                >
                  Voltar e usar o e-mail
                </button>
              </form>
            </CartaoPortal>
          </div>
        )}

        {step.tipo === 'cadastro-email' && step.resultado.professor && (
          <div className="w-full max-w-sm space-y-6 animate-fade-up">
            <div className="flex flex-col items-center gap-3.5 text-center">
              <AvatarPortal nome={step.resultado.professor.nome} />
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Encontramos você, {step.resultado.professor.nome.split(' ')[0]}!
                </h1>
                <p className="text-[13px] text-ink-muted">
                  Confirme seu e-mail para cadastrarmos — é por ele que o suporte vai te retornar.
                </p>
              </div>
            </div>

            <CartaoPortal>
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

                {step.erro && <AvisoErro>{step.erro}</AvisoErro>}

                <BotaoPrimario pending={lookup.isPending} pendingLabel="Salvando…">
                  Continuar
                </BotaoPrimario>

                <button
                  type="button"
                  onClick={recomecar}
                  className="btn-press w-full text-[12px] text-ink-muted hover:text-ink-secondary"
                >
                  Não sou eu
                </button>
              </form>
            </CartaoPortal>
          </div>
        )}

        {step.tipo === 'confirmar-identidade' && step.resultado.professor && (
          <div className="w-full max-w-sm space-y-6 text-center animate-fade-up">
            <div className="flex flex-col items-center gap-3.5">
              <AvatarPortal nome={step.resultado.professor.nome} />
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Você é {step.resultado.professor.nome}?
                </h1>
                <p className="text-[13px] text-ink-muted">Confirme para escolher o aluno.</p>
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
                onClick={() => seguirParaEscolha(step.resultado)}
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
                  Não conseguimos te identificar pelo e-mail nem pelo nome. Fale com a coordenação
                  para registrar o pedido de transferência.
                </p>
              </div>
            </div>

            <BotaoWhatsApp />

            <button
              onClick={recomecar}
              className="btn-press w-full h-10 rounded-full border border-line-soft text-[13px] font-medium text-ink-secondary hover:bg-surface-subtle"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {step.tipo === 'escolher-aluno' && (
          <EscolherAluno
            step={step}
            onBusca={v => setStep({ ...step, busca: v })}
            onManual={v => setStep({ ...step, manual: v, erro: '' })}
            onErro={v => setStep({ ...step, erro: v })}
            onEscolher={escolherAluno}
            onRecomecar={recomecar}
          />
        )}

        {step.tipo === 'formulario' && (
          <div className="w-full max-w-md space-y-6 animate-fade-up">
            <div className="flex flex-col items-center gap-3.5 text-center">
              <AvatarPortal nome={step.nome} />
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Transferir {step.aluno.nome}
                </h1>
                <p className="text-[13px] text-ink-muted">
                  {tempoDeVinculo(diasDesde(step.aluno.dataAdicao))
                    ? `Na sua agenda ${tempoDeVinculo(diasDesde(step.aluno.dataAdicao))}`
                    : step.nome}
                </p>
              </div>
            </div>

            <CartaoPortal>
              <form onSubmit={handleEnviar} className="space-y-5">
                {/* O compromisso da operação, dito antes de o professor preencher —
                    é o que torna a régua de prazo justa. */}
                <div className="flex items-start gap-2.5 rounded-xl border border-accentBlue/20 bg-accentBlue-soft px-3.5 py-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accentBlue" />
                  <p className="text-[12.5px] leading-relaxed text-ink-secondary">
                    Alunos serão transferidos em até <strong>{diasUteisLabel(PRAZO_DIAS_UTEIS)}</strong>{' '}
                    após a data de envio deste formulário.
                  </p>
                </div>

                {/* Motivo */}
                <div className="space-y-2">
                  <Label className="text-[12px] text-ink-secondary font-medium">
                    Qual o motivo?
                  </Label>
                  <div className="space-y-1.5">
                    {MOTIVOS_TRANSFERENCIA.map(m => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setStep({ ...step, motivo: m.value, erro: '' })}
                        className={cn(
                          'btn-press w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                          step.motivo === m.value
                            ? 'border-accentBlue bg-accentBlue-soft'
                            : 'border-line-soft bg-surface-subtle hover:border-line',
                        )}
                      >
                        <span className={cn(
                          'block text-[13px] font-medium',
                          step.motivo === m.value ? 'text-accentBlue' : 'text-ink',
                        )}>
                          {m.label}
                        </span>
                        <span className="block text-[11.5px] text-ink-muted mt-0.5">{m.ajuda}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Relato */}
                <div className="space-y-1.5">
                  <Label htmlFor="detalhe" className="text-[12px] text-ink-secondary font-medium">
                    O que está acontecendo?
                  </Label>
                  <textarea
                    id="detalhe"
                    value={step.detalhe}
                    onChange={ev => setStep({ ...step, detalhe: ev.target.value })}
                    required
                    rows={4}
                    placeholder="Descreva a situação com o aluno. Quanto mais contexto, melhor o suporte consegue resolver."
                    className="w-full resize-none rounded-xl border border-line-soft bg-surface-subtle px-3 py-2
                               text-[13px] text-ink placeholder:text-ink-subtle transition-colors
                               focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue"
                  />
                  <p className="text-[11.5px] text-ink-muted">
                    Esse relato vai direto para a equipe de Suporte ao Aluno.
                  </p>
                </div>

                {/* Dois sinais que mudam a conduta de quem atende */}
                <div className="space-y-3 rounded-xl border border-line-soft bg-surface-subtle px-3.5 py-3">
                  <PerguntaSimNao
                    pergunta="Você já conversou com o aluno sobre isso?"
                    valor={step.jaConversou}
                    onChange={v => setStep({ ...step, jaConversou: v })}
                  />
                  <PerguntaSimNao
                    pergunta="Você manteria o aluno se houvesse algum ajuste?"
                    valor={step.aceitaManter}
                    onChange={v => setStep({ ...step, aceitaManter: v })}
                  />
                </div>

                {/* Última aula — é ela que define a urgência do pedido */}
                <div className="space-y-1.5">
                  <Label htmlFor="ultima-aula" className="text-[12px] text-ink-secondary font-medium">
                    Data da última aula
                  </Label>
                  <Input
                    id="ultima-aula"
                    type="date"
                    value={step.dataUltimaAula}
                    min={isoEmDias(ANTECEDENCIA_MIN_DIAS)}
                    max={isoEmDias(FUTURO_MAX_DIAS)}
                    onChange={ev => setStep({ ...step, dataUltimaAula: ev.target.value, erro: '' })}
                    required
                    className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                  />
                  <p className="text-[11.5px] text-ink-muted">
                    O <strong>último dia em que o aluno estará presente</strong> para ter aula com você.
                  </p>
                  <AvisoPrazo data={step.dataUltimaAula} />
                </div>

                {step.erro && <AvisoErro>{step.erro}</AvisoErro>}

                <BotaoPrimario pending={solicitar.isPending} pendingLabel="Enviando…">
                  Enviar pedido
                </BotaoPrimario>

                <button
                  type="button"
                  onClick={() => setStep({
                    tipo: 'escolher-aluno',
                    professorId: step.professorId,
                    nome: step.nome,
                    alunos: step.alunos,
                    busca: '', manual: '', erro: '',
                  })}
                  className="btn-press w-full inline-flex items-center justify-center gap-1 text-[12px] text-ink-muted hover:text-ink-secondary"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />Escolher outro aluno
                </button>
              </form>
            </CartaoPortal>
          </div>
        )}

        {step.tipo === 'confirmacao' && (
          <div className="w-full max-w-sm space-y-6 text-center animate-fade-up">
            <div className="flex flex-col items-center gap-3.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-urg-lowBg text-urg-lowFg shadow-inner-top">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Pedido registrado!
                </h1>
                <p className="text-[13.5px] text-ink-muted leading-relaxed">
                  Recebemos seu pedido de transferência de <strong>{step.alunoNome}</strong>,{' '}
                  {step.nome.split(' ')[0]}. A equipe de Suporte ao Aluno vai analisar e entrar em contato.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-line-soft bg-surface-canvas px-5 py-4 text-left">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-muted">Última aula</span>
                <span className="font-medium text-ink tabular-nums">{dataBR(step.dataUltimaAula)}</span>
              </div>
              <p className="text-[12.5px] leading-relaxed text-ink-secondary">
                Enquanto o pedido é analisado, <strong>continue atendendo o aluno normalmente</strong>.
                A transferência só vale depois que o suporte confirmar.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Passo: escolher o aluno ─────────────────────────────────────────────────
// A lista vem do cadastro do King, não é digitada. É isso que faz o pedido
// nascer amarrado ao aluno certo — e é o que dá ao suporte o histórico dele.

function EscolherAluno({
  step, onBusca, onManual, onErro, onEscolher, onRecomecar,
}: {
  step: Extract<Step, { tipo: 'escolher-aluno' }>
  onBusca: (v: string) => void
  onManual: (v: string) => void
  onErro: (v: string) => void
  onEscolher: (aluno: AlunoEscolhido) => void
  onRecomecar: () => void
}) {
  const [modoManual, setModoManual] = useState(false)

  const filtrados = useMemo(() => {
    const termo = step.busca.trim().toLowerCase()
    if (!termo) return step.alunos
    return step.alunos.filter(a => a.nome.toLowerCase().includes(termo))
  }, [step.alunos, step.busca])

  const semAlunos = step.alunos.length === 0

  function confirmarManual() {
    const nome = step.manual.trim()
    if (nome.length < 2) {
      onErro('Digite o nome do aluno.')
      return
    }
    onEscolher({ alunoId: null, nome, dataAdicao: null })
  }

  return (
    <div className="w-full max-w-md space-y-6 animate-fade-up">
      <div className="flex flex-col items-center gap-3.5 text-center">
        <AvatarPortal nome={step.nome} />
        <div className="space-y-1.5">
          <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
            Qual aluno você quer transferir?
          </h1>
          <p className="text-[13px] text-ink-muted">
            {semAlunos
              ? 'Não encontramos alunos vinculados ao seu cadastro.'
              : `${step.alunos.length} aluno${step.alunos.length !== 1 ? 's' : ''} na sua agenda`}
          </p>
        </div>
      </div>

      <CartaoPortal>
        {!modoManual && !semAlunos ? (
          <div className="space-y-3">
            {step.alunos.length > 6 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
                <Input
                  value={step.busca}
                  onChange={e => onBusca(e.target.value)}
                  placeholder="Buscar aluno…"
                  className="h-10 pl-9 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                />
              </div>
            )}

            <div className="max-h-[19rem] space-y-1.5 overflow-y-auto pr-0.5">
              {filtrados.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-ink-muted">
                  Nenhum aluno com esse nome.
                </p>
              ) : (
                filtrados.map(a => {
                  const tempo = tempoDeVinculo(diasDesde(a.dataAdicao))
                  return (
                    <button
                      key={a.alunoId}
                      type="button"
                      disabled={a.pedidoAberto}
                      onClick={() => onEscolher({ alunoId: a.alunoId, nome: a.nome, dataAdicao: a.dataAdicao })}
                      className={cn(
                        'btn-press w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                        a.pedidoAberto
                          ? 'border-line-soft bg-surface-subtle opacity-60 cursor-not-allowed'
                          : 'border-line-soft bg-surface-subtle hover:border-accentBlue hover:bg-accentBlue-soft',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13.5px] font-medium text-ink truncate">{a.nome}</span>
                        {a.pedidoAberto && (
                          <span className="shrink-0 rounded-full bg-urg-medBg px-2 py-0.5 text-[10.5px] font-medium text-urg-medFg">
                            já solicitado
                          </span>
                        )}
                      </span>
                      {(tempo || a.status === 'pausado') && (
                        <span className="mt-0.5 block text-[11.5px] text-ink-muted">
                          {tempo}
                          {a.status === 'pausado' && (tempo ? ' · aluno pausado' : 'aluno pausado')}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            <button
              type="button"
              onClick={() => { setModoManual(true); onErro('') }}
              className="btn-press w-full text-[12px] text-ink-muted hover:text-ink-secondary"
            >
              Não encontrei meu aluno na lista
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {semAlunos && !modoManual && (
              <div className="flex items-start gap-2 rounded-xl border border-line-soft bg-surface-subtle px-3.5 py-2.5">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                <p className="text-[12px] text-ink-secondary leading-relaxed">
                  Sua agenda pode ter sido atualizada há pouco. Digite o nome do aluno e o
                  suporte confere no cadastro.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="aluno-manual" className="text-[12px] text-ink-secondary font-medium">
                Nome do aluno
              </Label>
              <Input
                id="aluno-manual"
                value={step.manual}
                onChange={e => onManual(e.target.value)}
                placeholder="Nome do aluno, como aparece na plataforma"
                className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
              />
              <p className="flex items-start gap-1.5 text-[11.5px] text-ink-muted">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                Pedidos sem o aluno da lista demoram mais — o suporte precisa localizar o cadastro à mão.
              </p>
            </div>

            {step.erro && <AvisoErro>{step.erro}</AvisoErro>}

            <BotaoPrimario type="button" onClick={confirmarManual}>
              Continuar
            </BotaoPrimario>

            {!semAlunos && (
              <button
                type="button"
                onClick={() => { setModoManual(false); onErro('') }}
                className="btn-press w-full inline-flex items-center justify-center gap-1 text-[12px] text-ink-muted hover:text-ink-secondary"
              >
                <ChevronLeft className="h-3.5 w-3.5" />Voltar para a lista
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onRecomecar}
          className="btn-press w-full text-[12px] text-ink-muted hover:text-ink-secondary"
        >
          Não sou eu
        </button>
      </CartaoPortal>
    </div>
  )
}

/**
 * Retorno ao vivo sobre o prazo, assim que o professor escolhe a data.
 *
 * Avisar ANTES de enviar é deliberado: o pedido com menos de 7 dias úteis vira
 * informe negativo no perfil dele, e marcar alguém por uma regra que ele só
 * descobre depois seria injusto. Quem precisa mesmo pedir em cima da hora
 * segue podendo — só não vai ser pego de surpresa.
 */
function AvisoPrazo({ data }: { data: string }) {
  if (!data) return null
  const alvo = parseISODate(data)
  if (!alvo) return null

  const hoje = hojeLocal()
  if (alvo < hoje) return null

  const uteis = diasUteisEntre(hoje, alvo)
  const dentro = uteis >= PRAZO_DIAS_UTEIS

  return (
    <div className={cn(
      'flex items-start gap-2 rounded-xl px-3 py-2.5',
      dentro ? 'bg-urg-lowBg' : 'bg-urg-highBg',
    )}>
      {dentro
        ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-urg-lowFg" />
        : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-urg-highFg" />}
      <div className={cn('text-[11.5px] leading-relaxed', dentro ? 'text-urg-lowFg' : 'text-urg-highFg')}>
        <p className="font-semibold">
          {dataBR(data)} · {diasUteisLabel(uteis)} de antecedência
        </p>
        <p className="mt-0.5 font-medium">
          {dentro
            ? 'Dentro do prazo de 7 dias úteis.'
            : 'Abaixo do prazo de 7 dias úteis — este pedido será registrado como informe negativo no seu perfil. Se conseguir uma data mais adiante, ajuste acima.'}
        </p>
      </div>
    </div>
  )
}

/** Par sim/não — as duas perguntas que dizem a quem atende se ainda dá pra
 *  mediar antes de mover o aluno. Opcionais de propósito: obrigar resposta
 *  aumentaria o abandono do formulário. */
function PerguntaSimNao({
  pergunta, valor, onChange,
}: { pergunta: string; valor: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-ink-secondary leading-snug">{pergunta}</span>
      <div className="flex shrink-0 gap-1">
        {([['Sim', true], ['Não', false]] as const).map(([label, v]) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              'btn-press h-7 rounded-full px-3 text-[12px] font-medium transition-colors',
              valor === v
                ? 'bg-ink text-ink-inverse'
                : 'border border-line-soft bg-surface-canvas text-ink-secondary hover:border-line',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
