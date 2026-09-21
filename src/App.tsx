import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
import { ObservacaoRedirect } from '@/pages/observacoes/ObservacaoRedirect'
import { AcompanhamentoPage } from '@/pages/acompanhamento/AcompanhamentoPage'
import { MinhaAreaPage } from '@/pages/minhaArea/MinhaAreaPage'
import { TarefasPage } from '@/pages/tarefas/TarefasPage'
import { Redirecionar } from '@/components/Redirecionar'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { ReunioesPage } from '@/pages/reunioes/ReunioesPage'
import { SolicitacoesPage } from '@/pages/solicitacoes/SolicitacoesPage'
import { HojePage } from '@/pages/hoje/HojePage'
import { ProjetosPage } from '@/pages/projetos/ProjetosPage'
import { ProjetoDetalhePage } from '@/pages/projetos/ProjetoDetalhePage'
import { IncidentesPage } from '@/pages/incidentes/IncidentesPage'
import { ConfiabilidadePage } from '@/pages/comercial/ConfiabilidadePage'
import { UsuariosPage } from '@/pages/admin/UsuariosPage'
import { ConfiguracoesPage } from '@/pages/admin/ConfiguracoesPage'
import { Home as AgendamentoPage } from '@/pages/agendamentos/Home'
import { Home as PausaPublicaPage } from '@/pages/pausas/Home'
import { Home as TransferenciaPublicaPage } from '@/pages/transferencias/Home'
import { Home as WelcomePathPage } from '@/pages/welcomePath/Home'
import { OnboardingPage } from '@/pages/onboarding/OnboardingPage'

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
// de acesso configurável. Prioriza "Hoje" (o que pede ação no dia), depois
// Dashboard, Professores e o resto — assim ninguém cai numa rota bloqueada (o
// que causaria loop de redirect).
const LANDING_PRIORITY = ['hoje', 'dashboard', 'professores', 'suporte-reunioes', 'convocacoes', 'confiabilidade']

function IndexRedirect() {
  const { profile, loading } = useAuth()
  const { canOpen, isLoading: permsLoading } = useCanView()
  if (loading || permsLoading) return null
  if (!profile) return <Navigate to="/login" replace />

  // Só páginas de menu: as chaves que viraram aba de outra tela (nav: false)
  // apontam para a tela-mãe, que tem permissão própria — cair nelas daria loop.
  const ordem = [...LANDING_PRIORITY, ...PAGES.filter(p => p.nav).map(p => p.key)]
  for (const key of ordem) {
    if (canOpen(key)) return <Navigate to={PAGE_BY_KEY[key].path} replace />
  }
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6 text-center">
      <p className="text-[13px] text-ink-muted">
        Você ainda não tem acesso a nenhuma página. Fale com um administrador.
      </p>
    </div>
  )
}

