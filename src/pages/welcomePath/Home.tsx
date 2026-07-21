import { useState } from 'react'
import { GraduationCap, Phone } from 'lucide-react'
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
  useWelcomePathLookup, useWelcomePathSessao, useTrilha,
  type ProfessorPortal,
} from '@/hooks/useWelcomePath'
import { lerToken, gravarToken, limparToken } from '@/lib/welcomePathSession'
import { TrilhaView } from './TrilhaView'
import { EtapaView } from './EtapaView'

// ─────────────────────────────────────────────────────────────────────────────
// Portal público do Welcome Path (/welcome-path).
//
// A identificação é a mesma de /pausa e /agendar — e-mail exato → nome completo
// → desempate por mês/ano → contato da coordenação. A diferença é que aqui a
// jornada dura dias: depois de confirmar quem é, o token fica guardado no
// dispositivo por 30 dias e as visitas seguintes caem direto na trilha.
//
// O token só é PERSISTIDO depois do "Sim, sou eu": um e-mail digitado errado
// não pode deixar o professor logado como outra pessoa até o fim do onboarding.
// ─────────────────────────────────────────────────────────────────────────────

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
  | { tipo: 'cadastro-email'; professor: ProfessorPortal; email: string; erro: string }
  | { tipo: 'confirmar-identidade'; professor: ProfessorPortal; token: string }
  | { tipo: 'contato-coordenacao' }

