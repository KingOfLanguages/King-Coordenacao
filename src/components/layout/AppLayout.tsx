import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/utils'
import { useState, useRef, useEffect } from 'react'

type NavItem = { to: string; label: string; exact?: boolean }

const navCoordenacao: NavItem[] = [
  { to: '/reunioes-dia', label: 'Reuniões do Dia' },
  { to: '/professores',  label: 'Professores' },
]
const navComum: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
]

function roleLabel(role?: string) {
  switch (role) {
    case 'admin':         return 'Admin'
    case 'coordenacao':   return 'Coordenação'
    case 'suporte':       return 'Suporte'
    case 'suporte_aluno': return 'Suporte · Aluno'
    default:              return '—'
  }
}

// ─── Brand Mark ───────────────────────────────────────────────────────────────

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <NavLink
      to="/"
      className="flex items-center gap-2.5 group flex-shrink-0"
    >
      {/* Outer shell */}
      <span className="relative flex h-8 w-8 items-center justify-center rounded-full p-[2px] bg-brand/10">
        {/* Inner core */}
        <span className="flex h-full w-full items-center justify-center rounded-full bg-brand
                         shadow-[0_1px_2px_rgba(209,51,58,0.5),inset_0_1px_0_rgba(255,255,255,0.3)]
                         transition-all duration-300 ease-spring group-hover:scale-105">
          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="currentColor" aria-hidden>
            <path d="M12 3L4 21l4-4 4 4 4-4 4 4z" />
          </svg>
        </span>
      </span>
      {!compact && (
        <span className="text-[12.5px] font-semibold tracking-[0.22em] text-ink transition-opacity duration-200">
          KING <span className="text-brand">NEXUS</span>
        </span>
      )}
    </NavLink>
  )
}

