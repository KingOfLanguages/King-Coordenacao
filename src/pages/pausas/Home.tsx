import { useState } from 'react'
import { PauseCircle, Phone, CheckCircle2, CalendarClock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  CabecalhoPortal, CartaoPortal, AvisoErro, BotaoPrimario, BotaoWhatsApp,
  FundoPortal, AvatarPortal,
} from '@/components/portal/PortalUI'
import { dataBR } from '@/lib/formato'
import { usePausaLookup, useSolicitarPausa, type PausaLookupResult } from '@/hooks/usePortalPausa'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 9 }, (_, i) => ANO_ATUAL - i)

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type Step =
  | { tipo: 'identificacao-email'; email: string; erro: string }
  // tentativa: 1ª ou 2ª tentativa de nome. desempate: pede mês/ano (nomes idênticos).
  | { tipo: 'identificacao'; tentativa: 1 | 2; desempate: boolean; nome: string; erro: string; emailInformado: string }
  // Achou pelo nome → pede o e-mail pra cadastrar antes de seguir.
  | { tipo: 'cadastro-email'; resultado: PausaLookupResult; email: string; erro: string }
  | { tipo: 'confirmar-identidade'; resultado: PausaLookupResult }
  | { tipo: 'contato-coordenacao' }
  // Já tem solicitação em aberto (ou já está pausado) — não deixa duplicar.
  | { tipo: 'ja-solicitado'; nome: string; jaPausado: boolean }
  | { tipo: 'formulario'; professorId: string; nome: string; motivo: string; dataInicio: string; dataFim: string; erro: string }
  | { tipo: 'confirmacao'; nome: string; dataInicio: string; dataFim: string }

