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
  amber:     '#B4690E',
  amberSoft: '#FBEEDC',
  red:       '#C0272D',
  redSoft:   '#FBE7E7',
}

const TIPO_LABEL: Record<string, string> = {
  reuniao:           'Reunião',
  ocorrencia:        'Ocorrência',
  feedback_positivo: 'Positivo',
  feedback_negativo: 'Negativo',
  feedback_neutro:   'Neutro',
}

const REUNIAO_STATUS_LABEL: Record<string, string> = {
  pendente:  'Pendente',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
}

const REUNIAO_STATUS_TOM: Record<string, 'neutro' | 'verde' | 'vermelho'> = {
  pendente:  'neutro',
  realizada: 'verde',
  cancelada: 'vermelho',
}

/** Tom visual por faixa de score — cobre os valores observados na base real (Bom/Excelente/Bloqueado
 * vão além dos 3 originalmente previstos pela API). */
const FAIXA_TOM: Record<string, 'verde' | 'neutro' | 'amarelo' | 'vermelho'> = {
  Excelente: 'verde',
  Bom:       'verde',
  Regular:   'neutro',
  Atencao:   'amarelo',
  Critico:   'vermelho',
  Bloqueado: 'vermelho',
}

function formatarData(data: string | null): string | null {
  if (!data) return null
  const d = new Date(data)
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR')
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
  const [obsReuniao, setObsReuniao]   = useState('')
  const [salvandoReuniao, setSalvandoReuniao] = useState(false)
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

  // Só reseta o rascunho da observação quando o professor identificado muda —
  // evita apagar texto em digitação a cada refresh automático (a cada 4s).
  useEffect(() => {
    setObsReuniao(resultado?.reuniaoHoje?.observacao ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado?.professor.id])

  async function buscarManual(e: React.FormEvent) {
    e.preventDefault()
    if (!buscaManual.trim()) return
    setBuscando(true)
    const r = await enviar({ tipo: 'BUSCAR_PROFESSOR_POR_TEXTO', texto: buscaManual })
    setBuscando(false)
    if (r.ok && 'resultado' in r) setResultado(r.resultado)
  }

  function atualizarReuniaoHoje(r: RespostaDoBackground) {
    if (r.ok && 'reuniaoHoje' in r) {
      setResultado(prev => prev ? { ...prev, reuniaoHoje: r.reuniaoHoje } : prev)
    }
  }

  async function criarReuniaoAgora() {
    if (!resultado) return
    setSalvandoReuniao(true)
    const r = await enviar({ tipo: 'CRIAR_REUNIAO_AGORA', professorId: resultado.professor.id })
    setSalvandoReuniao(false)
    atualizarReuniaoHoje(r)
  }

  async function confirmarReuniao(aconteceu: boolean) {
    if (!resultado?.reuniaoHoje) return
    setSalvandoReuniao(true)
    const r = await enviar({
      tipo: 'CONFIRMAR_REUNIAO',
      participanteId: resultado.reuniaoHoje.participanteId,
      professorId: resultado.professor.id,
      aconteceu,
      observacao: obsReuniao,
    })
    setSalvandoReuniao(false)
    atualizarReuniaoHoje(r)
  }

  async function salvarObservacaoReuniao() {
    if (!resultado?.reuniaoHoje) return
    setSalvandoReuniao(true)
    const r = await enviar({
      tipo: 'SALVAR_OBSERVACAO_REUNIAO',
      participanteId: resultado.reuniaoHoje.participanteId,
      observacao: obsReuniao,
    })
    setSalvandoReuniao(false)
    atualizarReuniaoHoje(r)
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

      <div style={corpoRolavel}>
        {!sessao ? (
          <p style={{ fontSize: 12, color: C.inkMuted, margin: 0, lineHeight: 1.5 }}>
            Faça login no ícone da extensão (barra do Chrome) para ver o perfil do professor aqui.
          </p>
        ) : resultado ? (
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: '0 0 1px' }}>{resultado.professor.nome}</p>
            {resultado.professor.email && (
              <p style={{ fontSize: 11, color: C.inkMuted, margin: '0 0 8px' }}>{resultado.professor.email}</p>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {resultado.professor.grupo && <Chip>{resultado.professor.grupo.nome}</Chip>}
              {resultado.professor.coordenador_nome && <Chip>Coord. {resultado.professor.coordenador_nome}</Chip>}
              <Chip tom={resultado.professor.status === 'ativo' ? 'verde' : 'neutro'}>
                {resultado.professor.status === 'ativo' ? 'Ativo' : resultado.professor.status}
              </Chip>
              {tempoDeCasaLabel(resultado.professor.data_inicio) && (
                <Chip>{tempoDeCasaLabel(resultado.professor.data_inicio)} de casa</Chip>
              )}
              {resultado.professor.monitoramento && <Chip>Monitorada</Chip>}
            </div>

            <div style={secaoBox}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ ...rotulo, margin: 0 }}>Reunião de hoje</span>
                {resultado.reuniaoHoje && (
                  <Chip tom={REUNIAO_STATUS_TOM[resultado.reuniaoHoje.status] ?? 'neutro'}>
                    {REUNIAO_STATUS_LABEL[resultado.reuniaoHoje.status] ?? resultado.reuniaoHoje.status}
                    {resultado.reuniaoHoje.numero ? ` · ${resultado.reuniaoHoje.numero}º` : ''}
                  </Chip>
                )}
              </div>

              {!resultado.reuniaoHoje ? (
                <div>
                  <p style={{ fontSize: 12, color: C.inkMuted, margin: '0 0 8px', lineHeight: 1.4 }}>
                    Nenhuma reunião de hoje registrada para este professor.
                  </p>
                  <button onClick={criarReuniaoAgora} disabled={salvandoReuniao} style={botaoPrimario}>
                    {salvandoReuniao ? 'Registrando…' : 'Registrar reunião agora'}
                  </button>
                </div>
              ) : resultado.reuniaoHoje.status === 'pendente' ? (
                <div>
                  <textarea
                    value={obsReuniao}
                    onChange={e => setObsReuniao(e.target.value)}
                    placeholder="Observações da reunião…"
                    style={textarea}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={() => confirmarReuniao(true)} disabled={salvandoReuniao} style={botaoSucesso}>
                      Realizada
                    </button>
                    <button onClick={() => confirmarReuniao(false)} disabled={salvandoReuniao} style={botaoSecundario}>
                      Não aconteceu
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <textarea
                    value={obsReuniao}
                    onChange={e => setObsReuniao(e.target.value)}
                    placeholder="Observações da reunião…"
                    style={textarea}
                  />
                  <button
                    onClick={salvarObservacaoReuniao}
                    disabled={salvandoReuniao || obsReuniao === (resultado.reuniaoHoje.observacao ?? '')}
                    style={{ ...botaoTexto, marginTop: 6 }}
                  >
                    {salvandoReuniao ? 'Salvando…' : 'Salvar observação'}
                  </button>
                </div>
              )}
            </div>

            {resultado.acompanhamento && (
              <div style={secaoBox}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>
                    {resultado.acompanhamento.score_atual ?? '—'}
                  </span>
                  {resultado.acompanhamento.score_faixa && (
                    <Chip tom={FAIXA_TOM[resultado.acompanhamento.score_faixa] ?? 'neutro'}>
                      {resultado.acompanhamento.score_faixa}
                    </Chip>
                  )}
                  <span style={{ fontSize: 11, color: C.inkMuted }}>
                    {resultado.acompanhamento.elegivel_alocacao ? 'Elegível p/ alocação' : 'Não elegível p/ alocação'}
                  </span>
                </div>

                {(resultado.acompanhamento.reuniao_status || resultado.acompanhamento.reuniao_proxima) && (
                  <p style={{ fontSize: 11.5, color: C.ink, margin: '8px 0 0' }}>
                    Monitoramento KMS: <strong>{resultado.acompanhamento.reuniao_status?.replace(/_/g, ' ') ?? '—'}</strong>
                    {formatarData(resultado.acompanhamento.reuniao_proxima) && (
                      <span style={{ color: C.inkMuted }}> · próxima {formatarData(resultado.acompanhamento.reuniao_proxima)}</span>
                    )}
                  </p>
                )}

                {!!resultado.acompanhamento.avaliacao_alunos?.total_avaliacoes && (
                  <p style={{ fontSize: 11.5, color: C.ink, margin: '6px 0 0' }}>
                    ★ {resultado.acompanhamento.avaliacao_alunos.media_estrelas?.toFixed(1) ?? '—'}
                    <span style={{ color: C.inkMuted }}> ({resultado.acompanhamento.avaliacao_alunos.total_avaliacoes} avaliações,{' '}
                      {resultado.acompanhamento.avaliacao_alunos.comentarios_positivos ?? 0} pos. / {resultado.acompanhamento.avaliacao_alunos.comentarios_negativos ?? 0} neg.)
                    </span>
                  </p>
                )}

                {resultado.acompanhamento.alertas.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                    {resultado.acompanhamento.alertas.map((a, i) => (
                      <Chip key={i} tom="amarelo">{a.label}</Chip>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={secaoBox}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={rotulo}>Histórico de reuniões</span>
                <span style={{ fontSize: 11, color: C.inkMuted }}>{resultado.totalReunioesRealizadas} realizada(s)</span>
              </div>
              {resultado.historicoReunioes.length === 0 ? (
                <p style={{ fontSize: 12, color: C.inkMuted, margin: '6px 0 0' }}>Nenhuma reunião registrada ainda.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {resultado.historicoReunioes.slice(0, 3).map(h => (
                    <li key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11.5, color: C.ink }}>
                        {formatarData(h.data)}{h.numero ? ` · #${h.numero}` : ''}
                      </span>
                      <Chip tom={REUNIAO_STATUS_TOM[h.status] ?? 'neutro'}>{REUNIAO_STATUS_LABEL[h.status] ?? h.status}</Chip>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p style={rotulo}>Últimas observações</p>
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

const CHIP_CORES: Record<string, { bg: string; fg: string }> = {
  neutro:   { bg: C.bgSubtle,  fg: C.inkMuted },
  verde:    { bg: C.greenSoft, fg: C.green },
  amarelo:  { bg: C.amberSoft, fg: C.amber },
  vermelho: { bg: C.redSoft,   fg: C.red },
}

function Chip({ children, tom = 'neutro' }: { children: React.ReactNode; tom?: 'neutro' | 'verde' | 'amarelo' | 'vermelho' }) {
  const cores = CHIP_CORES[tom] ?? CHIP_CORES.neutro
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
      background: cores.bg, color: cores.fg,
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
  position: 'fixed', bottom: 20, right: 20, width: 320, maxHeight: '82vh', zIndex: 2147483647,
  background: C.bg, borderRadius: 14, border: `1px solid ${C.border}`,
  boxShadow: '0 12px 32px -8px rgba(0,0,0,0.25)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  display: 'flex', flexDirection: 'column',
}

const corpoRolavel: React.CSSProperties = {
  padding: 14, overflowY: 'auto',
}

const secaoBox: React.CSSProperties = {
  background: C.bgSubtle, borderRadius: 10, padding: '10px 11px', marginBottom: 12,
}

const rotulo: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: C.inkMuted, margin: '0 0 6px',
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

const botaoSucesso: React.CSSProperties = {
  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, color: '#fff',
  background: C.green, border: 'none', borderRadius: 8, cursor: 'pointer',
}

const botaoSecundario: React.CSSProperties = {
  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, color: C.inkMuted,
  background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer',
}

const textarea: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 56, padding: '7px 9px', fontSize: 12,
  border: `1px solid ${C.border}`, borderRadius: 8, outline: 'none', resize: 'vertical',
  fontFamily: 'inherit',
}

const botaoTexto: React.CSSProperties = {
  border: 'none', background: 'transparent', color: C.inkMuted, fontSize: 11.5,
  textDecoration: 'underline', cursor: 'pointer', padding: 0,
}
