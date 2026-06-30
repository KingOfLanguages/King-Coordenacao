import { useEffect, useRef, useState } from 'react'
import { extrairCandidatos } from './scrape'
import type { MensagemParaBackground, RespostaDoBackground, ProfessorEncontrado, SessaoArmazenada } from '../shared/types'

const C = {
  brand:     '#D1333A',
  ink:       '#131316',
  inkMuted:  '#818290',
  border:    '#E5E5EA',
  bg:        '#FFFFFF',
  bgSubtle:  '#F4F5F8',
  green:     '#1A9C5F',
  greenSoft: '#E4F7EE',
}

const TIPO_LABEL: Record<string, string> = {
  reuniao:           'Reunião',
  ocorrencia:        'Ocorrência',
  feedback_positivo: 'Positivo',
  feedback_negativo: 'Negativo',
  feedback_neutro:   'Neutro',
}

function enviar(msg: MensagemParaBackground): Promise<RespostaDoBackground> {
  return chrome.runtime.sendMessage(msg)
}

function tempoDeCasaLabel(dataInicio: string | null): string | null {
  if (!dataInicio) return null
  const inicio = new Date(dataInicio)
  if (isNaN(inicio.getTime())) return null
  const meses = Math.floor((Date.now() - inicio.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
  if (meses < 1)  return 'menos de 1 mês'
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
  const anos = Math.floor(meses / 12)
  return `${anos} ${anos === 1 ? 'ano' : 'anos'}`
}

export function Panel() {
  const [sessao, setSessao]         = useState<SessaoArmazenada | null | undefined>(undefined)
  const [colapsado, setColapsado]   = useState(false)
  const [buscando, setBuscando]     = useState(false)
  const [resultado, setResultado]   = useState<ProfessorEncontrado | null>(null)
  const [buscaManual, setBuscaManual] = useState('')
  const ultimosCandidatos = useRef<string>('')

  useEffect(() => {
    enviar({ tipo: 'OBTER_SESSAO' }).then(r => setSessao(r.ok && 'sessao' in r ? r.sessao : null))
  }, [])

  // Busca automática: reavalia os participantes a cada poucos segundos.
  useEffect(() => {
    if (!sessao) return

    async function checar() {
      const candidatos = extrairCandidatos()
      const chave = candidatos.join('|')
      if (!candidatos.length || chave === ultimosCandidatos.current) return
      ultimosCandidatos.current = chave

      setBuscando(true)
      const r = await enviar({ tipo: 'BUSCAR_PROFESSOR', nomes: candidatos, emails: [] })
      setBuscando(false)
      if (r.ok && 'resultado' in r && r.resultado) setResultado(r.resultado)
    }

    checar()
    const intervalo = setInterval(checar, 4000)
    return () => clearInterval(intervalo)
  }, [sessao])

  async function buscarManual(e: React.FormEvent) {
    e.preventDefault()
    if (!buscaManual.trim()) return
    setBuscando(true)
    const r = await enviar({ tipo: 'BUSCAR_PROFESSOR_POR_TEXTO', texto: buscaManual })
    setBuscando(false)
    if (r.ok && 'resultado' in r) setResultado(r.resultado)
  }

  if (sessao === undefined) return null // ainda carregando, evita flash

  if (colapsado) {
    return (
      <button onClick={() => setColapsado(false)} style={botaoFlutuante}>
        <LogoK />
      </button>
    )
  }

  return (
    <div style={painel}>
      <div style={cabecalho}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <LogoK />
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', color: C.ink }}>KING NEXUS</span>
        </div>
        <button onClick={() => setColapsado(true)} style={botaoFechar} aria-label="Minimizar">—</button>
      </div>

      <div style={{ padding: 14 }}>
        {!sessao ? (
          <p style={{ fontSize: 12, color: C.inkMuted, margin: 0, lineHeight: 1.5 }}>
            Faça login no ícone da extensão (barra do Chrome) para ver o perfil do professor aqui.
          </p>
        ) : resultado ? (
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: '0 0 3px' }}>{resultado.professor.nome}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {resultado.professor.grupo && <Chip>{resultado.professor.grupo.nome}</Chip>}
              {tempoDeCasaLabel(resultado.professor.data_inicio) && (
                <Chip>{tempoDeCasaLabel(resultado.professor.data_inicio)} de casa</Chip>
              )}
              <Chip tom={resultado.professor.status === 'ativo' ? 'verde' : 'neutro'}>
                {resultado.professor.status === 'ativo' ? 'Ativo' : resultado.professor.status}
              </Chip>
            </div>

            <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.inkMuted, margin: '0 0 6px' }}>
              Últimas observações
            </p>
            {resultado.observacoes.length === 0 ? (
              <p style={{ fontSize: 12, color: C.inkMuted, margin: 0 }}>Nenhuma observação registrada.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {resultado.observacoes.map(o => (
                  <li key={o.id} style={{ borderLeft: `2px solid ${C.border}`, paddingLeft: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: C.inkMuted }}>
                        {TIPO_LABEL[o.tipo] ?? o.tipo}
                      </span>
                      <span style={{ fontSize: 10.5, color: C.inkMuted }}>
                        {new Date(o.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: C.ink, margin: '2px 0 0', lineHeight: 1.4 }}>{o.texto}</p>
                  </li>
                ))}
              </ul>
            )}

            <button onClick={() => setResultado(null)} style={{ ...botaoTexto, marginTop: 10 }}>
              Buscar outro professor
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: C.inkMuted, margin: '0 0 10px', lineHeight: 1.5 }}>
              {buscando ? 'Procurando professor…' : 'Nenhum professor reconhecido automaticamente ainda.'}
            </p>
            <form onSubmit={buscarManual} style={{ display: 'flex', gap: 6 }}>
              <input
                value={buscaManual}
                onChange={e => setBuscaManual(e.target.value)}
                placeholder="Buscar pelo nome…"
                style={input}
              />
              <button type="submit" style={botaoPrimario}>Buscar</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function Chip({ children, tom = 'neutro' }: { children: React.ReactNode; tom?: 'neutro' | 'verde' }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
      background: tom === 'verde' ? C.greenSoft : C.bgSubtle,
      color: tom === 'verde' ? C.green : C.inkMuted,
    }}>
      {children}
    </span>
  )
}

