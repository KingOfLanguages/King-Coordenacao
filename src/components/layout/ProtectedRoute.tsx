import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { RoleUsuario } from '@/types'

interface Props {
  children: React.ReactNode
  roles?: RoleUsuario[]
}

export function ProtectedRoute({ children, roles }: Props) {
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

  // If role-restricted, require a loaded profile with matching role.
  if (roles) {
    if (!profile)                       return <Navigate to="/login" replace />
    if (!roles.includes(profile.role))  return <Navigate to="/" replace />
  }

  return <>{children}</>
}
