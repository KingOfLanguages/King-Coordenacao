import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function Login() {
  const [email, setEmail]       = useState('')
  const [senha, setSenha]       = useState('')
  const [erro, setErro]         = useState('')
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      setErro('E-mail ou senha inválidos.')
      setLoading(false)
      return
    }
    navigate('/')
  }

  return (
    <div className="flex h-screen items-center justify-center bg-king-dark">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-king-border bg-king-card p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">King SaaS</h1>
          <p className="text-sm text-white/50">Faça login para continuar</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" value={senha} onChange={e => setSenha(e.target.value)} required />
          </div>

          {erro && <p className="text-sm text-red-400">{erro}</p>}

          <Button type="submit" className="w-full bg-king-red hover:bg-king-red/90" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <p className="text-center text-sm text-white/50">
          Não tem acesso?{' '}
          <Link to="/cadastro" className="text-king-red hover:underline">Solicitar acesso</Link>
        </p>
      </div>
    </div>
  )
}