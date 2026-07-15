import { useEffect, useRef, useState } from 'react'
import { extrairCandidatos } from './scrape'
import { GrupoParticipantes } from './GrupoParticipantes'
import type { MensagemParaBackground, RespostaDoBackground, ProfessorEncontrado, SessaoArmazenada, AvaliacaoAlunos, SugestaoProfessor } from '../shared/types'

const C = {
  brand:      '#D1333A',
  brandStrong:'#B02128',
  brandSoft:  '#FCEBEC',
  ink:        '#0F172A',  // slate-900 (nunca preto puro)
  inkSoft:    '#334155',  // slate-700
  inkMuted:   '#64748B',  // slate-500
  inkSubtle:  '#94A3B8',  // slate-400
  border:     '#E2E8F0',  // slate-200
  borderSoft: '#EEF1F5',
  bg:         '#FFFFFF',
  bgSubtle:   '#F1F5F9',  // slate-100
  bgCanvas:   '#F5F7FA',  // fundo do corpo (cards brancos flutuam sobre ele)
  green:      '#15803D', greenSoft: '#DCFCE7',
  amber:      '#B45309', amberSoft: '#FEF3C7',
  red:        '#B91C1C', redSoft:   '#FEE2E2',
  blue:       '#1D4ED8', blueSoft:  '#E6EDFB',
}
const SHADOW    = '0 12px 32px -14px rgba(15,23,42,0.35)'
const SHADOW_SM = '0 1px 2px rgba(15,23,42,0.05), 0 1px 3px rgba(15,23,42,0.05)'

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

// Ações rápidas (lançar observação / abrir incidente) — mesmos valores da plataforma web.
const TIPOS_OBSERVACAO: { value: string; label: string }[] = [
  { value: 'feedback_positivo', label: 'Positivo' },
  { value: 'feedback_negativo', label: 'Negativo' },
  { value: 'feedback_neutro',   label: 'Neutro' },
  { value: 'ocorrencia',        label: 'Ocorrência' },
]
const CATEGORIAS_INCIDENTE = [
  'No-show', 'Erros de lançamento', 'Reclamação', 'Muitas faltas', 'Muitas pendências',
  'Problemas didáticos reportados em atendimento', 'Profissionalismo', 'Organização',
] as const
const URGENCIAS = ['Baixa', 'Média', 'Alta'] as const

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

const NIVEL_LABEL: Record<string, string> = {
  observacao: 'Observação',
  alerta:     'Alerta',
  critico:    'Crítico',
}

const NIVEL_TOM: Record<string, 'neutro' | 'amarelo' | 'vermelho'> = {
  observacao: 'neutro',
  alerta:     'amarelo',
  critico:    'vermelho',
}

const URGENCIA_COR: Record<string, string> = {
  Baixa: '#1A9C5F',
  Média: '#B4690E',
  Alta:  '#C0272D',
}