export function Home() {
  const [step, setStep] = useState<Step>({ tipo: 'identificacao-email', email: '', erro: '' })
  const [mes, setMes] = useState<number | null>(null)
  const [ano, setAno] = useState<number | null>(null)

  const lookup     = usePausaLookup()
  const solicitar  = useSolicitarPausa()

  function recomecar() {
    setMes(null)
    setAno(null)
    setStep({ tipo: 'identificacao-email', email: '', erro: '' })
  }

  /** Ponto único de entrada no formulário — barra quem já tem pausa em aberto. */
  function seguirParaFormulario(resultado: PausaLookupResult) {
    if (!resultado.professor) return
    if (resultado.pausaAberta || resultado.jaPausado) {
      setStep({ tipo: 'ja-solicitado', nome: resultado.professor.nome, jaPausado: resultado.jaPausado })
      return
    }
    setStep({
      tipo: 'formulario',
      professorId: resultado.professor.id,
      nome: resultado.professor.nome,
      motivo: '', dataInicio: '', dataFim: '', erro: '',
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
      // E-mail não bateu → pede o nome completo, guardando o e-mail informado
      // pra pré-preencher o cadastro depois.
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
        // Mais de uma pessoa com o mesmo nome: pede mês/ano; se já pedimos e
        // continua ambíguo, manda pro contato da coordenação.
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
      // Reenvia com professorId + e-mail → o servidor cadastra o e-mail.
      const resultado = await lookup.mutateAsync({ professorId: step.resultado.professor.id, email: emailAtual })
      if (resultado.professor) {
        seguirParaFormulario(resultado)
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

    if (step.motivo.trim().length < 5) {
      setStep({ ...step, erro: 'Conte o motivo da pausa com um pouco mais de detalhe.' })
      return
    }
    if (!step.dataInicio || !step.dataFim) {
      setStep({ ...step, erro: 'Preencha as duas datas.' })
      return
    }
    if (step.dataFim < step.dataInicio) {
      setStep({ ...step, erro: 'A data de fim não pode ser anterior à data de início.' })
      return
    }

    try {
      await solicitar.mutateAsync({
        professorId: step.professorId,
        motivo: step.motivo.trim(),
        dataInicio: step.dataInicio,
        dataFim: step.dataFim,
      })
      setStep({ tipo: 'confirmacao', nome: step.nome, dataInicio: step.dataInicio, dataFim: step.dataFim })
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
              icone={PauseCircle}
              titulo="Solicitação de Pausa"
              descricao="Informe seu e-mail cadastrado para oficializar sua pausa com a coordenação."
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
              icone={PauseCircle}
              titulo="Solicitação de Pausa"
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
                  Confirme seu e-mail para cadastrarmos — é por ele que a coordenação vai te retornar.
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
                <p className="text-[13px] text-ink-muted">Confirme para registrar sua pausa.</p>
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
                onClick={() => seguirParaFormulario(step.resultado)}
                className="btn-press h-10 px-5 rounded-full bg-ink text-ink-inverse text-[13px] font-medium hover:bg-ink/90"
              >
                Sim, sou eu
              </button>
            </div>
          </div>
        )}

        {step.tipo === 'ja-solicitado' && (
          <div className="w-full max-w-sm space-y-6 text-center animate-fade-up">
            <div className="flex flex-col items-center gap-3.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accentBlue-soft text-accentBlue shadow-inner-top">
                <CalendarClock className="h-6 w-6" />
              </span>
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  {step.jaPausado ? 'Você já está em pausa' : 'Sua solicitação já está com a gente'}
                </h1>
                <p className="text-[13.5px] text-ink-muted leading-relaxed">
                  {step.jaPausado
                    ? 'Seu cadastro já consta como pausado. Para encerrar a pausa ou ajustar as datas, fale com a coordenação.'
                    : 'Já existe uma solicitação de pausa em andamento no seu nome. A coordenação vai entrar em contato — não precisa preencher de novo.'}
                </p>
              </div>
            </div>
            <BotaoWhatsApp />
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
                  para registrar sua pausa.
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

        {step.tipo === 'formulario' && (
          <div className="w-full max-w-md space-y-6 animate-fade-up">
            <div className="flex flex-col items-center gap-3.5 text-center">
              <AvatarPortal nome={step.nome} />
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Oficializar pausa
                </h1>
                <p className="text-[13px] text-ink-muted">
                  {step.nome}
                </p>
              </div>
            </div>

            <CartaoPortal>
              <form onSubmit={handleEnviar} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="motivo" className="text-[12px] text-ink-secondary font-medium">
                    Motivo da pausa
                  </Label>
                  <textarea
                    id="motivo"
                    value={step.motivo}
                    onChange={ev => setStep({ ...step, motivo: ev.target.value })}
                    required
                    rows={3}
                    placeholder="Conte brevemente o motivo da sua pausa"
                    className="w-full resize-none rounded-xl border border-line-soft bg-surface-subtle px-3 py-2
                               text-[13px] text-ink placeholder:text-ink-subtle transition-colors
                               focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="data-inicio" className="text-[12px] text-ink-secondary font-medium">
                    Início da pausa
                  </Label>
                  <Input
                    id="data-inicio"
                    type="date"
                    value={step.dataInicio}
                    onChange={ev => setStep({ ...step, dataInicio: ev.target.value })}
                    required
                    className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                  />
                  <p className="text-[11.5px] text-ink-muted">
                    O dia em que você para de dar aulas — ou seja, seu <strong>último dia de aula</strong>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="data-fim" className="text-[12px] text-ink-secondary font-medium">
                    Fim previsto da pausa
                  </Label>
                  <Input
                    id="data-fim"
                    type="date"
                    value={step.dataFim}
                    min={step.dataInicio || undefined}
                    onChange={ev => setStep({ ...step, dataFim: ev.target.value })}
                    required
                    className="h-10 bg-surface-subtle border-line-soft text-[13px] rounded-xl"
                  />
                  <p className="text-[11.5px] text-ink-muted">
                    O dia em que a coordenação deve te procurar. A pausa só encerra oficialmente depois desse contato.
                  </p>
                </div>

                {step.erro && <AvisoErro>{step.erro}</AvisoErro>}

                <BotaoPrimario pending={solicitar.isPending} pendingLabel="Enviando…">
                  Enviar solicitação
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

        {step.tipo === 'confirmacao' && (
          <div className="w-full max-w-sm space-y-6 text-center animate-fade-up">
            <div className="flex flex-col items-center gap-3.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-urg-lowBg text-urg-lowFg shadow-inner-top">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <div className="space-y-1.5">
                <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                  Pausa registrada!
                </h1>
                <p className="text-[13.5px] text-ink-muted leading-relaxed">
                  Recebemos sua solicitação, {step.nome.split(' ')[0]}. A coordenação vai processar
                  a retirada dos seus alunos antes do início.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-line-soft bg-surface-canvas px-5 py-4 space-y-2 text-left">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-muted">Último dia de aula</span>
                <span className="font-medium text-ink tabular-nums">{dataBR(step.dataInicio)}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-muted">Fim previsto</span>
                <span className="font-medium text-ink tabular-nums">{dataBR(step.dataFim)}</span>
              </div>
            </div>

            <p className="text-[12px] text-ink-muted leading-relaxed">
              Sua pausa só encerra depois do contato da coordenação, a partir da data de fim.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
