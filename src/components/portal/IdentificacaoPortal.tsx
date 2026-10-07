import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { MailCheck, Phone } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  CabecalhoPortal, CartaoPortal, AvisoErro, BotaoPrimario, BotaoWhatsApp,
} from './PortalUI'
import {
  useSolicitarCodigo, useVerificarCodigo, type SolicitarCodigoInput,
} from '@/hooks/usePortalIdentidade'
import { ErroFuncao } from '@/lib/invocarFuncao'

// ─────────────────────────────────────────────────────────────────────────────
// Entrada dos portais do professor (/welcome-path, /pausa, /transferencia,
// /agendar). E-mail (ou nome completo; homônimo pede mês/ano de início) →
// CÓDIGO no e-mail oficial do cadastro.
//
// A tela nunca diz se o cadastro existe: o servidor responde "enviado" sempre
// (item 8 do pentest) e, se nada chegar, o professor tenta pelo nome ou fala
// com a coordenação.
//
// O código é o que prova quem é a pessoa: o nome é público, e até o pentest de
// 05/10/2026 ele bastava para operar como qualquer professor. Por isso também
// não existe mais o passo "cadastre seu e-mail" — o e-mail que vale é o que
// veio da plataforma da King; se estiver errado, quem corrige é a coordenação.
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 9 }, (_, i) => ANO_ATUAL - i)

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const ERRO_REDE = 'Não foi possível verificar seu cadastro agora. Tente novamente em instantes.'

type Step =
  | { tipo: 'email'; email: string; erro: string }
  | { tipo: 'nome'; desempate: boolean; nome: string; erro: string }
  | { tipo: 'codigo'; via: 'email' | 'nome'; desafio: string; codigo: string; erro: string; expirado: boolean; pedido: SolicitarCodigoInput }
  | { tipo: 'contato' }

function mensagemDe(e: unknown): string {
  return e instanceof ErroFuncao && e.status && e.status !== 500 ? e.message : ERRO_REDE
}