function statusEscalonamento(t: { problem_resolved: boolean; forwarded_to_coordination: boolean }): { label: string; tom: 'verde' | 'amarelo' | 'vermelho' } {
  if (t.problem_resolved) return { label: 'Resolvido', tom: 'verde' }
  if (t.forwarded_to_coordination) return { label: 'Encaminhado à coordenação', tom: 'vermelho' }
  return { label: 'Em acompanhamento', tom: 'amarelo' }
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
  const [mesAnaliseAberto, setMesAnaliseAberto] = useState(false)
  const [mesAnaliseTexto, setMesAnaliseTexto]   = useState('')
  const [salvandoMesAnalise, setSalvandoMesAnalise] = useState(false)
  const [resolvendoObsId, setResolvendoObsId] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [sugestoes, setSugestoes] = useState<SugestaoProfessor[]>([])
  // Lançamento rápido de observação
  const [obsAberta, setObsAberta] = useState(false)
  const [obsTipo, setObsTipo]     = useState('feedback_positivo')
  const [obsTexto, setObsTexto]   = useState('')
  const [salvandoObs, setSalvandoObs] = useState(false)
  // Abertura de incidente
  const [incAberto, setIncAberto]     = useState(false)
  const [incTipo, setIncTipo]         = useState<string>(CATEGORIAS_INCIDENTE[0])
  const [incUrgencia, setIncUrgencia] = useState<string>('Média')
  const [incTexto, setIncTexto]       = useState('')
  const [salvandoInc, setSalvandoInc] = useState(false)
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
    setMesAnaliseAberto(false)
    setMesAnaliseTexto('')
    setErroAcao(null)
    setObsAberta(false); setObsTexto('')
    setIncAberto(false); setIncTexto('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado?.professor.id])

  async function buscarManual(e: React.FormEvent) {
    e.preventDefault()
    if (!buscaManual.trim()) return
    setBuscando(true)
    setSugestoes([])
    const r = await enviar({ tipo: 'BUSCAR_PROFESSOR_POR_TEXTO', texto: buscaManual })
    setBuscando(false)
    if (r.ok && 'resultado' in r) {
      setResultado(r.resultado)
      if (!r.resultado && 'sugestoes' in r && r.sugestoes) setSugestoes(r.sugestoes)
    }
  }

  async function carregarProfessor(id: string) {
    setBuscando(true)
    const r = await enviar({ tipo: 'CARREGAR_PROFESSOR', professorId: id })
    setBuscando(false)
    if (r.ok && 'resultado' in r && r.resultado) {
      setSugestoes([])
      setResultado(r.resultado)
    }
  }

  async function salvarNovaObservacao() {
    if (!resultado || !obsTexto.trim()) return
    setSalvandoObs(true); setErroAcao(null)
    const r = await enviar({ tipo: 'CRIAR_OBSERVACAO', professorId: resultado.professor.id, tipoObs: obsTipo, texto: obsTexto })
    setSalvandoObs(false)
    if (r.ok && 'resultado' in r && r.resultado) {
      setResultado(r.resultado); setObsAberta(false); setObsTexto('')
    } else if (!r.ok) setErroAcao(r.erro)
  }

  async function abrirIncidente() {
    if (!resultado || !incTexto.trim()) return
    setSalvandoInc(true); setErroAcao(null)
    const r = await enviar({ tipo: 'ABRIR_INCIDENTE', professorId: resultado.professor.id, problemType: incTipo, urgency: incUrgencia, description: incTexto })
    setSalvandoInc(false)
    if (r.ok && 'resultado' in r && r.resultado) {
      setResultado(r.resultado); setIncAberto(false); setIncTexto('')
    } else if (!r.ok) setErroAcao(r.erro)
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

  async function confirmarColocarMesAnalise() {
    if (!resultado || !mesAnaliseTexto.trim()) return
    setSalvandoMesAnalise(true)
    setErroAcao(null)
    const r = await enviar({ tipo: 'COLOCAR_MES_ANALISE', professorId: resultado.professor.id, descricao: mesAnaliseTexto })
    setSalvandoMesAnalise(false)
    if (r.ok && 'resultado' in r && r.resultado) {
      setResultado(r.resultado)
      setMesAnaliseAberto(false)
      setMesAnaliseTexto('')
    } else if (!r.ok) {
      setErroAcao(r.erro)
    }
  }

  async function confirmarResolverMesAnalise() {
    if (!resultado?.mesAnalise || !mesAnaliseTexto.trim()) return
    setSalvandoMesAnalise(true)
    setErroAcao(null)
    const r = await enviar({
      tipo: 'RESOLVER_MES_ANALISE',
      professorId: resultado.professor.id,
      incidentId: resultado.mesAnalise.id,
      resultado: mesAnaliseTexto,
    })
    setSalvandoMesAnalise(false)
    if (r.ok && 'resultado' in r && r.resultado) {
      setResultado(r.resultado)
      setMesAnaliseAberto(false)
      setMesAnaliseTexto('')
    } else if (!r.ok) {
      setErroAcao(r.erro)
    }
  }

  async function alternarResolvidoObservacao(id: string, resolvidoAtual: boolean) {
    if (!resultado) return
    setResolvendoObsId(id)
    setErroAcao(null)
    const r = await enviar({ tipo: 'RESOLVER_OBSERVACAO', professorId: resultado.professor.id, id, resolvido: !resolvidoAtual })
    setResolvendoObsId(null)
    if (r.ok && 'resultado' in r && r.resultado) {
      setResultado(r.resultado)
    } else if (!r.ok) {
      setErroAcao(r.erro)
    }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoK />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: C.ink }}>
            KING<span style={{ color: C.inkMuted, fontWeight: 600 }}> TEACHERTRACK</span>
          </span>
        </div>
        <button onClick={() => setColapsado(true)} style={botaoFechar} aria-label="Minimizar">—</button>
      </div>

      <div style={corpoRolavel}>
        {!sessao ? (
          <p style={{ fontSize: 12, color: C.inkMuted, margin: 0, lineHeight: 1.5 }}>
            Faça login no ícone da extensão (barra do navegador) para ver o perfil do professor aqui.
          </p>
        ) : resultado ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: '0 0 1px', letterSpacing: '-0.01em' }}>{resultado.professor.nome}</p>
                {resultado.professor.email && (
                  <p style={{ fontSize: 11, color: C.inkMuted, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resultado.professor.email}</p>
                )}
              </div>
              {resultado.confianca != null && (
                <span style={{ flexShrink: 0 }} title="Confiança do reconhecimento automático pelo nome">
                  <Chip tom={resultado.confianca >= 0.8 ? 'verde' : resultado.confianca >= 0.6 ? 'azul' : 'amarelo'}>
                    {Math.round(resultado.confianca * 100)}% match
                  </Chip>
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {resultado.mesAnalise && <Chip tom="vermelho">Em Mês de Análise</Chip>}
              {resultado.professor.grupo && <Chip>{resultado.professor.grupo.nome}</Chip>}
              {resultado.professor.coordenador_nome && <Chip>Coord. {resultado.professor.coordenador_nome}</Chip>}
              <Chip tom={resultado.professor.status === 'ativo' ? 'verde' : 'neutro'}>
                {resultado.professor.status === 'ativo' ? 'Ativo' : resultado.professor.status}
              </Chip>
              {formatarData(resultado.professor.data_inicio) && (
                <Chip>Desde {formatarData(resultado.professor.data_inicio)}</Chip>
              )}
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
                resultado.reuniaoHoje.tipo_reuniao === 'grupo' && resultado.reuniaoHoje.participantes ? (
                  // Reunião de grupo: lista de presença
                  <GrupoParticipantes
                    participantes={resultado.reuniaoHoje.participantes}
                    observacaoComum={resultado.reuniaoHoje.observacao}
                    onSalvar={async (presentesIds, obs) => {
                      setSalvandoReuniao(true)
                      try {
                        if (!resultado.reuniaoHoje!.reuniao_id) {
                          throw new Error('Reunião de grupo sem ID')
                        }
                        const r = await enviar({
                          tipo: 'CONFIRMAR_GRUPO',
                          reuniaoId: resultado.reuniaoHoje!.reuniao_id,
                          presentesIds,
                          observacao: obs,
                          professorId: resultado.professor.id,
                        })
                        if (r.ok && 'resultado' in r) {
                          setResultado(r.resultado)
                          // Recarrega resultado após confirmar
                          const r2 = await enviar({ tipo: 'BUSCAR_PROFESSOR', nomes: [], emails: [resultado.professor.email ?? ''] })
                          if (r2.ok && 'resultado' in r2) setResultado(r2.resultado)
                        }
                      } finally {
                        setSalvandoReuniao(false)
                      }
                    }}
                  />
                ) : (
                  // Reunião individual (1:1)
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
                )
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
                  <FeedbackGrafico av={resultado.acompanhamento.avaliacao_alunos} />
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: resultado.mesAnalise || mesAnaliseAberto ? 8 : 0 }}>
                <span style={{ ...rotulo, margin: 0 }}>Mês de Análise</span>
                {resultado.mesAnalise && <Chip tom="vermelho">Em análise</Chip>}
              </div>

              {resultado.mesAnalise ? (
                <div>
                  <p style={{ fontSize: 12, color: C.ink, margin: '0 0 8px', lineHeight: 1.4 }}>{resultado.mesAnalise.description}</p>
                  {!mesAnaliseAberto ? (
                    <button onClick={() => setMesAnaliseAberto(true)} style={botaoSecundario}>Resolver</button>
                  ) : (
                    <div>
                      <textarea
                        value={mesAnaliseTexto}
                        onChange={e => setMesAnaliseTexto(e.target.value)}
                        placeholder="Resultado do Mês de Análise…"
                        style={textarea}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button onClick={confirmarResolverMesAnalise} disabled={salvandoMesAnalise || !mesAnaliseTexto.trim()} style={botaoSucesso}>
                          {salvandoMesAnalise ? 'Salvando…' : 'Confirmar'}
                        </button>
                        <button onClick={() => { setMesAnaliseAberto(false); setMesAnaliseTexto('') }} style={botaoSecundario}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : !mesAnaliseAberto ? (
                <button onClick={() => setMesAnaliseAberto(true)} style={botaoTexto}>Colocar em Mês de Análise</button>
              ) : (
                <div>
                  <textarea
                    value={mesAnaliseTexto}
                    onChange={e => setMesAnaliseTexto(e.target.value)}
                    placeholder="Descreva o motivo…"
                    style={textarea}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={confirmarColocarMesAnalise} disabled={salvandoMesAnalise || !mesAnaliseTexto.trim()} style={botaoSucesso}>
                      {salvandoMesAnalise ? 'Salvando…' : 'Confirmar'}
                    </button>
                    <button onClick={() => { setMesAnaliseAberto(false); setMesAnaliseTexto('') }} style={botaoSecundario}>Cancelar</button>
                  </div>
                </div>
              )}

              {erroAcao && <p style={{ fontSize: 11, color: C.red, margin: '8px 0 0' }}>{erroAcao}</p>}
            </div>

            {/* Ações rápidas: lançar observação + abrir incidente */}
            <div style={secaoBox}>
              <span style={rotulo}>Ações rápidas</span>

              {!obsAberta ? (
                <button onClick={() => setObsAberta(true)} style={botaoTexto}>+ Lançar observação</button>
              ) : (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {TIPOS_OBSERVACAO.map(t => (
                      <button key={t.value} onClick={() => setObsTipo(t.value)} style={obsTipo === t.value ? chipSelAtivo : chipSel}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea value={obsTexto} onChange={e => setObsTexto(e.target.value)} placeholder="Observação sobre o professor…" style={textarea} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={salvarNovaObservacao} disabled={salvandoObs || !obsTexto.trim()} style={botaoSucesso}>
                      {salvandoObs ? 'Salvando…' : 'Salvar'}
                    </button>
                    <button onClick={() => { setObsAberta(false); setObsTexto('') }} style={botaoSecundario}>Cancelar</button>
                  </div>
                </div>
              )}

              {!incAberto ? (
                <button onClick={() => setIncAberto(true)} style={{ ...botaoTexto, marginTop: 6 }}>+ Abrir incidente</button>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <select value={incTipo} onChange={e => setIncTipo(e.target.value)} style={selectEstilo}>
                    {CATEGORIAS_INCIDENTE.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: 4, margin: '6px 0' }}>
                    {URGENCIAS.map(u => (
                      <button key={u} onClick={() => setIncUrgencia(u)} style={incUrgencia === u ? chipSelAtivo : chipSel}>{u}</button>
                    ))}
                  </div>
                  <textarea value={incTexto} onChange={e => setIncTexto(e.target.value)} placeholder="Descreva o incidente…" style={textarea} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={abrirIncidente} disabled={salvandoInc || !incTexto.trim()} style={botaoSucesso}>
                      {salvandoInc ? 'Abrindo…' : 'Abrir incidente'}
                    </button>
                    <button onClick={() => { setIncAberto(false); setIncTexto('') }} style={botaoSecundario}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>

            {!!(resultado.nexus.ocorrencias.length || resultado.nexus.tracking || resultado.nexus.alertas.length) && (
              <div style={secaoBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ ...rotulo, margin: 0 }}>Ocorrências (Nexus)</span>
                  {resultado.nexus.ocorrenciasAbertasTotal > 0 && (
                    <Chip tom="vermelho">{resultado.nexus.ocorrenciasAbertasTotal} em aberto</Chip>
                  )}
                </div>

                {resultado.nexus.tracking && (
                  <p style={{ fontSize: 11.5, color: C.ink, margin: '0 0 8px' }}>
                    Escalonamento: <strong>{statusEscalonamento(resultado.nexus.tracking).label}</strong>
                    {resultado.nexus.tracking.recurrence_count > 0 && (
                      <span style={{ color: C.inkMuted }}> · {resultado.nexus.tracking.recurrence_count} reincidência(s)</span>
                    )}
                  </p>
                )}

                {resultado.nexus.alertas.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    {resultado.nexus.alertas.map((a, i) => (
                      <Chip key={i} tom={NIVEL_TOM[a.level] ?? 'neutro'}>
                        {NIVEL_LABEL[a.level] ?? a.level} · {a.total_count}
                      </Chip>
                    ))}
                  </div>
                )}

                {resultado.nexus.ocorrencias.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {resultado.nexus.ocorrencias.slice(0, 3).map(o => (
                      <li key={o.id} style={{ borderLeft: `2px solid ${URGENCIA_COR[o.urgency] ?? C.border}`, paddingLeft: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: C.inkMuted }}>{o.problem_type}</span>
                          <span style={{ fontSize: 10.5, color: C.inkMuted }}>{formatarData(o.created_at)}</span>
                        </div>
                        <p style={{ fontSize: 12, color: C.ink, margin: '2px 0 0', lineHeight: 1.4 }}>{o.description}</p>
                      </li>
                    ))}
                  </ul>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ ...rotulo, margin: 0 }}>Últimas observações</span>
              {resultado.observacoesAbertasTotal > 0 && (
                <Chip tom="vermelho">{resultado.observacoesAbertasTotal} ocorrência(s) em aberto</Chip>
              )}
            </div>
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
                    {o.tipo === 'ocorrencia' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <Chip tom={o.resolvido ? 'verde' : 'vermelho'}>{o.resolvido ? 'Resolvida' : 'Em aberto'}</Chip>
                        <button
                          onClick={() => alternarResolvidoObservacao(o.id, o.resolvido)}
                          disabled={resolvendoObsId === o.id}
                          style={botaoTexto}
                        >
                          {resolvendoObsId === o.id ? 'Salvando…' : o.resolvido ? 'Reabrir' : 'Marcar como resolvida'}
                        </button>
                      </div>
                    )}
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
            <p style={{ fontSize: 10.5, color: C.inkSubtle, margin: '7px 0 0' }}>Busca só entre professores ativos.</p>

            {sugestoes.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p style={rotulo}>Correspondências mais próximas</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sugestoes.map(s => (
                    <button key={s.id} onClick={() => carregarProfessor(s.id)} style={botaoSugestao}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nome}</span>
                      <Chip tom={s.score >= 0.8 ? 'verde' : s.score >= 0.6 ? 'azul' : 'neutro'}>
                        {Math.round(s.score * 100)}%
                      </Chip>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const CHIP_CORES: Record<string, { bg: string; fg: string; bd: string }> = {
  neutro:   { bg: C.bgSubtle,  fg: C.inkSoft, bd: C.border },
  verde:    { bg: C.greenSoft, fg: C.green,   bd: 'transparent' },
  amarelo:  { bg: C.amberSoft, fg: C.amber,   bd: 'transparent' },
  vermelho: { bg: C.redSoft,   fg: C.red,     bd: 'transparent' },
  azul:     { bg: C.blueSoft,  fg: C.blue,    bd: 'transparent' },
}

function Chip({ children, tom = 'neutro' }: { children: React.ReactNode; tom?: 'neutro' | 'verde' | 'amarelo' | 'vermelho' | 'azul' }) {
  const cores = CHIP_CORES[tom] ?? CHIP_CORES.neutro
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
      background: cores.bg, color: cores.fg, border: `1px solid ${cores.bd}`,
      whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
    }}>
      {children}
    </span>
  )
}

/** Mini-gráfico de feedbacks: barra positivo/negativo + distribuição de estrelas. */
function FeedbackGrafico({ av }: { av: AvaliacaoAlunos }) {
  const pos = av.comentarios_positivos ?? 0
  const neg = av.comentarios_negativos ?? 0
  const totalComent = pos + neg
  const estrelas = [5, 4, 3, 2, 1].map(n => ({ n, v: (av[`estrelas_${n}` as keyof AvaliacaoAlunos] as number | undefined) ?? 0 }))
  const maxEstrela = Math.max(1, ...estrelas.map(e => e.v))

  return (
    <div style={{ marginTop: 8 }}>
      <span style={{ fontSize: 11.5, color: C.ink }}>
        ★ <strong>{av.media_estrelas?.toFixed(1) ?? '—'}</strong>
        <span style={{ color: C.inkMuted }}> · {av.total_avaliacoes} avaliações</span>
      </span>

      {totalComent > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: C.bgSubtle }}>
            <div style={{ width: `${(pos / totalComent) * 100}%`, background: C.green }} />
            <div style={{ width: `${(neg / totalComent) * 100}%`, background: C.red }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginTop: 3 }}>
            <span style={{ color: C.green, fontWeight: 600 }}>{pos} positivo{pos === 1 ? '' : 's'}</span>
            <span style={{ color: C.red, fontWeight: 600 }}>{neg} negativo{neg === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {estrelas.map(e => (
          <div key={e.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: C.inkMuted, width: 20 }}>{e.n}★</span>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: C.bgSubtle, overflow: 'hidden' }}>
              <div style={{ width: `${(e.v / maxEstrela) * 100}%`, height: '100%', background: C.amber }} />
            </div>
            <span style={{ fontSize: 10, color: C.inkMuted, width: 16, textAlign: 'right' }}>{e.v}</span>
          </div>
        ))}
      </div>
    </div>
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

// Canto superior esquerdo, logo abaixo da barra do Meet com hora e nome da reunião.
const painel: React.CSSProperties = {
  position: 'fixed', top: 68, left: 16, width: 344, maxHeight: 'calc(100vh - 88px)', zIndex: 2147483647,
  background: C.bg, borderRadius: 16, border: `1px solid ${C.border}`,
  boxShadow: SHADOW, color: C.ink,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
}

const corpoRolavel: React.CSSProperties = {
  padding: 14, overflowY: 'auto', background: C.bgCanvas,
}

const secaoBox: React.CSSProperties = {
  background: C.bg, borderRadius: 12, padding: '11px 12px', marginBottom: 10,
  border: `1px solid ${C.border}`, boxShadow: SHADOW_SM,
}

const rotulo: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: C.inkSubtle, margin: '0 0 8px',
}

const cabecalho: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '11px 13px', borderBottom: `1px solid ${C.border}`, background: C.bg,
}

const botaoFechar: React.CSSProperties = {
  border: 'none', background: 'transparent', color: C.inkSubtle, fontSize: 16,
  cursor: 'pointer', lineHeight: 1, padding: 4, borderRadius: 6,
}

const botaoFlutuante: React.CSSProperties = {
  position: 'fixed', top: 68, left: 16, zIndex: 2147483647,
  width: 40, height: 40, borderRadius: 12, border: `1px solid ${C.border}`,
  background: C.bg, boxShadow: SHADOW,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
}

const input: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '8px 10px', fontSize: 12.5, color: C.ink,
  border: `1px solid ${C.border}`, borderRadius: 9, outline: 'none', background: C.bg,
}

const botaoPrimario: React.CSSProperties = {
  padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: '#fff',
  background: C.ink, border: 'none', borderRadius: 9, cursor: 'pointer', flexShrink: 0,
}

const botaoSucesso: React.CSSProperties = {
  flex: 1, padding: '8px 0', fontSize: 12.5, fontWeight: 600, color: '#fff',
  background: C.green, border: 'none', borderRadius: 9, cursor: 'pointer',
}

const botaoSecundario: React.CSSProperties = {
  flex: 1, padding: '8px 0', fontSize: 12.5, fontWeight: 600, color: C.inkSoft,
  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, cursor: 'pointer',
}

const textarea: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 58, padding: '8px 10px', fontSize: 12.5, color: C.ink,
  border: `1px solid ${C.border}`, borderRadius: 9, outline: 'none', resize: 'vertical',
  fontFamily: 'inherit', background: C.bg,
}

const botaoTexto: React.CSSProperties = {
  border: 'none', background: 'transparent', color: C.inkSoft, fontSize: 11.5, fontWeight: 600,
  cursor: 'pointer', padding: 0,
}

const chipSel: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, fontWeight: 600, color: C.inkMuted,
  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer',
}

const chipSelAtivo: React.CSSProperties = {
  ...chipSel, color: '#fff', background: C.ink, border: `1px solid ${C.ink}`,
}

const selectEstilo: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 12.5, color: C.ink,
  border: `1px solid ${C.border}`, borderRadius: 9, outline: 'none', background: C.bg, fontFamily: 'inherit',
}

const botaoSugestao: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
  textAlign: 'left', padding: '9px 11px', fontSize: 12.5, fontWeight: 600, color: C.ink,
  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer',
  boxShadow: SHADOW_SM,
}
