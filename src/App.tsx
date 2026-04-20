import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { Login } from '@/pages/Login'
import { Cadastro } from '@/pages/Cadastro'
import { ProfessoresPage } from '@/pages/professores/ProfessoresPage'
import { ProfessorDetalhePage } from '@/pages/professores/ProfessorDetalhePage'
import { NovaReuniaoPage } from '@/pages/reunioes/NovaReuniaoPage'
import { IncidentesPage } from '@/pages/incidentes/IncidentesPage'
import { IncidenteDetalhePage } from '@/pages/incidentes/IncidenteDetalhePage'
import { MesAnalisePage } from '@/pages/incidentes/MesAnalisePage'
import { AprovacoesPage } from '@/pages/admin/AprovacoesPage'

const queryClient = new QueryClient()

const EmConstrucao = ({ label }: { label: string }) => (
  <div className="flex h-64 items-center justify-center text-white/40">{label} — em construção</div>
)

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login"    element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />

            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Navigate to="/professores" replace />} />

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
              <Route path="/reunioes/nova" element={
                <ProtectedRoute roles={['coordenacao', 'admin']}>
                  <NovaReuniaoPage />
                </ProtectedRoute>
              } />

              {/* Suporte */}
              <Route path="/incidentes" element={
                <ProtectedRoute roles={['suporte', 'suporte_aluno', 'admin']}>
                  <IncidentesPage />
                </ProtectedRoute>
              } />
              <Route path="/incidentes/:id" element={
                <ProtectedRoute roles={['suporte', 'suporte_aluno', 'admin']}>
                  <IncidenteDetalhePage />
                </ProtectedRoute>
              } />
              <Route path="/mes-analise" element={
                <ProtectedRoute roles={['suporte', 'admin']}>
                  <MesAnalisePage />
                </ProtectedRoute>
              } />

              {/* Admin */}
              <Route path="/admin/aprovacoes" element={
                <ProtectedRoute roles={['admin']}>
                  <AprovacoesPage />
                </ProtectedRoute>
              } />

              {/* Semana 5 */}
              <Route path="/relatorios" element={<EmConstrucao label="Relatórios" />} />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster theme="dark" />
      </AuthProvider>
    </QueryClientProvider>
  )
}
