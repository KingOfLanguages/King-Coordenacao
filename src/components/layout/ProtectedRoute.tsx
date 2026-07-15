import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useCanView } from '@/hooks/usePagePermissions'
import type { RoleUsuario } from '@/types'

interface Props {
  children: React.ReactNode
  roles?: RoleUsuario[]
  /** Também libera se profile.is_admin (ou o legado role === 'admin'). */
  admin?: boolean
  /** Também libera se profile.is_lider. */
  lider?: boolean
  /**
   * Chave da página no sistema de controle de acesso (src/lib/pagePermissions).
   * Quando presente, o acesso é decidido pelo registry + overrides configuráveis
   * (com bypass de admin), em vez das props roles/admin/lider.
   */
  page?: string
}

function Carregando() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface-app">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        <span className="text-ink-muted text-sm">Carregando…</span>
      </div>
    </div>
  )
}

export function ProtectedRoute({ children, roles, admin, lider, page }: Props) {
  const { session, profile, loading } = useAuth()
  const { canView, isLoading: permsLoading } = useCanView()

  if (loading) return <Carregando />
  if (!session) return <Navigate to="/login" replace />

  // Controle configurável por página (registry + overrides).
  if (page) {
    if (!profile) return <Navigate to="/login" replace />
    if (permsLoading) return <Carregando />
    if (!canView(page)) return <Navigate to="/" replace />
    return <>{children}</>
  }

  // Legado: props roles/admin/lider (rotas admin-only e o wrapper do layout).
  if (roles || admin || lider) {
    if (!profile) return <Navigate to="/login" replace />
    const ehAdmin  = profile.is_admin || profile.role === 'admin'
    const liberado =
      (roles?.includes(profile.role) ?? false) ||
      (admin === true && ehAdmin) ||
      (lider === true && profile.is_lider)
    if (!liberado) return <Navigate to="/" replace />
  }

  return <>{children}</>
}
