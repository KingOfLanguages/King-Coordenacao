import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, ChevronDown } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/utils'
import { useState, useRef, useEffect } from 'react'

type NavItem = { to: string; label: string; exact?: boolean }

const navCoordenacao: NavItem[] = [
  { to: '/professores',   label: 'Professores' },
  { to: '/reunioes',      label: 'Reuniões' },
  { to: '/reunioes/nova', label: 'Nova Reunião' },
]

const navSuporte: NavItem[] = [
  { to: '/incidentes',  label: 'Incidentes' },
  { to: '/mes-analise', label: 'Mês de Análise' },
]

const navComum: NavItem[] = [
  { to: '/relatorios', label: 'Relatórios' },
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

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isCoord   = profile?.role === 'coordenacao' || profile?.role === 'admin'
  const isSuporte = profile?.role === 'suporte' || profile?.role === 'suporte_aluno' || profile?.role === 'admin'
  const isAdmin   = profile?.role === 'admin'

  const links: NavItem[] = [
    ...(isCoord   ? navCoordenacao : []),
    ...(isSuporte ? navSuporte     : []),
    ...navComum,
    ...(isAdmin ? [
      { to: '/admin/aprovacoes', label: 'Aprovações' },
      { to: '/admin/usuarios',   label: 'Usuários' },
    ] : []),
  ]

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-[100dvh] bg-surface-app text-ink">
      <header className="sticky top-0 z-30 border-b border-line-soft bg-surface-canvas/85 backdrop-blur-md">
        <div className="flex h-14 items-center gap-6 px-6">
          {/* Brand */}
          <NavLink to="/" className="flex items-center gap-2.5 group">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white shadow-[0_1px_2px_rgba(209,51,58,0.35),inset_0_1px_0_rgba(255,255,255,0.25)]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M4 19l2-9 4 5 4-8 4 8 4-5 2 9z" />
              </svg>
            </span>
            <span className="text-[13px] font-semibold tracking-[0.24em] text-ink">
              KING <span className="text-brand">NEXUS</span>
            </span>
          </NavLink>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-1 ml-2">
            {links.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) => cn(
                  'btn-press px-3 py-1.5 rounded-md text-[13px] font-medium',
                  isActive
                    ? 'bg-surface-subtle text-ink'
                    : 'text-ink-secondary hover:text-ink hover:bg-surface-subtle/60'
                )}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1" />

          <ThemeToggle />

          {/* Profile */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="btn-press flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-md hover:bg-surface-subtle"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accentBlue-soft text-accentBlue text-[11px] font-semibold">
                {profile?.nome?.slice(0, 2).toUpperCase() ?? '—'}
              </span>
              <span className="text-[13px] font-medium text-ink">{roleLabel(profile?.role)}</span>
              <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] w-56 rounded-xl border border-line bg-surface-canvas shadow-popover animate-fade-up overflow-hidden">
                <div className="px-3 py-2.5 border-b border-line-soft">
                  <p className="text-[13px] font-medium text-ink truncate">{profile?.nome ?? '—'}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{roleLabel(profile?.role)}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-ink-secondary hover:bg-surface-subtle hover:text-brand transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative">
        <Outlet />
      </main>
    </div>
  )
}