export function Home() {
  const [token, setToken] = useState<string | null>(() => lerToken())
  const [etapaAberta, setEtapaAberta] = useState<string | null>(null)
  const [step, setStep] = useState<Step>({ tipo: 'identificacao-email', email: '', erro: '' })
  const [mes, setMes] = useState<number | null>(null)
  const [ano, setAno] = useState<number | null>(null)

  const lookup = useWelcomePathLookup()
  const sessao = useWelcomePathSessao(token)
  const trilha = useTrilha(token)

  // Token guardado que o servidor recusou (expirou, professor desligado):
  // limpa e cai na identificação, sem tela de erro para o professor.
  if (token && (sessao.isError || trilha.isError)) {
    limparToken()
    setToken(null)
  }

  function sair() {
    limparToken()
    setToken(null)
    setEtapaAberta(null)
    setMes(null)
    setAno(null)
    setStep({ tipo: 'identificacao-email', email: '', erro: '' })
  }

  function recomecar() {
    setMes(null)
    setAno(null)
    setStep({ tipo: 'identificacao-email', email: '', erro: '' })
  }

  function entrar(novoToken: string) {
    gravarToken(novoToken)
    setToken(novoToken)
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
      const r = await lookup.mutateAsync({ email: emailAtual })
      if (r.professor && r.token) {
        setStep({ tipo: 'confirmar-identidade', professor: r.professor, token: r.token })
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
      const r = await lookup.mutateAsync({
        nome: nomeAtual,
        ...(step.emailInformado ? { email: step.emailInformado } : {}),
        ...(step.desempate && mes != null && ano != null ? { mesInicio: mes, anoInicio: ano } : {}),
      })

      if (r.professor) {
        setStep({ tipo: 'cadastro-email', professor: r.professor, email: step.emailInformado, erro: '' })
        return
      }

      if (r.ambiguo) {
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
    if (step.tipo !== 'cadastro-email') return
    const emailAtual = step.email.trim()
    if (!EMAIL_RE.test(emailAtual)) {
      setStep({ ...step, erro: 'Digite um e-mail válido.' })
      return
    }
    try {
      // Reenvia com professorId + e-mail → o servidor cadastra o e-mail.
      const r = await lookup.mutateAsync({ professorId: step.professor.id, email: emailAtual })
      if (r.professor && r.token) {
        entrar(r.token)
      } else {
        setStep({ ...step, erro: 'Não foi possível concluir agora. Tente novamente.' })
      }
    } catch {
      setStep({ ...step, erro: 'Não foi possível concluir agora. Tente novamente.' })
    }
  }

  // ── Já identificado ────────────────────────────────────────────────────────
  if (token) {
    const carregando = sessao.isLoading || trilha.isLoading
    return (
      <Moldura larga>
        {carregando ? (
          <p className="py-16 text-center text-[13px] text-ink-muted">Carregando sua trilha…</p>
        ) : etapaAberta ? (
          <EtapaView token={token} etapaId={etapaAberta} onVoltar={() => setEtapaAberta(null)} />
        ) : trilha.data ? (
          <TrilhaView
            nome={trilha.data.professor.nome}
            etapas={trilha.data.etapas}
            onAbrir={setEtapaAberta}
            onSair={sair}
          />
        ) : null}
      </Moldura>
    )
  }

  // ── Identificação ──────────────────────────────────────────────────────────
  return (
    <Moldura>
      {step.tipo === 'identificacao-email' && (
        <div className="w-full max-w-sm space-y-6 animate-fade-up">
          <CabecalhoPortal
            icone={GraduationCap}
            titulo="Welcome Path"
            descricao="Sua trilha de boas-vindas à King. Informe seu e-mail cadastrado para começar."
          />
          <CartaoPortal>
            <form onSubmit={handleSubmitEmail} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[12px] font-medium text-ink-secondary">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  value={step.email}
                  onChange={ev => setStep({ ...step, email: ev.target.value })}
                  required
                  autoComplete="email"
                  placeholder="seu.email@exemplo.com"
                  className="h-10 rounded-xl border-line-soft bg-surface-subtle text-[13px]"
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
            icone={GraduationCap}
            titulo="Welcome Path"
            descricao={step.desempate
              ? 'Encontramos mais de uma pessoa com esse nome. Pra confirmar quem é você, informe também o mês e o ano em que começou na King.'
              : 'Não encontramos esse e-mail no cadastro. Digite seu nome completo, exatamente como aparece na plataforma da King.'}
          />
          <CartaoPortal>
            <form onSubmit={handleSubmitNome} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nome" className="text-[12px] font-medium text-ink-secondary">Nome completo</Label>
                <Input
                  id="nome"
                  type="text"
                  value={step.nome}
                  onChange={ev => setStep({ ...step, nome: ev.target.value })}
                  required
                  autoComplete="name"
                  placeholder="Seu nome completo, como no cadastro"
                  className="h-10 rounded-xl border-line-soft bg-surface-subtle text-[13px]"
                />
                <p className="text-[11.5px] text-ink-muted">
                  Digite o nome completo, igual ao que aparece na plataforma da King (sem abreviações nem apelido).
                </p>
              </div>

              {step.desempate && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-medium text-ink-secondary">Mês de início</Label>
                    <Select value={mes ? String(mes) : undefined} onValueChange={v => setMes(Number(v))}>
                      <SelectTrigger className="h-10 rounded-xl border-line-soft bg-surface-subtle text-[13px]">
                        <SelectValue placeholder="Mês" />
                      </SelectTrigger>
                      <SelectContent>
                        {MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-medium text-ink-secondary">Ano de início</Label>
                    <Select value={ano ? String(ano) : undefined} onValueChange={v => setAno(Number(v))}>
                      <SelectTrigger className="h-10 rounded-xl border-line-soft bg-surface-subtle text-[13px]">
                        <SelectValue placeholder="Ano" />
                      </SelectTrigger>
                      <SelectContent>
                        {ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {step.erro === 'reforco' ? (
                <div className="space-y-1 rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5 text-[12.5px] font-medium text-brand-strong">
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

      {step.tipo === 'cadastro-email' && (
        <div className="w-full max-w-sm space-y-6 animate-fade-up">
          <div className="flex flex-col items-center gap-3.5 text-center">
            <AvatarPortal nome={step.professor.nome} />
            <div className="space-y-1.5">
              <h1 className="text-[1.4rem] font-bold leading-tight tracking-[-0.03em] text-ink">
                Encontramos você, {step.professor.nome.split(' ')[0]}!
              </h1>
              <p className="text-[13px] text-ink-muted">
                Confirme seu e-mail para cadastrarmos — é por ele que a coordenação vai te acompanhar.
              </p>
            </div>
          </div>

          <CartaoPortal>
            <form onSubmit={handleCadastroEmail} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cadastro-email" className="text-[12px] font-medium text-ink-secondary">
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
                  className="h-10 rounded-xl border-line-soft bg-surface-subtle text-[13px]"
                />
              </div>
              {step.erro && <AvisoErro>{step.erro}</AvisoErro>}
              <BotaoPrimario pending={lookup.isPending} pendingLabel="Salvando…">
                Começar minha trilha
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

      {step.tipo === 'confirmar-identidade' && (
        <div className="w-full max-w-sm space-y-6 text-center animate-fade-up">
          <div className="flex flex-col items-center gap-3.5">
            <AvatarPortal nome={step.professor.nome} />
            <div className="space-y-1.5">
              <h1 className="text-[1.4rem] font-bold leading-tight tracking-[-0.03em] text-ink">
                Você é {step.professor.nome}?
              </h1>
              <p className="text-[13px] text-ink-muted">
                Confirme para abrir sua trilha de onboarding.
              </p>
            </div>
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={recomecar}
              className="btn-press h-10 rounded-full border border-line-soft px-5 text-[13px] font-medium text-ink-secondary hover:bg-surface-subtle"
            >
              Não sou eu
            </button>
            <button
              onClick={() => entrar(step.token)}
              className="btn-press h-10 rounded-full bg-ink px-5 text-[13px] font-medium text-ink-inverse hover:bg-ink/90"
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
              <h1 className="text-[1.4rem] font-bold leading-tight tracking-[-0.03em] text-ink">
                Vamos te ajudar pessoalmente
              </h1>
              <p className="text-[13.5px] leading-relaxed text-ink-muted">
                Não conseguimos te identificar pelo e-mail nem pelo nome. Fale com a coordenação de
                professores para liberar seu acesso à trilha.
              </p>
            </div>
          </div>
          <BotaoWhatsApp />
          <button
            onClick={recomecar}
            className="btn-press h-10 w-full rounded-full border border-line-soft text-[13px] font-medium text-ink-secondary hover:bg-surface-subtle"
          >
            Tentar de novo
          </button>
        </div>
      )}
    </Moldura>
  )
}

/** Moldura comum: fundo do portal e centralização. `larga` dá espaço à trilha,
 *  que é uma lista, não um cartão de formulário. */
function Moldura({ children, larga = false }: { children: React.ReactNode; larga?: boolean }) {
  return (
    <div className={`relative min-h-[100dvh] overflow-hidden bg-surface-app px-5 ${larga ? 'py-10' : 'flex items-center justify-center p-6'}`}>
      <FundoPortal />
      <div className="relative z-10 flex w-full justify-center">{children}</div>
    </div>
  )
}
