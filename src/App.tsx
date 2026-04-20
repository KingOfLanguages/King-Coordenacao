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

              {/* Semana 4 */}
              <Route path="/incidentes"       element={<EmConstrucao label="Incidentes" />} />
              <Route path="/incidentes/:id"   element={<EmConstrucao label="Detalhe do Incidente" />} />
              <Route path="/mes-analise"      element={<EmConstrucao label="Análise Mensal" />} />
              <Route path="/relatorios"       element={<EmConstrucao label="Relatórios" />} />
              <Route path="/admin/aprovacoes" element={<EmConstrucao label="Aprovações" />} />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster theme="dark" />
      </AuthProvider>
    </QueryClientProvider>
  )
}
