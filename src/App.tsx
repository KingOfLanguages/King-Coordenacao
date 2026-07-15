import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { useCanView } from '@/hooks/usePagePermissions'
import { PAGES, PAGE_BY_KEY } from '@/lib/pagePermissions'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { Login } from '@/pages/Login'
import { Cadastro } from '@/pages/Cadastro'
import { EsqueciSenha } from '@/pages/EsqueciSenha'
import { RedefinirSenha } from '@/pages/RedefinirSenha'
import { AuthCallback } from '@/pages/AuthCallback'
import { ProfessoresPage } from '@/pages/professores/ProfessoresPage'
import { ProfessorDetalhePage } from '@/pages/professores/ProfessorDetalhePage'
import { RetornoPausaPage } from '@/pages/professores/RetornoPausaPage'
import { ObservacaoDetalhePage } from '@/pages/observacoes/ObservacaoDetalhePage'
import { AcompanhamentoPage } from '@/pages/acompanhamento/AcompanhamentoPage'
import { SilencioPage } from '@/pages/silencio/SilencioPage'
import { MesAnalisePage } from '@/pages/mesAnalise/MesAnalisePage'
import { IncidentesPage } from '@/pages/incidentes/IncidentesPage'
import { AlunosPage } from '@/pages/alunos/AlunosPage'
import { AprovacoesPage } from '@/pages/admin/AprovacoesPage'
import { UsuariosPage } from '@/pages/admin/UsuariosPage'
import { ConfiguracoesPage } from '@/pages/admin/ConfiguracoesPage'
import { DashboardCoordPage } from '@/pages/dashboard/DashboardCoordPage'
import { DashboardGeralPage } from '@/pages/dashboard/DashboardGeralPage'
import { ReunioesDiaPage } from '@/pages/reunioes/ReunioesDiaPage'
import { Home as AgendamentoPage } from '@/pages/agendamentos/Home'
import { AgendasPage } from '@/pages/admin/AgendasPage'
import { SuporteReunioesPage } from '@/pages/suporte/SuporteReunioesPage'
import { OnboardingPage } from '@/pages/onboarding/OnboardingPage'
import { TarefasPage } from '@/pages/tarefas/TarefasPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dados frescos por 30s evitam refetch (e flashes de "Carregando…") a cada
      // navegação; e não recarregar tudo ao refocar a aba deixa a navegação fluida.
      // Mutations continuam invalidando as queries relevantes na hora.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

// Home: manda o usuário pra primeira página que ele pode ver, segundo o controle
// de acesso configurável. Prioriza Dashboard, depois Professores, depois o resto —
// assim ninguém cai numa rota bloqueada (o que causaria loop de redirect).
const LANDING_PRIORITY = ['dashboard', 'professores', 'suporte-reunioes', 'tarefas']

function IndexRedirect() {
  const { profile, loading } = useAuth()
  const { canView, isLoading: permsLoading } = useCanView()
  if (loading || permsLoading) return null
  if (!profile) return <Navigate to="/login" replace />

  const ordem = [...LANDING_PRIORITY, ...PAGES.map(p => p.key)]
  for (const key of ordem) {
    if (canView(key)) return <Navigate to={PAGE_BY_KEY[key].path} replace />
  }
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6 text-center">
      <p className="text-[13px] text-ink-muted">
        Você ainda não tem acesso a nenhuma página. Fale com um administrador.
      </p>
    </div>
  )
}

// Quem já tem sessão não deveria ver o formulário de login/cadastro de novo.
function SoDeslogado({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login"          element={<SoDeslogado><Login /></SoDeslogado>} />
            <Route path="/cadastro"       element={<SoDeslogado><Cadastro /></SoDeslogado>} />
            <Route path="/esqueci-senha"  element={<SoDeslogado><EsqueciSenha /></SoDeslogado>} />
            {/* Sem SoDeslogado: o link do e-mail já cria uma sessão de recovery — redirecionar
                pra "/" aqui derrubaria o usuário antes de conseguir trocar a senha. */}
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />
            {/* Retorno do OAuth (Google) — precisa da sessão viva pra decidir o destino. */}
            <Route path="/auth/callback"  element={<AuthCallback />} />
            <Route path="/agendar"        element={<AgendamentoPage />} />

            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<IndexRedirect />} />

              <Route path="/dashboard" element={
                <ProtectedRoute page="dashboard">
                  <DashboardCoordPage />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/geral" element={
                <ProtectedRoute page="dashboard-geral">
                  <DashboardGeralPage />
                </ProtectedRoute>
              } />

              <Route path="/professores" element={
                <ProtectedRoute page="professores">
                  <ProfessoresPage />
                </ProtectedRoute>
              } />
              <Route path="/professores/:id" element={
                <ProtectedRoute page="professores">
                  <ProfessorDetalhePage />
                </ProtectedRoute>
              } />
              <Route path="/observacoes/:id" element={
                <ProtectedRoute page="professores">
                  <ObservacaoDetalhePage />
                </ProtectedRoute>
              } />
              <Route path="/reunioes-dia" element={
                <ProtectedRoute page="reunioes-dia">
                  <ReunioesDiaPage />
                </ProtectedRoute>
              } />
              <Route path="/acompanhamento" element={
                <ProtectedRoute page="acompanhamento">
                  <AcompanhamentoPage />
                </ProtectedRoute>
              } />
              <Route path="/silencio" element={
                <ProtectedRoute page="silencio">
                  <SilencioPage />
                </ProtectedRoute>
              } />
              <Route path="/mes-analise" element={
                <ProtectedRoute page="mes-analise">
                  <MesAnalisePage />
                </ProtectedRoute>
              } />
              <Route path="/incidentes" element={
                <ProtectedRoute page="incidentes">
                  <IncidentesPage />
                </ProtectedRoute>
              } />
              <Route path="/alunos" element={
                <ProtectedRoute page="alunos">
                  <AlunosPage />
                </ProtectedRoute>
              } />
              <Route path="/onboarding" element={
                <ProtectedRoute page="onboarding">
                  <OnboardingPage />
                </ProtectedRoute>
              } />
              <Route path="/retorno-pausa" element={
                <ProtectedRoute page="retorno-pausa">
                  <RetornoPausaPage />
                </ProtectedRoute>
              } />
              <Route path="/suporte/reunioes" element={
                <ProtectedRoute page="suporte-reunioes">
                  <SuporteReunioesPage />
                </ProtectedRoute>
              } />
              <Route path="/tarefas" element={
                <ProtectedRoute page="tarefas">
                  <TarefasPage />
                </ProtectedRoute>
              } />
              {/* Admin */}
              <Route path="/admin/aprovacoes" element={
                <ProtectedRoute admin>
                  <AprovacoesPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/usuarios" element={
                <ProtectedRoute admin>
                  <UsuariosPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/configuracoes" element={
                <ProtectedRoute admin>
                  <ConfiguracoesPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/agendas" element={
                <ProtectedRoute page="agendas">
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