export function IdentificacaoPortal({
  icone, titulo, descricao, onEntrar,
}: {
  icone: LucideIcon
  titulo: string
  /** Texto do primeiro passo — diz para que serve o portal. */
  descricao: string
  onEntrar: (token: string) => void
}) {
  const [step, setStep] = useState<Step>({ tipo: 'email', email: '', erro: '' })
  const [mes, setMes] = useState<number | null>(null)
  const [ano, setAno] = useState<number | null>(null)

  const solicitar = useSolicitarCodigo()
  const verificar = useVerificarCodigo()

  function recomecar() {
    setMes(null)
    setAno(null)
    setStep({ tipo: 'email', email: '', erro: '' })
  }

  /** Pede o código. Devolve true quando o servidor pede mês/ano (homônimo). */
  async function pedirCodigo(pedido: SolicitarCodigoInput, via: 'email' | 'nome') {
    const r = await solicitar.mutateAsync(pedido)
    if (r.status === 'ambiguo') return true
    setStep({ tipo: 'codigo', via, desafio: r.desafio, codigo: '', erro: '', expirado: false, pedido })
    return false
  }

  function irParaNome() {
    setMes(null)
    setAno(null)
    setStep({ tipo: 'nome', desempate: false, nome: '', erro: '' })
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    if (step.tipo !== 'email') return
    const email = step.email.trim()
    if (!EMAIL_RE.test(email)) {
      setStep({ ...step, erro: 'Digite um e-mail válido.' })
      return
    }
    try {
      await pedirCodigo({ email }, 'email')
    } catch (err) {
      setStep({ ...step, erro: mensagemDe(err) })
    }
  }

  async function handleNome(e: React.FormEvent) {
    e.preventDefault()
    if (step.tipo !== 'nome') return
    const nome = step.nome.trim()
    if (nome.length < 3) {
      setStep({ ...step, erro: 'Digite seu nome completo.' })
      return
    }
    if (step.desempate && (mes == null || ano == null)) {
      setStep({ ...step, erro: 'Selecione o mês e o ano em que você começou.' })
      return
    }

    try {
      const ambiguo = await pedirCodigo({
        nome,
        ...(step.desempate && mes != null && ano != null ? { mesInicio: mes, anoInicio: ano } : {}),
      }, 'nome')
      // Homônimo: pede mês/ano; se ainda empatar, só a coordenação resolve.
      if (ambiguo) setStep(step.desempate ? { tipo: 'contato' } : { ...step, nome, desempate: true, erro: '' })
    } catch (err) {
      setStep({ ...step, erro: mensagemDe(err) })
    }
  }

  async function handleCodigo(e: React.FormEvent) {
    e.preventDefault()
    if (step.tipo !== 'codigo') return
    const codigo = step.codigo.replace(/\D/g, '')
    if (codigo.length !== 6) {
      setStep({ ...step, erro: 'Digite os 6 números do código.' })
      return
    }
    try {
      const r = await verificar.mutateAsync({ desafio: step.desafio, codigo })
      onEntrar(r.token)
    } catch (err) {
      const expirado = err instanceof ErroFuncao && err.corpo?.expirado === true
      setStep({ ...step, codigo: '', erro: mensagemDe(err), expirado })
    }
  }

  async function reenviar() {
    if (step.tipo !== 'codigo') return
    try {
      await pedirCodigo(step.pedido, step.via)
    } catch (err) {
      setStep({ ...step, erro: mensagemDe(err) })
    }
  }

  const campo = 'h-10 rounded-xl border-line-soft bg-surface-subtle text-[13px]'
  const linkDiscreto = 'btn-press w-full text-[12px] text-ink-muted hover:text-ink-secondary'

  return (
    <>
      {step.tipo === 'email' && (
        <div className="w-full max-w-sm space-y-6 animate-fade-up">
          <CabecalhoPortal icone={icone} titulo={titulo} descricao={descricao} />
          <CartaoPortal>
            <form onSubmit={handleEmail} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[12px] font-medium text-ink-secondary">
                  E-mail cadastrado na King
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
                  className={campo}
                />
                <p className="text-[11.5px] text-ink-muted">
                  Vamos mandar um código para o seu e-mail para confirmar que é você.
                </p>
              </div>
              {step.erro && <AvisoErro>{step.erro}</AvisoErro>}
              <BotaoPrimario pending={solicitar.isPending} pendingLabel="Buscando…">
                Continuar
              </BotaoPrimario>
            </form>
          </CartaoPortal>
        </div>
      )}

      {step.tipo === 'nome' && (
        <div className="w-full max-w-sm space-y-6 animate-fade-up">
          <CabecalhoPortal
            icone={icone}
            titulo={titulo}
            descricao={step.desempate
              ? 'Encontramos mais de uma pessoa com esse nome. Pra confirmar quem é você, informe também o mês e o ano em que começou na King.'
              : 'Digite seu nome completo, exatamente como aparece na plataforma da King. O código vai para o e-mail que está no seu cadastro.'}
          />
          <CartaoPortal>
            <form onSubmit={handleNome} className="space-y-4">
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
                  className={campo}
                />
              </div>

              {step.desempate && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-medium text-ink-secondary">Mês de início</Label>
                    <Select value={mes ? String(mes) : undefined} onValueChange={v => setMes(Number(v))}>
                      <SelectTrigger className={campo}><SelectValue placeholder="Mês" /></SelectTrigger>
                      <SelectContent>
                        {MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-medium text-ink-secondary">Ano de início</Label>
                    <Select value={ano ? String(ano) : undefined} onValueChange={v => setAno(Number(v))}>
                      <SelectTrigger className={campo}><SelectValue placeholder="Ano" /></SelectTrigger>
                      <SelectContent>
                        {ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {step.erro && <AvisoErro>{step.erro}</AvisoErro>}

              <BotaoPrimario pending={solicitar.isPending} pendingLabel="Buscando…">
                Continuar
              </BotaoPrimario>
              <button type="button" onClick={recomecar} className={linkDiscreto}>
                Voltar e usar o e-mail
              </button>
            </form>
          </CartaoPortal>
        </div>
      )}

      {step.tipo === 'codigo' && (
        <div className="w-full max-w-sm space-y-6 animate-fade-up">
          <div className="flex flex-col items-center gap-3.5 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accentBlue-soft text-accentBlue shadow-inner-top">
              <MailCheck className="h-6 w-6" />
            </span>
            <div className="space-y-1.5">
              <h1 className="text-[1.4rem] font-bold leading-tight tracking-[-0.03em] text-ink">
                Confira seu e-mail
              </h1>
              <p className="text-[13px] leading-relaxed text-ink-muted">
                Se encontramos seu cadastro, mandamos um código de 6 números para o
                e-mail registrado na King. Ele vale por 10 minutos — olhe também a caixa de spam.
              </p>
            </div>
          </div>

          <CartaoPortal>
            <form onSubmit={handleCodigo} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="codigo" className="text-[12px] font-medium text-ink-secondary">Código</Label>
                <Input
                  id="codigo"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={step.codigo}
                  onChange={ev => setStep({ ...step, codigo: ev.target.value.replace(/[^\d ]/g, '') })}
                  placeholder="000000"
                  autoFocus
                  disabled={step.expirado}
                  className={`${campo} text-center font-mono text-[18px] tracking-[0.4em]`}
                />
              </div>
              {step.erro && <AvisoErro>{step.erro}</AvisoErro>}
              {step.expirado ? (
                <BotaoPrimario type="button" onClick={reenviar} pending={solicitar.isPending} pendingLabel="Enviando…">
                  Enviar novo código
                </BotaoPrimario>
              ) : (
                <BotaoPrimario pending={verificar.isPending} pendingLabel="Conferindo…">
                  Entrar
                </BotaoPrimario>
              )}
              {!step.expirado && (
                <button type="button" onClick={reenviar} disabled={solicitar.isPending} className={linkDiscreto}>
                  Não chegou? Enviar outro código
                </button>
              )}
              {step.via === 'email' ? (
                <button type="button" onClick={irParaNome} className={linkDiscreto}>
                  Não chegou nada? Entrar com o nome completo
                </button>
              ) : (
                <button type="button" onClick={() => setStep({ tipo: 'contato' })} className={linkDiscreto}>
                  Não chegou nada? Falar com a coordenação
                </button>
              )}
              <button type="button" onClick={recomecar} className={linkDiscreto}>
                Voltar ao início
              </button>
            </form>
          </CartaoPortal>
        </div>
      )}

      {step.tipo === 'contato' && (
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
                Se o código não chega, pode ser que o seu cadastro esteja sem e-mail ou com
                um e-mail antigo. Fale com a coordenação de professores para conferir.
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
    </>
  )
}