// /retencao?aba=aluno → /dashboard?aba=retencao&turnover=aluno: o ?aba= antigo
// era o recorte Professor/Aluno e agora nomeia a aba do Dashboard.
function RedirecionarRetencao() {
  const { search } = useLocation()
  const q = new URLSearchParams(search)
  const recorte = q.get('aba')
  q.set('aba', 'retencao')
  if (recorte === 'aluno') q.set('turnover', 'aluno')
  return <Navigate to={`/dashboard?${q.toString()}`} replace />
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
            <Route path="/pausa"          element={<PausaPublicaPage />} />
            <Route path="/transferencia"  element={<TransferenciaPublicaPage />} />
            <Route path="/welcome-path"   element={<WelcomePathPage />} />

            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<IndexRedirect />} />

              {/* Hoje: o que pede ação no dia, com link direto para agir. */}
              <Route path="/hoje" element={
                <ProtectedRoute page="hoje">
                  <HojePage />
                </ProtectedRoute>
              } />

              {/* Dashboard: Coordenação | Geral | Turnover & Retenção numa tela só. */}
              <Route path="/dashboard" element={
                <ProtectedRoute page="dashboard">
                  <DashboardPage />
                </ProtectedRoute>
              } />
              <Route path="/dashboard/geral" element={<Redirecionar para="/dashboard" params={{ aba: 'geral' }} />} />
              <Route path="/retencao" element={<RedirecionarRetencao />} />

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
              <Route path="/confiabilidade" element={
                <ProtectedRoute page="confiabilidade">
                  <ConfiabilidadePage />
                </ProtectedRoute>
              } />
              <Route path="/observacoes/:id" element={
                <ProtectedRoute page="professores">
                  <ObservacaoRedirect />
                </ProtectedRoute>
              } />
              {/* Reuniões: Agenda | Buscar por professor | Configurar agendas. */}
              <Route path="/reunioes" element={
                <ProtectedRoute page="reunioes-dia">
                  <ReunioesPage />
                </ProtectedRoute>
              } />
              <Route path="/reunioes-dia" element={<Redirecionar para="/reunioes" />} />
              {/* Disparo de E-mails virou ação do Índice de atenção (seleciona → envia). */}
              <Route path="/emails" element={<Navigate to="/acompanhamento" replace />} />
              {/* Acompanhamento: Índice de atenção | Pendências do King | Mês de Análise. */}
              <Route path="/acompanhamento" element={
                <ProtectedRoute page="acompanhamento">
                  <AcompanhamentoPage />
                </ProtectedRoute>
              } />
              <Route path="/pendencias" element={<Redirecionar para="/acompanhamento" params={{ aba: 'pendencias' }} />} />
              {/* Controle de Pendências (local, régua 6/9/12) foi fundido em Acompanhamento — mantém o link antigo vivo. */}
              <Route path="/silencio" element={<Navigate to="/acompanhamento" replace />} />
              <Route path="/mes-analise" element={<Redirecionar para="/acompanhamento" params={{ aba: 'mes-analise' }} />} />
              <Route path="/incidentes" element={
                <ProtectedRoute page="incidentes">
                  <IncidentesPage />
                </ProtectedRoute>
              } />
              {/* "Reclamações por Aluno" virou a visão "Por aluno" de Incidentes. */}
              <Route path="/alunos" element={<Redirecionar para="/incidentes" params={{ visao: 'alunos' }} />} />
              <Route path="/onboarding" element={
                <ProtectedRoute page="onboarding">
                  <OnboardingPage />
                </ProtectedRoute>
              } />
              {/* Solicitações dos professores: Pausas | Transferências (mesmo fluxo
                  formulário público → fila → assumir → concluir). */}
              <Route path="/solicitacoes" element={
                <ProtectedRoute page="retorno-pausa">
                  <SolicitacoesPage />
                </ProtectedRoute>
              } />
              <Route path="/pausas" element={<Redirecionar para="/solicitacoes" params={{ aba: 'pausas' }} />} />
              <Route path="/retorno-pausa" element={<Redirecionar para="/solicitacoes" params={{ aba: 'pausas' }} />} />
              {/* O aviso de transferência atrasada aponta para /transferencias?pedido=<id>. */}
              <Route path="/transferencias" element={<Redirecionar para="/solicitacoes" params={{ aba: 'transferencias' }} />} />
              <Route path="/suporte/reunioes" element={<Redirecionar para="/reunioes" params={{ aba: 'buscar' }} />} />
              {/* Tarefas foi unificada na Central (/convocacoes) — mantém o link antigo vivo. */}
              <Route path="/tarefas" element={<Navigate to="/convocacoes?aba=tarefas" replace />} />
              <Route path="/minha-area" element={
                <ProtectedRoute page="minha-area">
                  <MinhaAreaPage />
                </ProtectedRoute>
              } />
              <Route path="/convocacoes" element={
                <ProtectedRoute page="convocacoes">
                  <TarefasPage />
                </ProtectedRoute>
              } />
              <Route path="/projetos" element={
                <ProtectedRoute page="projetos">
                  <ProjetosPage />
                </ProtectedRoute>
              } />
              {/* A ficha completa tem página própria: o sino e o chamado do TI
                  apontam direto pra ela. */}
              <Route path="/projetos/:id" element={
                <ProtectedRoute page="projetos">
                  <ProjetoDetalhePage />
                </ProtectedRoute>
              } />
              {/* Admin */}
              {/* Aprovações virou a aba "Aguardando aprovação" de Usuários. */}
              <Route path="/admin/aprovacoes" element={<Redirecionar para="/admin/usuarios" params={{ aba: 'aprovacoes' }} />} />
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
              <Route path="/admin/agendas" element={<Redirecionar para="/reunioes" params={{ aba: 'agendas' }} />} />
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
