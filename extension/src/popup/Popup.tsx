import { useEffect, useState } from 'react'
import { supabase } from '../shared/supabase'
import { CSS } from '../content/estilos'

// Popup da barra do navegador — mesma linguagem visual do painel do Meet.
// Reaproveita a folha de estilo do painel (./content/estilos) em vez de manter
// um segundo conjunto de estilos inline que envelhecia sozinho.

type Sessao = { nome: string; email: string }

// Autentica direto pelo Supabase (o adapter de chrome.storage funciona no
// contexto do popup) — assim o login NÃO depende do service worker estar vivo,
// que em MV3 é efêmero e pode estar dormindo/falhando quando o popup abre.
async function obterSessao(): Promise<Sessao | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data: profile } = await supabase
    .from('profiles').select('nome').eq('id', session.user.id).maybeSingle()
  return { nome: profile?.nome ?? session.user.email ?? 'Usuário', email: session.user.email ?? '' }
}

/** O painel vive num shadow root; aqui a folha entra no documento do popup. */
function useEstilos() {
  useEffect(() => {
    if (document.head.querySelector('style[data-ktm]')) return
    const el = document.createElement('style')
    el.setAttribute('data-ktm', '')
    // No popup a raiz é o próprio <body>, então `.ktm` não pode ser fixed.
    el.textContent = CSS + `
      html, body { background: #0B0B0E; margin: 0; }
      .ktm--popup {
        position: static;
        width: 100%;
        max-height: none;
        border-radius: 0;
        border: 0;
        box-shadow: none;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        background: #0B0B0E;
        padding: 10px;
      }
      .ktm--popup .ktm-nucleo { min-height: 236px; }
      .ktm-ponto-vivo {
        width: 7px; height: 7px; border-radius: 999px; flex-shrink: 0;
        background: var(--verde);
        box-shadow: 0 0 0 3px rgba(70, 214, 143, 0.16);
      }
    `
    document.head.appendChild(el)
  }, [])
}

export function Popup() {
  useEstilos()
  const [sessao, setSessao]   = useState<Sessao | null | undefined>(undefined)
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [erro, setErro]       = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let vivo = true
    // Rede de segurança: nunca deixa preso em "Carregando…".
    const timeout = setTimeout(() => { if (vivo) setSessao(s => (s === undefined ? null : s)) }, 3000)
    obterSessao()
      .then(s => { if (vivo) setSessao(s) })
      .catch(() => { if (vivo) setSessao(null) })
      .finally(() => clearTimeout(timeout))
    return () => { vivo = false; clearTimeout(timeout) }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
      if (error) {
        setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos.' : error.message)
        return
      }
      setSessao(await obterSessao())
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível entrar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    try { await supabase.auth.signOut() } catch { /* segue mesmo se falhar */ }
    setSessao(null)
  }

  return (
    <div className="ktm ktm--popup">
      <div className="ktm-nucleo">
        <header className="ktm-topo">
          <div className="ktm-marca">
            <span className="ktm-selo">K</span>
            <span className="ktm-marca-txt">TeacherTrack</span>
          </div>
        </header>

        <div className="ktm-corpo">
          {sessao === undefined ? (
            <p className="ktm-vazio ktm-entra">Carregando…</p>
          ) : sessao ? (
            <section className="ktm-cartao ktm-entra">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span className="ktm-ponto-vivo" />
                <span className="ktm-rotulo" style={{ color: 'var(--verde)' }}>Conectado</span>
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 2px' }}>{sessao.nome}</p>
              <p className="ktm-txt-3" style={{ wordBreak: 'break-all' }}>{sessao.email}</p>
              <p className="ktm-txt-2" style={{ margin: '12px 0 0' }}>
                Entre numa chamada do Google Meet — o painel do professor aparece automaticamente.
              </p>
              <button onClick={handleLogout} className="ktm-btn ktm-btn--bloco" style={{ marginTop: 13 }}>Sair</button>
            </section>
          ) : (
            <section className="ktm-cartao ktm-entra">
              <p style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 3px' }}>Entrar</p>
              <p className="ktm-txt-3" style={{ marginBottom: 13 }}>Use as mesmas credenciais do King TeacherTrack.</p>
              <form onSubmit={handleLogin}>
                <input className="ktm-campo" type="email" placeholder="E-mail" value={email} required autoFocus
                       onChange={e => setEmail(e.target.value)} />
                <input className="ktm-campo" style={{ marginTop: 8 }} type="password" placeholder="Senha" value={senha} required
                       onChange={e => setSenha(e.target.value)} />
                {erro && <p className="ktm-erro">{erro}</p>}
                <button type="submit" disabled={loading} className="ktm-btn ktm-btn--principal ktm-btn--bloco" style={{ marginTop: 13 }}>
                  {loading ? 'Entrando…' : 'Entrar'}
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
