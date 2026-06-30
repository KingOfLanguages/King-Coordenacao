import { useEffect, useState } from 'react'
import type { MensagemParaBackground, RespostaDoBackground, SessaoArmazenada } from '../shared/types'

const COLORS = {
  brand:    '#D1333A',
  ink:      '#131316',
  inkMuted: '#818290',
  border:   '#E5E5EA',
  bg:       '#F9FAFB',
}

function enviar(msg: MensagemParaBackground): Promise<RespostaDoBackground> {
  return chrome.runtime.sendMessage(msg)
}

export function Popup() {
  const [sessao, setSessao]   = useState<SessaoArmazenada | null | undefined>(undefined)
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [erro, setErro]       = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    enviar({ tipo: 'OBTER_SESSAO' }).then(r => {
      if (r.ok && 'sessao' in r) setSessao(r.sessao)
      else setSessao(null)
    })
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const r = await enviar({ tipo: 'LOGIN', email, senha })
    setLoading(false)
    if (!r.ok) { setErro('erro' in r ? r.erro : 'Erro ao entrar.'); return }
    const s = await enviar({ tipo: 'OBTER_SESSAO' })
    if (s.ok && 'sessao' in s) setSessao(s.sessao)
  }

  async function handleLogout() {
    await enviar({ tipo: 'LOGOUT' })
    setSessao(null)
  }

  if (sessao === undefined) {
    return <div style={{ padding: 20, fontFamily: 'system-ui', color: COLORS.inkMuted, fontSize: 13 }}>Carregando…</div>
  }

  return (
    <div style={{ padding: 18, fontFamily: 'system-ui, sans-serif', background: COLORS.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%', background: COLORS.brand,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700,
        }}>K</span>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', color: COLORS.ink }}>KING NEXUS</span>
      </div>

      {sessao ? (
        <div>
          <p style={{ fontSize: 13, color: COLORS.ink, margin: '0 0 2px' }}>Conectado como</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, margin: '0 0 14px' }}>{sessao.nome}</p>
          <p style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5, margin: '0 0 14px' }}>
            Entre numa chamada do Google Meet — o painel do professor aparece automaticamente.
          </p>
          <button onClick={handleLogout} style={btnSecundario}>Sair</button>
        </div>
      ) : (
        <form onSubmit={handleLogin}>
          <p style={{ fontSize: 12, color: COLORS.inkMuted, margin: '0 0 12px' }}>
            Use as mesmas credenciais do King Nexus.
          </p>
          <input
            type="email" placeholder="E-mail" value={email} required
            onChange={e => setEmail(e.target.value)}
            style={input}
          />
          <input
            type="password" placeholder="Senha" value={senha} required
            onChange={e => setSenha(e.target.value)}
            style={{ ...input, marginTop: 8 }}
          />
          {erro && <p style={{ color: COLORS.brand, fontSize: 12, margin: '8px 0 0' }}>{erro}</p>}
          <button type="submit" disabled={loading} style={{ ...btnPrimario, marginTop: 12 }}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      )}
    </div>
  )
}

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13,
  border: `1px solid ${COLORS.border}`, borderRadius: 8, outline: 'none',
}

const btnPrimario: React.CSSProperties = {
  width: '100%', padding: '9px 0', fontSize: 13, fontWeight: 600, color: '#fff',
  background: COLORS.ink, border: 'none', borderRadius: 8, cursor: 'pointer',
}

const btnSecundario: React.CSSProperties = {
  padding: '7px 12px', fontSize: 12, fontWeight: 500, color: COLORS.inkMuted,
  background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 8, cursor: 'pointer',
}
