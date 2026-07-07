import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Página de retorno do OAuth (Google). O cliente Supabase processa o token da
// URL e cria a sessão automaticamente; o AuthContext então resolve o perfil.
// - perfil ativo → segue pra home.
// - conta pendente/bloqueada → o AuthContext derruba a sessão (ativo=false),
//   e aqui a gente mostra a explicação em vez de jogar de volta pro login mudo.
export function AuthCallback() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [pendente, setPendente] = useState(false)
  // Só decidimos depois que o AuthContext resolveu ao menos uma vez (loading vira
  // false já com a sessão do OAuth processada).
  const jaResolveu = useRef(false)

  useEffect(() => {
    if (loading) return
    jaResolveu.current = true

    if (session && profile) {
      navigate('/', { replace: true })
      return
    }
    // Resolveu sem sessão/perfil → conta pendente de aprovação (ou bloqueada).
    setPendente(true)
  }, [loading, session, profile, navigate])

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface-app p-6">
      {pendente ? (
        <div className="max-w-sm w-full card-surface p-8 text-center space-y-4 animate-fade-up">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Conta aguardando aprovação</h2>
          <p className="text-sm text-ink-secondary leading-relaxed">
            Sua conta Google foi conectada, mas ainda precisa ser liberada por um administrador.
            Você receberá acesso assim que for aprovada.
          </p>
          <Link to="/login" className="inline-flex text-[13px] font-medium text-ink hover:text-brand underline-offset-4 hover:underline">
            Voltar ao login
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span className="text-ink-muted text-sm">Entrando…</span>
        </div>
      )}
    </div>
  )
}
