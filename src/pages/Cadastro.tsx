import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2 } from 'lucide-react'

export function Cadastro() {
  const [nome, setNome]       = useState('')
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro]       = useState('')

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')

    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    })

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        setErro('Este e-mail já possui uma conta cadastrada.')
      } else {
        setErro(`Erro ao criar conta: ${error.message}`)
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

    const { error: insertError } = await supabase.from('pending_approvals').insert({
      user_id: data.user.id,
      email,
      nome,
      role_solicitada: 'suporte',
    })

    if (insertError) {
      // Conta foi criada no Auth mas a solicitação não foi registrada
      setErro(
        `Conta criada, mas houve um erro ao registrar a solicitação: ${insertError.message}. ` +
        `Entre em contato com o administrador informando seu e-mail.`
      )
      setLoading(false)
      return
    }

    setEnviado(true)
    setLoading(false)
  }

  if (enviado) return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface-app p-6">
      <div className="max-w-sm w-full card-surface p-8 text-center space-y-4 animate-fade-up">
        <div className="mx-auto h-11 w-11 rounded-full bg-urg-lowBg text-urg-lowFg flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-ink">Solicitação enviada</h2>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Sua conta foi criada e está aguardando aprovação do administrador. Você receberá acesso em breve.
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
            <span className="text-[13px] font-semibold tracking-[0.24em] text-ink">KING <span className="text-brand">TEACHERTRACK</span></span>
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
                className="h-10 bg-surface-canvas border-line" />
            </div>

            {erro && (
              <div className="rounded-md border border-brand/25 bg-brand-soft px-3 py-2 text-[13px] text-brand-strong">
                {erro}
              </div>
            )}

            <Button type="submit" disabled={loading}
              className="btn-press w-full h-10 bg-ink text-white hover:bg-ink/90 font-medium">
              {loading ? 'Enviando…' : 'Solicitar acesso'}
            </Button>
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
