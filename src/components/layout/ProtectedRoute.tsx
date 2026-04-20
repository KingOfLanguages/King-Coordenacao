import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { RoleUsuario } from '@/types'

interface Props {
  children: React.ReactNode
  roles?: RoleUsuario[]
}

export function ProtectedRoute({ children, roles }: Props) {
  const { session, profile, loading } = useAuth()

  if (loading) return <div className="flex h-screen items-center justify-center text-white">Carregando...</div>
  if (!session) return <Navigate to="/login" replace />
  if (roles && profile && !roles.includes(profile.role)) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}