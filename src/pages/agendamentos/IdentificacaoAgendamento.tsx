import { useState } from 'react'
import { CalendarClock, Phone } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  CabecalhoPortal, CartaoPortal, AvisoErro, BotaoPrimario, BotaoWhatsApp,
} from '@/components/portal/PortalUI'
import { useIdentificarAgendamento } from '@/hooks/usePortalIdentidade'
import { ErroFuncao } from '@/lib/invocarFuncao'

// ─────────────────────────────────────────────────────────────────────────────
// Entrada do /agendar SEM código (decisão do João em 08/10). E-mail OU nome
// completo numa tela só — basta um bater. A sessão que sai daqui tem escopo
// 'agendamento': vale 2 horas, só neste portal, e não mostra o link do Meet
// das reuniões em grupo (ele vai pelo e-mail do cadastro). Os outros portais
// continuam pedindo o código — ver IdentificacaoPortal.
//
// Diferente da versão anterior ao pentest, nada é gravado: o e-mail digitado só
// serve para localizar o cadastro.
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 9 }, (_, i) => ANO_ATUAL - i)

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const ERRO_REDE = 'Não foi possível verificar seu cadastro agora. Tente novamente em instantes.'

export function IdentificacaoAgendamento({ onEntrar }: { onEntrar: (token: string) => void }) {
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [mes, setMes] = useState<number | null>(null)
  const [ano, setAno] = useState<number | null>(null)
  const [desempate, setDesempate] = useState(false)
  const [tentativa, setTentativa] = useState<1 | 2>(1)
  const [erro, setErro] = useState('')
  const [contato, setContato] = useState(false)

  const identificar = useIdentificarAgendamento()

  function recomecar() {
    setEmail('')
    setNome('')
    setMes(null)
    setAno(null)
    setDesempate(false)
    setTentativa(1)
    setErro('')
    setContato(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const emailAtual = email.trim()
    const nomeAtual = nome.trim()

    if (!emailAtual && !nomeAtual) {
      setErro('Preencha seu e-mail ou seu nome completo — qualquer um dos dois serve.')
      return
    }
    // Só reclama do campo que ele escolheu preencher.
    if (emailAtual && !EMAIL_RE.test(emailAtual)) {
      setErro('Esse e-mail parece incompleto. Confira, ou deixe em branco e use só o nome.')
      return
    }
    if (!emailAtual && nomeAtual.length < 3) {
      setErro('Digite seu nome completo.')
      return
    }
    if (desempate && (mes == null || ano == null)) {
      setErro('Selecione o mês e o ano em que você começou.')
      return
    }

    try {
      const r = await identificar.mutateAsync({
        ...(emailAtual ? { email: emailAtual } : {}),
        ...(nomeAtual ? { nome: nomeAtual } : {}),
        ...(desempate && mes != null && ano != null ? { mesInicio: mes, anoInicio: ano } : {}),
      })

      if (r.status === 'ok') {
        onEntrar(r.token)
        return
      }
      if (r.status === 'ambiguo') {
        // Homônimo: pede mês/ano; se ainda empatar, só a coordenação resolve.
        if (desempate) setContato(true)
        else { setDesempate(true); setErro('') }
        return
      }
      // Não encontrado: 1ª vez reforça o que costuma faltar; 2ª, coordenação.
      if (desempate || tentativa >= 2) setContato(true)
      else { setTentativa(2); setErro('reforco') }
    } catch (err) {
      setErro(err instanceof ErroFuncao && err.status && err.status !== 500 ? err.message : ERRO_REDE)
    }
  }

  const campo = 'h-10 rounded-xl border-line-soft bg-surface-subtle text-[13px]'

  if (contato) {
    return (
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
              professores para agendar sua reunião.
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
    )
  }

  return (
    <div className="w-full max-w-sm space-y-6 animate-fade-up">
      <CabecalhoPortal
        icone={CalendarClock}
        titulo="Agendamento de Reuniões"
        descricao={desempate
          ? 'Encontramos mais de uma pessoa com esse nome. Pra confirmar quem é você, informe também o mês e o ano em que começou na King.'
          : 'Pra ver suas opções de agendamento, informe seu e-mail ou seu nome completo — qualquer um dos dois serve.'}
      />
      <CartaoPortal>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[12px] font-medium text-ink-secondary">E-mail</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              value={email}
              onChange={ev => { setEmail(ev.target.value); setErro('') }}
              autoComplete="email"
              placeholder="seu.email@exemplo.com"
              className={campo}
            />
          </div>

          {/* "ou": os dois campos são caminhos alternativos, não um formulário a
              preencher todo. */}
          <div className="flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-line-soft" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">ou</span>
            <span className="h-px flex-1 bg-line-soft" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nome" className="text-[12px] font-medium text-ink-secondary">Nome completo</Label>
            <Input
              id="nome"
              type="text"
              value={nome}
              onChange={ev => { setNome(ev.target.value); setErro('') }}
              autoComplete="name"
              placeholder="Seu nome completo, como no cadastro"
              className={campo}
            />
            <p className="text-[11.5px] text-ink-muted">
              Igual ao que aparece na plataforma da King — sem abreviações nem apelido.
            </p>
          </div>

          {desempate && (
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

          {erro === 'reforco' ? (
            <div className="space-y-1 rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5 text-[12.5px] font-medium text-brand-strong">
              <p className="font-semibold">Ainda não encontramos você.</p>
              <p>
                Tente <strong>preencher os dois campos</strong> — basta um deles bater. No nome, use o
                <strong> nome completo</strong> igual ao cadastro na plataforma, sem abreviações e sem apelido.
              </p>
            </div>
          ) : erro ? (
            <AvisoErro>{erro}</AvisoErro>
          ) : null}

          <BotaoPrimario pending={identificar.isPending} pendingLabel="Buscando…">
            Continuar
          </BotaoPrimario>
        </form>
      </CartaoPortal>
    </div>
  )
}
