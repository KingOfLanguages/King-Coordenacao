import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Users, Calendar, AlertTriangle, BarChart2, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navCoordenacao = [
  { to: '/professores',   label: 'Professores',  icon: Users },
  { to: '/reunioes/nova', label: 'Nova Reunião', icon: Calendar },
]

const navSuporte = [
  { to: '/incidentes',  label: 'Incidentes', icon: AlertTriangle },
  { to: '/mes-analise', label: 'Análise',    icon: BarChart2 },
]

const navComum = [
  { to: '/relatorios', label: 'Relatórios', icon: BarChart2 },
]

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const isCoordenacao = profile?.role === 'coordenacao' || profile?.role === 'admin'
  const isSuporte     = profile?.role === 'suporte' || profile?.role === 'suporte_aluno' || profile?.role === 'admin'
  const isAdmin       = profile?.role === 'admin'

  const links = [
    ...(isCoordenacao ? navCoordenacao : []),
    ...(isSuporte     ? navSuporte     : []),
    ...navComum,
  ]

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-king-dark flex">
      <aside className="w-56 flex-shrink-0 border-r border-king-border bg-king-card flex flex-col">
        <div className="p-5 border-b border-king-border">
          <span className="font-bold text-white text-lg tracking-tight">King</span>
          <span className="text-king-red font-bold text-lg"> SaaS</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-king-red/15 text-king-red font-medium'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}

          {isAdmin && (
            <NavLink
              to="/admin/aprovacoes"
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-king-red/15 text-king-red font-medium'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              Aprovações
            </NavLink>
          )}
        </nav>

        <div className="p-3 border-t border-king-border">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs text-white/40 truncate">{profile?.nome}</p>
            <p className="text-xs text-white/20 capitalize">{profile?.role}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start gap-3 text-white/50 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
