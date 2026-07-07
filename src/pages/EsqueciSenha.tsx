import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail } from 'lucide-react'

export function EsqueciSenha() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro]       = useState('')

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })

    if (error) {
      setErro('Não foi possível enviar o e-mail agora. Tente novamente em instantes.')
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
          <Mail className="h-5 w-5" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-ink">Verifique seu e-mail</h2>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Se <strong className="text-ink">{email}</strong> tiver uma conta na plataforma, você vai
          receber um link para redefinir sua senha em instantes.
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
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Esqueci minha senha</h1>
            <p className="text-[14px] text-ink-muted">Informe seu e-mail e enviaremos um link para redefinir sua senha.</p>
          </div>

          <form onSubmit={handleEnviar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px] text-ink-secondary">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
                autoComplete="email" placeholder="voce@king.com"
                className="h-10 bg-surface-canvas border-line" />
            </div>

            {erro && (
              <div className="rounded-md border border-brand/25 bg-brand-soft px-3 py-2 text-[13px] text-brand-strong">
                {erro}
              </div>
            )}

            <Button type="submit" disabled={loading}
              className="btn-press w-full h-10 bg-ink text-white hover:bg-ink/90 font-medium">
              {loading ? 'Enviando…' : 'Enviar link de redefinição'}
            </Button>
          </form>

          <p className="text-center text-[13px] text-ink-secondary">
            Lembrou a senha?{' '}
            <Link to="/login" className="font-medium text-ink hover:text-brand underline-offset-4 hover:underline">
              Voltar ao login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
