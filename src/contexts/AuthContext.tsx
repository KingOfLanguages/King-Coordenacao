import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

interface AuthContextData {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]   = useState<Session | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [loading, setLoading]   = useState(true)
  // Já resolvemos o perfil ao menos uma vez? Enquanto false, a tela cheia de
  // "Carregando…" é legítima. Depois disso, refresh de token / refoco de aba
  // (que reemitem onAuthStateChange) NÃO devem piscar o app inteiro — atualizam
  // o perfil em segundo plano mantendo a tela atual.
  const perfilResolvido = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) fetchProfile(data.session.user.id)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        if (!perfilResolvido.current) setLoading(true)
        fetchProfile(session.user.id)
      } else {
        perfilResolvido.current = false
        setProfile(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data && data.ativo === false) {
      // Conta bloqueada — força logout imediatamente
      await supabase.auth.signOut()
      perfilResolvido.current = false
      setProfile(null)
      setLoading(false)
      return
    }

    setProfile(data)
    perfilResolvido.current = !!data
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)