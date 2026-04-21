import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function Login() {
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [erro, setErro]       = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      setErro('E-mail ou senha inválidos.')
      setLoading(false)
      return
    }
    navigate('/')
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface-app">
      {/* Ambient radial wash */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(700px circle at 20% 15%, rgba(209,51,58,0.07), transparent 55%),' +
            'radial-gradient(600px circle at 85% 85%, rgba(42,92,255,0.05), transparent 60%)',
        }}
      />

      <div className="relative grid lg:grid-cols-2 min-h-[100dvh]">
        {/* Left — brand column */}
        <section className="hidden lg:flex flex-col justify-between p-10 xl:p-14 border-r border-line-soft">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white shadow-[0_1px_2px_rgba(209,51,58,0.35),inset_0_1px_0_rgba(255,255,255,0.25)]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M4 19l2-9 4 5 4-8 4 8 4-5 2 9z" />
              </svg>
            </span>
            <span className="text-[13px] font-semibold tracking-[0.24em] text-ink">
              KING <span className="text-brand">NEXUS</span>
            </span>
          </div>

          <div className="max-w-md space-y-5">
            <h2 className="text-4xl font-semibold tracking-tightest text-ink leading-[1.05]">
              Coordenação, suporte e relatórios, <span className="text-ink-muted">em um só lugar.</span>
            </h2>
            <p className="text-[15px] text-ink-secondary leading-relaxed max-w-sm">
              Acompanhe professores, registre incidentes e exporte análises sem alternar entre planilhas.
            </p>
          </div>

          <div className="flex items-center gap-6 text-xs text-ink-muted">
            <span>v1.0</span>
            <span className="h-3 w-px bg-line" />
            <span>© King Education</span>
          </div>
        </section>

        {/* Right — form column */}
        <section className="flex items-center justify-center p-6 lg:p-10">
          <div className="w-full max-w-sm space-y-7">
            <div className="lg:hidden flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M4 19l2-9 4 5 4-8 4 8 4-5 2 9z" /></svg>
              </span>
              <span className="text-[13px] font-semibold tracking-[0.24em] text-ink">KING <span className="text-brand">NEXUS</span></span>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">Entrar</h1>
              <p className="text-[14px] text-ink-muted">Use as credenciais da sua conta King.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[13px] text-ink-secondary">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-10 bg-surface-canvas border-line focus-visible:ring-accentBlue"
                  placeholder="voce@king.com"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="senha" className="text-[13px] text-ink-secondary">Senha</Label>
                </div>
                <Input
                  id="senha"
                  type="password"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-10 bg-surface-canvas border-line focus-visible:ring-accentBlue"
                />
              </div>

              {erro && (
                <div className="rounded-md border border-brand/25 bg-brand-soft px-3 py-2 text-[13px] text-brand-strong">
                  {erro}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="btn-press w-full h-10 bg-ink text-white hover:bg-ink/90 font-medium"
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </Button>
            </form>

            <div className="flex items-center gap-3 text-xs text-ink-muted">
              <span className="h-px flex-1 bg-line-soft" />
              <span>ou</span>
              <span className="h-px flex-1 bg-line-soft" />
            </div>

            <p className="text-center text-[13px] text-ink-secondary">
              Não tem acesso?{' '}
              <Link to="/cadastro" className="font-medium text-ink hover:text-brand underline-offset-4 hover:underline">
                Solicitar acesso
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
