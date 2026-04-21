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
      return (
        <div className="flex h-screen items-center justify-center bg-king-dark p-6">
          <div className="max-w-md space-y-3 text-center">
            <p className="text-king-red font-bold text-lg">Erro de configuração</p>
            <p className="text-white/60 text-sm">{(this.state.error as Error).message}</p>
            <p className="text-white/30 text-xs">Verifique as variáveis de ambiente no Vercel.</p>
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
