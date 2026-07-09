import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2 } from 'lucide-react'
import { GoogleIcon } from '@/pages/Login'

const SENHA_MIN = 6

/** Traduz as mensagens mais comuns do Supabase Auth — o resto cai num fallback genérico em vez de vazar inglês cru. */
function traduzirErroCadastro(mensagem: string): string {
  if (/password/i.test(mensagem) && /(least|short|characters)/i.test(mensagem)) {
    return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`
  }
  if (/invalid/i.test(mensagem) && /email/i.test(mensagem)) {
    return 'E-mail inválido. Confira e tente novamente.'
  }
  return 'Não foi possível criar a conta. Tente novamente em instantes.'
}

export function Cadastro() {
  const [nome, setNome]       = useState('')
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro]       = useState('')

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    const nomeAparado  = nome.trim()
    const emailAparado = email.trim()

    if (senha.length < SENHA_MIN) {
      setErro(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`)
      return
    }
    if (senha !== confirmarSenha) {
      setErro('As senhas não coincidem.')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email: emailAparado,
      password: senha,
      options: { data: { nome: nomeAparado } },
    })

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        setErro('Este e-mail já possui uma conta cadastrada.')
      } else {
        setErro(traduzirErroCadastro(error.message))
      }
      setLoading(false)
      return
    }

    if (!data.user) {
      setErro('Conta criada mas não foi possível confirmar. Verifique seu e-mail.')
      setLoading(false)
      return
    }

    // Supabase não retorna erro para e-mail já cadastrado (evita enumeração):
    // devolve um usuário "fake" com identities vazio e sem sessão.
    if (data.user.identities && data.user.identities.length === 0) {
      setErro('Este e-mail já possui uma conta cadastrada.')
      setLoading(false)
      return
    }

    // A solicitação em pending_approvals é criada automaticamente por um
    // trigger no banco (não depende de sessão, que só existe após o usuário
    // confirmar o e-mail).
    setEnviado(true)
    setLoading(false)
  }

  async function handleGoogle() {
    setErro('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setErro('Não foi possível iniciar o cadastro com Google. Tente novamente.')
  }

  if (enviado) return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface-app p-6">
      <div className="max-w-sm w-full card-surface p-8 text-center space-y-4 animate-fade-up">
        <div className="mx-auto h-11 w-11 rounded-full bg-urg-lowBg text-urg-lowFg flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-ink">Confirme seu e-mail</h2>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Enviamos um link de confirmação para <strong className="text-ink">{email}</strong>.
          Abra o e-mail e clique no link para ativar sua conta — depois disso, ela fica
          aguardando aprovação do administrador. Você receberá acesso em breve.
        </p>
        <Link to="/login" className="inline-flex text-[13px] font-medium text-ink hover:text-brand underline-offset-4 hover:underline">
          Voltar ao login
        </Link>
      </div>
    </div>
  )

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface-app">
      <div aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(700px circle at 80% 20%, rgba(209,51,58,0.06), transparent 55%)' }} />

      <div className="relative flex min-h-[100dvh] items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-7">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M4 19l2-9 4 5 4-8 4 8 4-5 2 9z" /></svg>
            </span>
            <span className="text-[13px] font-semibold tracking-[0.24em] text-ink">KING <span className="text-brand">CODEX</span></span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Solicitar acesso</h1>
            <p className="text-[14px] text-ink-muted">Seu acesso será aprovado manualmente pela coordenação.</p>
          </div>

          <form onSubmit={handleCadastro} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome" className="text-[13px] text-ink-secondary">Nome completo</Label>
              <Input id="nome" value={nome} onChange={e => setNome(e.target.value)} required
                className="h-10 bg-surface-canvas border-line" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px] text-ink-secondary">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="h-10 bg-surface-canvas border-line" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha" className="text-[13px] text-ink-secondary">Senha</Label>
              <Input id="senha" type="password" value={senha} onChange={e => setSenha(e.target.value)} required
                minLength={SENHA_MIN} autoComplete="new-password"
                className="h-10 bg-surface-canvas border-line" />
              <p className="text-[11px] text-ink-muted">Pelo menos {SENHA_MIN} caracteres.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmar-senha" className="text-[13px] text-ink-secondary">Confirmar senha</Label>
              <Input id="confirmar-senha" type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} required
                autoComplete="new-password"
                className="h-10 bg-surface-canvas border-line" />
            </div>

            {erro && (
              <div className="rounded-md border border-brand/25 bg-brand-soft px-3 py-2 text-[13px] text-brand-strong">
                {erro}
              </div>
            )}

            <Button type="submit" disabled={loading}
              className="btn-press w-full h-10 bg-ink text-ink-inverse hover:bg-ink/90 font-medium">
              {loading ? 'Enviando…' : 'Solicitar acesso'}
            </Button>

            <div className="flex items-center gap-3 py-0.5">
              <span className="h-px flex-1 bg-line-soft" />
              <span className="text-[11px] text-ink-muted">ou</span>
              <span className="h-px flex-1 bg-line-soft" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="btn-press w-full h-10 rounded-lg flex items-center justify-center gap-2.5
                         border border-line bg-surface-canvas text-ink text-[13px] font-medium
                         hover:bg-surface-subtle disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <GoogleIcon />
              Continuar com Google
            </button>
          </form>

          <p className="text-center text-[13px] text-ink-secondary">
            Já tem acesso?{' '}
            <Link to="/login" className="font-medium text-ink hover:text-brand underline-offset-4 hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