// ─── AppLayout ────────────────────────────────────────────────────────────────

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const navigate   = useNavigate()
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  const isCoord   = profile?.role === 'coordenacao' || profile?.role === 'admin'
  const isAdmin   = profile?.role === 'admin'

  const links: NavItem[] = [
    ...(isCoord   ? navCoordenacao : []),
    ...navComum,
    ...(isAdmin ? [
      { to: '/admin/aprovacoes',    label: 'Aprovações' },
      { to: '/admin/usuarios',      label: 'Usuários' },
      { to: '/admin/configuracoes', label: 'Configurações' },
    ] : []),
  ]

  const initials = profile?.nome
    ?.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() ?? '—'

  // Close profile dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false) }, [navigate])

  // Prevent scroll when menu is open
  useEffect(() => {
    document.documentElement.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.documentElement.style.overflow = '' }
  }, [menuOpen])

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-[100dvh] bg-surface-app text-ink">

      {/* ── Floating glass pill nav ─────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-40 flex justify-center items-start px-4 pt-3 pointer-events-none">
        <nav
          className={cn(
            'glass-pill pointer-events-auto',
            'flex items-center h-[52px] gap-1 pl-2 pr-2',
            'rounded-full max-w-[74rem] w-[calc(100%-0rem)]',
            'transition-all duration-500 ease-spring',
          )}
        >
          {/* Brand */}
          <div className="pl-1 pr-2">
            <BrandMark />
          </div>

          {/* Separator */}
          <div className="hidden md:block h-4 w-px bg-line-soft mx-1 flex-shrink-0" />

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-0.5 flex-1 overflow-hidden">
            {links.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) => cn(
                  'btn-press flex-shrink-0 px-3 py-1.5 rounded-full text-[12.5px] font-medium whitespace-nowrap',
                  isActive
                    ? 'bg-surface-subtle text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                    : 'text-ink-secondary hover:text-ink hover:bg-surface-subtle/60'
                )}
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          {/* Spacer (mobile: pushes right actions to the end) */}
          <div className="flex-1 md:hidden" />
          <div className="hidden md:block flex-none w-1" />

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Profile button (desktop) */}
          <div ref={profileRef} className="relative hidden md:block">
            <button
              onClick={() => setProfileOpen(o => !o)}
              className={cn(
                'btn-press flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full',
                'hover:bg-surface-subtle/80 transition-all duration-200',
                profileOpen && 'bg-surface-subtle',
              )}
            >
              {/* Avatar: squircle */}
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px]
                               bg-accentBlue-soft text-accentBlue text-[10px] font-semibold
                               ring-1 ring-accentBlue/15">
                {initials}
              </span>
              <span className="text-[12.5px] font-medium text-ink-secondary">
                {roleLabel(profile?.role)}
              </span>
            </button>

            {/* Profile dropdown */}
            {profileOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-60 animate-spring-in overflow-hidden
                              rounded-2xl border border-line-soft bg-surface-canvas
                              shadow-[0_12px_32px_-8px_rgba(0,0,0,0.14),0_4px_12px_-4px_rgba(0,0,0,0.06)]
                              dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.50)]">
                {/* User info */}
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line-soft bg-surface-subtle/40">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[12px]
                                   bg-accentBlue-soft text-accentBlue text-[13px] font-semibold
                                   ring-1 ring-accentBlue/15">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink truncate">{profile?.nome ?? '—'}</p>
                    <p className="text-[11px] text-ink-muted">{roleLabel(profile?.role)}</p>
                  </div>
                </div>
                {/* Actions */}
                <div className="p-1.5">
                  <button
                    onClick={handleLogout}
                    className="btn-press w-full flex items-center gap-2.5 px-3 py-2 rounded-xl
                               text-[12.5px] text-ink-secondary
                               hover:bg-brand-soft hover:text-brand-strong
                               transition-colors duration-150"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sair da conta
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile hamburger (morph lines → X) */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            className="md:hidden btn-press flex items-center justify-center h-9 w-9 rounded-full hover:bg-surface-subtle/80 flex-shrink-0"
          >
            <div className="relative w-[18px] h-3.5">
              <span className={cn(
                'absolute inset-x-0 h-[1.5px] rounded-full bg-ink origin-center transition-all duration-350 ease-spring',
                menuOpen ? 'top-[6px] rotate-45' : 'top-0',
              )} />
              <span className={cn(
                'absolute inset-x-0 top-[6px] h-[1.5px] rounded-full bg-ink transition-all duration-350 ease-spring origin-center',
                menuOpen ? 'opacity-0 scale-x-0' : 'opacity-100 scale-x-100',
              )} />
              <span className={cn(
                'absolute inset-x-0 h-[1.5px] rounded-full bg-ink origin-center transition-all duration-350 ease-spring',
                menuOpen ? 'top-[6px] -rotate-45' : 'top-[13px]',
              )} />
            </div>
          </button>
        </nav>
      </header>

      {/* ── Mobile overlay menu ─────────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-30 flex flex-col" aria-modal="true">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-surface-app/95 backdrop-blur-3xl"
            onClick={() => setMenuOpen(false)}
          />

          {/* Nav links — staggered reveal */}
          <div className="relative flex flex-col items-center justify-center flex-1 gap-1 px-6">
            {links.map((item, i) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                onClick={() => setMenuOpen(false)}
                style={{ '--i': i } as React.CSSProperties}
                className={({ isActive }) => cn(
                  'nav-reveal-item w-full max-w-xs text-center py-3.5 rounded-2xl text-[28px] font-semibold tracking-[-0.02em]',
                  'transition-colors duration-200',
                  isActive
                    ? 'text-ink bg-surface-subtle/60'
                    : 'text-ink/40 hover:text-ink',
                )}
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          {/* Bottom profile + logout */}
          <div
            className="relative pb-12 px-6 flex items-center justify-between"
            style={{ '--i': links.length } as React.CSSProperties}
          >
            <div className="nav-reveal-item flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[11px]
                               bg-accentBlue-soft text-accentBlue text-[12px] font-semibold">
                {initials}
              </span>
              <div>
                <p className="text-[13px] font-semibold text-ink">{profile?.nome}</p>
                <p className="text-[11px] text-ink-muted">{roleLabel(profile?.role)}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="nav-reveal-item btn-press flex items-center gap-2 px-4 py-2 rounded-full
                         bg-brand-soft text-brand text-[13px] font-medium"
              style={{ '--i': links.length + 1 } as React.CSSProperties}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
      )}

      {/* ── Main content — offset for fixed pill nav ─────────────────── */}
      <main className="relative pt-[4.5rem]">
        <Outlet />
      </main>
    </div>
  )
}
