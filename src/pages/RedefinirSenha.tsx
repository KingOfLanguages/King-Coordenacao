import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2 } from 'lucide-react'

const SENHA_MIN = 6

export function RedefinirSenha() {
  const navigate = useNavigate()
  const [pronto, setPronto]   = useState(false)
  const [valido, setValido]   = useState(false)
  const [senha, setSenha]     = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [concluido, setConcluido] = useState(false)
  const [erro, setErro]       = useState('')

  useEffect(() => {
    // O link do e-mail traz um token de recuperação na URL — o cliente Supabase
    // processa isso automaticamente e cria uma sessão temporária de recovery.
    // Só sabemos se deu certo checando a sessão depois desse processamento.
    supabase.auth.getSession().then(({ data }) => {
      setValido(!!data.session)
      setPronto(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setValido(true)
        setPronto(true)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleRedefinir(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    if (senha.length < SENHA_MIN) {
      setErro(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`)
      return
    }
    if (senha !== confirmarSenha) {
      setErro('As senhas não coincidem.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      setErro('Não foi possível redefinir a senha. Peça um novo link e tente de novo.')
      setLoading(false)
      return
    }
    setConcluido(true)
    setLoading(false)
  }

  if (concluido) return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface-app p-6">
      <div className="max-w-sm w-full card-surface p-8 text-center space-y-4 animate-fade-up">
        <div className="mx-auto h-11 w-11 rounded-full bg-urg-lowBg text-urg-lowFg flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-ink">Senha redefinida</h2>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Sua senha foi atualizada. Você já pode continuar usando a plataforma.
        </p>
        <Button onClick={() => navigate('/')} className="btn-press w-full h-10 bg-ink text-white hover:bg-ink/90 font-medium">
          Continuar
        </Button>
      </div>
    </div>
  )

  if (pronto && !valido) return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface-app p-6">
      <div className="max-w-sm w-full card-surface p-8 text-center space-y-4 animate-fade-up">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Link inválido ou expirado</h2>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Esse link de redefinição de senha não é mais válido. Peça um novo link e tente de novo.
        </p>
        <Link to="/esqueci-senha" className="inline-flex text-[13px] font-medium text-ink hover:text-brand underline-offset-4 hover:underline">
          Pedir novo link
        </Link>
      </div>
    </div>
  )

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-surface-app">
      <div aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(700px circle at 80% 20%, rgba(209,51,58,0.06), transparent 55%)' }} />

      <div className="relative flex min-h-[100dvh] items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-7">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M4 19l2-9 4 5 4-8 4 8 4-5 2 9z" /></svg>
            </span>
            <span className="text-[13px] font-semibold tracking-[0.24em] text-ink">KING <span className="text-brand">TEACHERTRACK</span></span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Redefinir senha</h1>
            <p className="text-[14px] text-ink-muted">Escolha uma nova senha para sua conta.</p>
          </div>

          {!pronto ? (
            <p className="text-[13px] text-ink-muted">Verificando link…</p>
          ) : (
            <form onSubmit={handleRedefinir} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="senha" className="text-[13px] text-ink-secondary">Nova senha</Label>
                <Input id="senha" type="password" value={senha} onChange={e => setSenha(e.target.value)} required
                  minLength={SENHA_MIN} autoComplete="new-password"
                  className="h-10 bg-surface-canvas border-line" />
                <p className="text-[11px] text-ink-muted">Pelo menos {SENHA_MIN} caracteres.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmar-senha" className="text-[13px] text-ink-secondary">Confirmar nova senha</Label>
                <Input id="confirmar-senha" type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} required
                  autoComplete="new-password"
                  className="h-10 bg-surface-canvas border-line" />
              </div>

              {erro && (
                <div className="rounded-md border border-brand/25 bg-brand-soft px-3 py-2 text-[13px] text-brand-strong">
                  {erro}
                </div>
              )}

              <Button type="submit" disabled={loading}
                className="btn-press w-full h-10 bg-ink text-white hover:bg-ink/90 font-medium">
                {loading ? 'Salvando…' : 'Redefinir senha'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
