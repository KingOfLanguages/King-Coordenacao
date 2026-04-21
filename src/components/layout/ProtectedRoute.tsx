import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { RoleUsuario } from '@/types'

interface Props {
  children: React.ReactNode
  roles?: RoleUsuario[]
}

export function ProtectedRoute({ children, roles }: Props) {
  const { session, profile, loading } = useAuth()

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-king-dark">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-king-red border-t-transparent animate-spin" />
        <span className="text-white/40 text-sm">Carregando...</span>
      </div>
    </div>
  )
  if (!session) return <Navigate to="/login" replace />
  if (roles && profile && !roles.includes(profile.role)) return <Navigate to="/login" replace />

  return <>{children}</>
}