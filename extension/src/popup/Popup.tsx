import { useEffect, useState } from 'react'
import { supabase } from '../shared/supabase'

const C = {
  brand:    '#D1333A',
  ink:      '#0F172A',
  inkSoft:  '#334155',
  inkMuted: '#64748B',
  inkSubtle:'#94A3B8',
  border:   '#E2E8F0',
  bg:       '#F5F7FA',
  card:     '#FFFFFF',
  green:    '#15803D',
  greenSoft:'#DCFCE7',
}

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

export function Popup() {
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
    <div style={container}>
      <div style={cabecalho}>
        <span style={logo}>K</span>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: C.ink }}>
          KING<span style={{ color: C.inkMuted, fontWeight: 600 }}> TEACHERTRACK</span>
        </span>
      </div>

      {sessao === undefined ? (
        <div style={card}>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: 0 }}>Carregando…</p>
        </div>
      ) : sessao ? (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={statusDot} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.green }}>Conectado</span>
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: '0 0 2px' }}>{sessao.nome}</p>
          <p style={{ fontSize: 11.5, color: C.inkMuted, margin: '0 0 14px', wordBreak: 'break-all' }}>{sessao.email}</p>
          <p style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.5, margin: '0 0 14px' }}>
            Entre numa chamada do Google Meet — o painel do professor aparece automaticamente.
          </p>
          <button onClick={handleLogout} style={btnSecundario}>Sair</button>
        </div>
      ) : (
        <div style={card}>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, margin: '0 0 3px' }}>Entrar</p>
          <p style={{ fontSize: 11.5, color: C.inkMuted, margin: '0 0 14px', lineHeight: 1.5 }}>
            Use as mesmas credenciais do King TeacherTrack.
          </p>
          <form onSubmit={handleLogin}>
            <input type="email" placeholder="E-mail" value={email} required autoFocus
              onChange={e => setEmail(e.target.value)} style={input} />
            <input type="password" placeholder="Senha" value={senha} required
              onChange={e => setSenha(e.target.value)} style={{ ...input, marginTop: 8 }} />
            {erro && <p style={{ color: C.brand, fontSize: 11.5, margin: '9px 0 0' }}>{erro}</p>}
            <button type="submit" disabled={loading} style={{ ...btnPrimario, marginTop: 14, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

const container: React.CSSProperties = {
  width: 288, background: C.bg, padding: 14,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
}

const cabecalho: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 12px',
}

const logo: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 7, background: C.brand,
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700,
}

const card: React.CSSProperties = {
  background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
  padding: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.05), 0 1px 3px rgba(15,23,42,0.05)',
}

const statusDot: React.CSSProperties = {
  width: 7, height: 7, borderRadius: '50%', background: C.green,
  boxShadow: `0 0 0 3px ${C.greenSoft}`,
}

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, color: C.ink,
  border: `1px solid ${C.border}`, borderRadius: 9, outline: 'none', background: C.card,
}

const btnPrimario: React.CSSProperties = {
  width: '100%', padding: '10px 0', fontSize: 13, fontWeight: 600, color: '#fff',
  background: C.ink, border: 'none', borderRadius: 9, cursor: 'pointer',
}

const btnSecundario: React.CSSProperties = {
  padding: '8px 14px', fontSize: 12, fontWeight: 600, color: C.inkSoft,
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, cursor: 'pointer',
}