function LogoK() {
  return (
    <span style={{
      width: 18, height: 18, borderRadius: '50%', background: C.brand, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700,
    }}>K</span>
  )
}

const painel: React.CSSProperties = {
  position: 'fixed', bottom: 20, right: 20, width: 280, zIndex: 2147483647,
  background: C.bg, borderRadius: 14, border: `1px solid ${C.border}`,
  boxShadow: '0 12px 32px -8px rgba(0,0,0,0.25)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

const cabecalho: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '10px 12px', borderBottom: `1px solid ${C.border}`,
}

const botaoFechar: React.CSSProperties = {
  border: 'none', background: 'transparent', color: C.inkMuted, fontSize: 14,
  cursor: 'pointer', lineHeight: 1, padding: 4,
}

const botaoFlutuante: React.CSSProperties = {
  position: 'fixed', bottom: 20, right: 20, zIndex: 2147483647,
  width: 36, height: 36, borderRadius: '50%', border: `1px solid ${C.border}`,
  background: C.bg, boxShadow: '0 6px 16px -4px rgba(0,0,0,0.25)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
}

const input: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '7px 9px', fontSize: 12,
  border: `1px solid ${C.border}`, borderRadius: 8, outline: 'none',
}

const botaoPrimario: React.CSSProperties = {
  padding: '7px 12px', fontSize: 12, fontWeight: 600, color: '#fff',
  background: C.ink, border: 'none', borderRadius: 8, cursor: 'pointer', flexShrink: 0,
}

const botaoTexto: React.CSSProperties = {
  border: 'none', background: 'transparent', color: C.inkMuted, fontSize: 11.5,
  textDecoration: 'underline', cursor: 'pointer', padding: 0,
}
