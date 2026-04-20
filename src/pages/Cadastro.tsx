import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function Cadastro() {
  const [nome, setNome]         = useState('')
  const [email, setEmail]       = useState('')
  const [senha, setSenha]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [enviado, setEnviado]   = useState(false)
  const [erro, setErro]         = useState('')

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')

    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    })

    if (error || !data.user) {
      setErro('Erro ao criar conta. Tente novamente.')
      setLoading(false)
      return
    }

    // Registra na fila de aprovação
    await supabase.from('pending_approvals').insert({
      user_id: data.user.id,
      email,
      nome,
      role_solicitada: 'suporte',
    })

    setEnviado(true)
    setLoading(false)
  }

  if (enviado) return (
    <div className="flex h-screen items-center justify-center bg-king-dark">
      <div className="max-w-sm space-y-4 rounded-xl border border-king-border bg-king-card p-8 text-center">
        <h2 className="text-xl font-bold text-white">Solicitação enviada</h2>
        <p className="text-sm text-white/50">Sua conta foi criada e está aguardando aprovação. Você receberá acesso em breve.</p>
        <Link to="/login" className="text-sm text-king-red hover:underline">Voltar ao login</Link>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen items-center justify-center bg-king-dark">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-king-border bg-king-card p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">Solicitar Acesso</h1>
          <p className="text-sm text-white/50">Seu acesso será aprovado manualmente</p>
        </div>

        <form onSubmit={handleCadastro} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="nome">Nome completo</Label>
            <Input id="nome" value={nome} onChange={e => setNome(e.target.value)} required />
          </div>
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
            {loading ? 'Enviando...' : 'Solicitar acesso'}
          </Button>
        </form>

        <p className="text-center text-sm text-white/50">
          Já tem acesso? <Link to="/login" className="text-king-red hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  )
}