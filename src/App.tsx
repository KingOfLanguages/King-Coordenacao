import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { Login } from '@/pages/Login'
import { Cadastro } from '@/pages/Cadastro'
import { ProfessoresPage } from '@/pages/professores/ProfessoresPage'
import { ProfessorDetalhePage } from '@/pages/professores/ProfessorDetalhePage'
import { AcompanhamentoPage } from '@/pages/acompanhamento/AcompanhamentoPage'
import { AprovacoesPage } from '@/pages/admin/AprovacoesPage'
import { UsuariosPage } from '@/pages/admin/UsuariosPage'
import { ConfiguracoesPage } from '@/pages/admin/ConfiguracoesPage'
import { DashboardCoordPage } from '@/pages/dashboard/DashboardCoordPage'
import { ReunioesDiaPage } from '@/pages/reunioes/ReunioesDiaPage'
import { Home as AgendamentoPage } from '@/pages/agendamentos/Home'
import { AgendasPage } from '@/pages/admin/AgendasPage'

const queryClient = new QueryClient()

// Home: todos vão para o Dashboard da Coordenação.
function IndexRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (!profile) return <Navigate to="/login" replace />
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login"    element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/agendar"  element={<AgendamentoPage />} />

            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<IndexRedirect />} />

              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <DashboardCoordPage />
                </ProtectedRoute>
              } />

              <Route path="/professores" element={
                <ProtectedRoute roles={['coordenacao', 'admin']}>
                  <ProfessoresPage />
                </ProtectedRoute>
              } />
              <Route path="/professores/:id" element={
                <ProtectedRoute roles={['coordenacao', 'admin']}>
                  <ProfessorDetalhePage />
                </ProtectedRoute>
              } />
              <Route path="/reunioes-dia" element={
                <ProtectedRoute roles={['coordenacao', 'admin']}>
                  <ReunioesDiaPage />
                </ProtectedRoute>
              } />
              <Route path="/acompanhamento" element={
                <ProtectedRoute roles={['coordenacao', 'admin']}>
                  <AcompanhamentoPage />
                </ProtectedRoute>
              } />

              {/* Admin */}
              <Route path="/admin/aprovacoes" element={
                <ProtectedRoute roles={['admin']}>
                  <AprovacoesPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/usuarios" element={
                <ProtectedRoute roles={['admin']}>
                  <UsuariosPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/configuracoes" element={
                <ProtectedRoute roles={['admin']}>
                  <ConfiguracoesPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/agendas" element={
                <ProtectedRoute roles={['admin', 'coordenacao']}>
                  <AgendasPage />
                </ProtectedRoute>
              } />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster theme="system" />
      </AuthProvider>
    </QueryClientProvider>
    </ThemeProvider>
  )
}
