import { StrictMode, Component } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      const erro = this.state.error as Error
      const configIssue = /vari[aá]veis de ambiente/i.test(erro.message)
      return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-surface-app p-6">
          <div className="max-w-md space-y-3 text-center card-surface p-8">
            <div className="mx-auto h-10 w-10 rounded-full bg-brand/10 text-brand flex items-center justify-center text-lg font-semibold">!</div>
            <p className="text-ink font-semibold text-base">{configIssue ? 'Erro de configuração' : 'Algo deu errado'}</p>
            <p className="text-ink-secondary text-sm">{erro.message}</p>
            <p className="text-ink-muted text-xs">
              {configIssue
                ? 'Verifique as variáveis de ambiente no Vercel.'
                : 'Recarregue a página. Se o erro continuar, avise a coordenação.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-press mt-2 h-9 rounded-full bg-ink px-4 text-[13px] font-medium text-white hover:bg-ink/90"
            >
              Recarregar página
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
