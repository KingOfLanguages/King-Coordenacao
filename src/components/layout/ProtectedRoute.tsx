import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { RoleUsuario } from '@/types'

interface Props {
  children: React.ReactNode
  roles?: RoleUsuario[]
  /** Também libera se profile.is_admin (ou o legado role === 'admin'). */
  admin?: boolean
  /** Também libera se profile.is_lider. */
  lider?: boolean
}

export function ProtectedRoute({ children, roles, admin, lider }: Props) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-surface-app">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span className="text-ink-muted text-sm">Carregando…</span>
        </div>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  // If restricted, require a loaded profile matching role and/or flags.
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
