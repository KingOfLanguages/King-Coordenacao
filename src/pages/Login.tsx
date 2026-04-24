import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ─── Feature list ─────────────────────────────────────────────────────────────

const FEATURES = [
  { label: 'Gestão completa de professores e histórico' },
  { label: 'Importação automática do Google Calendar' },
  { label: 'Relatórios e análises exportáveis' },
]

// ─── Login Page ───────────────────────────────────────────────────────────────

export function Login() {
  const [email,   setEmail]   = useState('')
  const [senha,   setSenha]   = useState('')
  const [erro,    setErro]    = useState('')
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

      {/* ── Background: layered radial mesh ─────────────────────────── */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: [
            'radial-gradient(ellipse 60% 50% at 15% 0%,   rgba(209,51,58,0.09),  transparent 55%)',
            'radial-gradient(ellipse 50% 40% at 90% 95%,  rgba(42,92,255,0.07),  transparent 60%)',
            'radial-gradient(ellipse 35% 30% at 50% 45%,  rgba(42,92,255,0.03),  transparent 70%)',
          ].join(','),
        }}
      />

      <div className="relative grid lg:grid-cols-[1fr_480px] min-h-[100dvh]">

        {/* ── Left: brand column ──────────────────────────────────────── */}
        <section className="hidden lg:flex flex-col justify-between py-12 px-12 xl:px-16
                            border-r border-line-soft overflow-hidden">

          {/* Logo */}
          <div className="flex items-center gap-2.5 animate-[float-up_700ms_cubic-bezier(0.32,0.72,0,1)_both]">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full p-[2px] bg-brand/10">
              <span className="flex h-full w-full items-center justify-center rounded-full bg-brand
                               shadow-[0_1px_2px_rgba(209,51,58,0.5),inset_0_1px_0_rgba(255,255,255,0.3)]">
                <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] text-white" fill="currentColor" aria-hidden>
                  <path d="M12 3L4 21l4-4 4 4 4-4 4 4z" />
                </svg>
              </span>
            </span>
            <span className="text-[13px] font-semibold tracking-[0.22em] text-ink">
              KING <span className="text-brand">NEXUS</span>
            </span>
          </div>

          {/* Main content */}
          <div className="max-w-[420px] space-y-10">

            {/* Eyebrow */}
            <div
              className="animate-[float-up_700ms_cubic-bezier(0.32,0.72,0,1)_80ms_both]"
            >
              <span className="eyebrow-tag">
                <span className="h-1.5 w-1.5 rounded-full bg-urg-lowFg" />
                Plataforma de coordenação
              </span>
            </div>

            {/* Headline */}
            <div className="space-y-3 animate-[float-up_700ms_cubic-bezier(0.32,0.72,0,1)_140ms_both]">
              <h2 className="text-[4.25rem] leading-[0.91] font-bold tracking-[-0.04em] text-ink">
                Coordene<br />
                <span className="text-ink/35">com</span><br />
                clareza.
              </h2>
            </div>

            {/* Feature list */}
            <ul className="space-y-3.5 animate-[float-up_700ms_cubic-bezier(0.32,0.72,0,1)_200ms_both]">
              {FEATURES.map((f, i) => (
                <li
                  key={f.label}
                  className="flex items-start gap-3"
                  style={{ animationDelay: `${200 + i * 60}ms` }}
                >
                  <div className="flex-shrink-0 mt-[3px] h-5 w-5 rounded-full bg-urg-lowBg
                                  flex items-center justify-center">
                    <svg viewBox="0 0 16 16" className="h-3 w-3 text-urg-lowFg" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M2.5 8l4 4 7-7" />
                    </svg>
                  </div>
                  <p className="text-[15px] text-ink-secondary leading-snug">{f.label}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-5 text-[12px] text-ink-muted
                          animate-[float-up_700ms_cubic-bezier(0.32,0.72,0,1)_320ms_both]">
            <span className="tabular-nums">v1.0</span>
            <span className="h-3 w-px bg-line" />
            <span>© {new Date().getFullYear()} King Education</span>
          </div>
        </section>

        {/* ── Right: form column ──────────────────────────────────────── */}
        <section className="flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-sm space-y-7">

            {/* Mobile logo */}
            <div className="lg:hidden flex items-center gap-2.5
                            animate-[float-up_700ms_cubic-bezier(0.32,0.72,0,1)_both]">
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full p-[2px] bg-brand/10">
                <span className="flex h-full w-full items-center justify-center rounded-full bg-brand
                                 shadow-[0_1px_2px_rgba(209,51,58,0.4),inset_0_1px_0_rgba(255,255,255,0.3)]">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="currentColor">
                    <path d="M12 3L4 21l4-4 4 4 4-4 4 4z" />
                  </svg>
                </span>
              </span>
              <span className="text-[13px] font-semibold tracking-[0.22em] text-ink">
                KING <span className="text-brand">NEXUS</span>
              </span>
            </div>

            {/* Heading */}
            <div className="space-y-1.5
                            animate-[float-up_700ms_cubic-bezier(0.32,0.72,0,1)_60ms_both]">
              <h1 className="text-[1.85rem] font-bold tracking-[-0.03em] text-ink leading-tight">
                Entrar
              </h1>
              <p className="text-[14px] text-ink-muted leading-relaxed">
                Use as credenciais da sua conta King Education.
              </p>
            </div>

            {/* ── Form card: double-bezel ── */}
            <div className="animate-[spring-in_700ms_cubic-bezier(0.32,0.72,0,1)_120ms_both]">
              {/* Outer shell */}
              <div className="rounded-[1.625rem] p-[1.5px]
                              bg-surface-subtle border border-line-soft
                              shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]
                              dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.04)]">
                {/* Inner core */}
                <div className="rounded-[1.5rem] bg-surface-canvas px-6 py-7 space-y-5
                                shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]
                                dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">

                  <form onSubmit={handleLogin} className="space-y-4">
                    {/* Email */}
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-[12px] text-ink-secondary font-medium">
                        E-mail
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        placeholder="voce@king.com"
                        className="h-10 bg-surface-subtle border-line-soft text-[13px]
                                   focus-visible:ring-2 focus-visible:ring-accentBlue-soft
                                   focus-visible:border-accentBlue rounded-xl
                                   transition-all duration-200 ease-spring"
                      />
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                      <Label htmlFor="senha" className="text-[12px] text-ink-secondary font-medium">
                        Senha
                      </Label>
                      <Input
                        id="senha"
                        type="password"
                        value={senha}
                        onChange={e => setSenha(e.target.value)}
                        required
                        autoComplete="current-password"
                        className="h-10 bg-surface-subtle border-line-soft text-[13px]
                                   focus-visible:ring-2 focus-visible:ring-accentBlue-soft
                                   focus-visible:border-accentBlue rounded-xl
                                   transition-all duration-200 ease-spring"
                      />
                    </div>

                    {/* Error */}
                    {erro && (
                      <div className="rounded-xl border border-brand/20 bg-brand-soft px-3.5 py-2.5
                                      text-[12.5px] text-brand-strong font-medium animate-fade-up">
                        {erro}
                      </div>
                    )}

                    {/* ── CTA: button-in-button pattern ── */}
                    <button
                      type="submit"
                      disabled={loading}
                      className={cn(
                        'btn-press group relative w-full h-11 rounded-full',
                        'bg-ink text-white',
                        'flex items-center justify-between pl-5 pr-1.5',
                        'shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.12)]',
                        'hover:bg-ink/90 disabled:opacity-60 disabled:cursor-not-allowed',
                        'font-medium text-[13.5px]',
                      )}
                    >
                      <span className="transition-transform duration-300 ease-spring group-hover:-translate-x-0.5">
                        {loading ? 'Entrando…' : 'Entrar na plataforma'}
                      </span>

                      {/* Trailing icon "button-in-button" */}
                      <span className="flex h-8 w-8 items-center justify-center rounded-full
                                       bg-white/10 flex-shrink-0
                                       group-hover:bg-white/16 group-hover:translate-x-0.5
                                       group-hover:-translate-y-[1px] group-hover:scale-105
                                       transition-all duration-300 ease-spring">
                        {loading ? (
                          <svg className="h-3.5 w-3.5 animate-spin text-white" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M3 8h10M9 4l4 4-4 4" />
                          </svg>
                        )}
                      </span>
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* ── Footer link ── */}
            <p className="text-center text-[13px] text-ink-muted
                          animate-[float-up_700ms_cubic-bezier(0.32,0.72,0,1)_280ms_both]">
              Não tem acesso?{' '}
              <Link
                to="/cadastro"
                className="font-semibold text-ink underline underline-offset-4 decoration-line hover:decoration-ink transition-colors"
              >
                Solicitar conta
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
