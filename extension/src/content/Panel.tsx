import { useEffect, useMemo, useRef, useState } from 'react'
import { extrairCandidatos, extrairEmailsParticipantes } from './scrape'
import { GrupoParticipantes } from './GrupoParticipantes'
import type {
  MensagemParaBackground, RespostaDoBackground, ProfessorEncontrado, SessaoArmazenada,
  AvaliacaoAlunos, SugestaoProfessor, ScorePonto, AvaliacaoPonto, AlunoVinculado, AlunoSaida,
  SituacaoResumo, ConfiabilidadeResumo, PrioridadeResumo, FeedbacksJanela,
  RankingGrupo, ItemRankingGrupo,
} from '../shared/types'

// ─────────────────────────────────────────────────────────────────────────────
// Painel do professor — HUD sobre a chamada do Meet.
//
// O visual mora em ./estilos.ts (folha de estilo injetada no shadow root); aqui
// só se usa className. Antes era tudo objeto de estilo inline, o que impedia
// :hover, :focus e keyframes.
//
// A informação é dividida em ABAS. O painel tinha virado uma coluna de ~2000px
// de rolagem: numa reunião ao vivo ninguém rola atrás de um dado. Cada aba
// carrega um selo com o que exige atenção, então o que está pegando fogo é
// visível sem abrir nada.
// ─────────────────────────────────────────────────────────────────────────────

type Tom = 'neutro' | 'verde' | 'ambar' | 'vermelho' | 'azul'

const TIPO_LABEL: Record<string, string> = {
  reuniao:           'Reunião',
  ocorrencia:        'Ocorrência',
  feedback_positivo: 'Positivo',
  feedback_negativo: 'Negativo',
  feedback_neutro:   'Neutro',
}

const REUNIAO_STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', realizada: 'Realizada', cancelada: 'Cancelada',
}

const REUNIAO_STATUS_TOM: Record<string, Tom> = {
  pendente: 'neutro', realizada: 'verde', cancelada: 'vermelho',
}

const CATEGORIAS_INCIDENTE = [
  'No-show', 'Erros de lançamento', 'Reclamação', 'Muitas faltas', 'Muitas pendências',
  'Problemas didáticos reportados em atendimento', 'Profissionalismo', 'Organização',
] as const

const URGENCIAS = ['Baixa', 'Média', 'Alta'] as const

/** Dias até o prazo por urgência — espelha PRAZO_PADRAO_DIAS em src/lib/incidentePrazo.ts. */
const PRAZO_PADRAO_DIAS: Record<string, number> = { Alta: 1, Média: 3, Baixa: 7 }

/** Data-limite sugerida pela urgência, no fim do dia local (o dia inteiro conta como no prazo). */
function prazoSugeridoISO(urgencia: string): string {
  const d = new Date()
  d.setDate(d.getDate() + (PRAZO_PADRAO_DIAS[urgencia] ?? 3))
  d.setHours(23, 59, 59, 0)
  return d.toISOString()
}

const NATUREZAS: { value: 'desafio' | 'informe'; label: string; ajuda: string }[] = [
  { value: 'desafio', label: 'Chamado', ajuda: 'Precisa de solução — entra na fila com prazo.' },
  { value: 'informe', label: 'Informe', ajuda: 'Só registro do que aconteceu, sem fluxo de resolução.' },
]

/** Tom por faixa de score — cobre os valores reais da base (a API previa só 3). */
const FAIXA_TOM: Record<string, Tom> = {
  Excelente: 'verde', Bom: 'verde', Regular: 'neutro',
  Atencao: 'ambar', Critico: 'vermelho', Bloqueado: 'vermelho',
}

const NIVEL_LABEL: Record<string, string> = {
  observacao: 'Observação', alerta: 'Alerta', critico: 'Crítico',
}
const NIVEL_TOM: Record<string, Tom> = {
  observacao: 'neutro', alerta: 'ambar', critico: 'vermelho',
}

const STATUS_ALUNO_TOM: Record<string, Tom> = { ativo: 'verde', pausado: 'ambar' }

const VEREDITO_META: Record<string, { label: string; tom: Tom }> = {
  confiavel: { label: 'Confiável', tom: 'verde' },
  atencao:   { label: 'Atenção',   tom: 'ambar' },
  risco:     { label: 'Risco',     tom: 'vermelho' },
}

const NIVEL_PRIORIDADE_META: Record<string, { label: string; tom: Tom }> = {
  critica: { label: 'Prioridade crítica', tom: 'vermelho' },
  alta:    { label: 'Prioridade alta',    tom: 'ambar' },
  media:   { label: 'Prioridade média',   tom: 'azul' },
  baixa:   { label: 'Prioridade baixa',   tom: 'neutro' },
}

const TOM_SINAL: Record<string, Tom> = { ok: 'verde', warn: 'ambar', crit: 'vermelho' }

const STATUS_FILA_LABEL: Record<string, string> = {
  pendente: 'Na fila', em_atendimento: 'Em atendimento',
  concluida: 'Concluída', recusada: 'Recusada',
}
const STATUS_FILA_TOM: Record<string, Tom> = {
  pendente: 'ambar', em_atendimento: 'azul', concluida: 'verde', recusada: 'neutro',
}

const ETAPA_CONVOCACAO_LABEL: Record<string, string> = {
  pendente_contato: 'Falta contatar', aguardando_resposta: 'Aguardando resposta',
  agendada: 'Agendada', realizada: 'Realizada',
}

const SILENCIO_LABEL: Record<string, string> = {
  alerta: 'Alerta', aviso_saida: 'Aviso de saída de alunos', reuniao: 'Reunião solicitada',
}

const URGENCIA_CLASSE: Record<string, string> = {
  Baixa: '', Média: 'ktm-registro--alta', Alta: 'ktm-registro--critica',
  Crítico: 'ktm-registro--critica', Crítica: 'ktm-registro--critica',
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function formatarData(data: string | null | undefined): string | null {
  if (!data) return null
  const d = new Date(data)
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR')
}

/** 202608 → "ago/26". Rótulo dos pontos do gráfico de score. */
function rotuloAnoMes(anoMes: number): string {
  const d = new Date(Math.floor(anoMes / 100), (anoMes % 100) - 1, 1)
  return isNaN(d.getTime())
    ? String(anoMes)
    : d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
}

/** "2026-08-21" → "21/08/26". Rótulo dos pontos do gráfico de avaliação. */
function rotuloDia(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
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

function whatsappLink(tel: string | null): string | null {
  if (!tel) return null
  let d = tel.replace(/\D/g, '')
  if (!d) return null
  if (d.length <= 11) d = '55' + d
  return `https://wa.me/${d}`
}

/** Copia texto. No Meet o clipboard assíncrono às vezes é barrado (documento sem
 *  foco / permissão), daí o fallback do execCommand. */
async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

/** Atraso escalonado da animação de entrada, via variável CSS. */
function atraso(ms: number): React.CSSProperties {
  return { '--atraso': `${ms}ms` } as React.CSSProperties
}

// ─── Ícones (traço fino, 1.25) ───────────────────────────────────────────────

const traco = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const IconeCopiar = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect x="5.5" y="5.5" width="8" height="8" rx="2" {...traco} />
    <path d="M10.5 3.5a2 2 0 0 0-2-2h-4a3 3 0 0 0-3 3v4a2 2 0 0 0 2 2" {...traco} />
  </svg>
)
const IconeCheck = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" {...traco} /></svg>
)
const IconeSeta = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 12 12 4M6 4h6v6" {...traco} />
  </svg>
)
const IconeMais = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" {...traco} /></svg>
)

// ─── Peças ───────────────────────────────────────────────────────────────────

function Selo({ children, tom = 'neutro', titulo }: { children: React.ReactNode; tom?: Tom; titulo?: string }) {
  return (
    <span className={`ktm-selo-chip${tom !== 'neutro' ? ` ktm-selo-chip--${tom}` : ''}`} title={titulo}>
      {children}
    </span>
  )
}

function Cartao({ children, rotulo, acessorio, className = '', style }: {
  children: React.ReactNode; rotulo?: string; acessorio?: React.ReactNode
  className?: string; style?: React.CSSProperties
}) {
  return (
    <section className={`ktm-cartao ktm-entra ${className}`} style={style}>
      {(rotulo || acessorio) && (
        <header className="ktm-cartao-topo">
          <span className="ktm-rotulo">{rotulo}</span>
          {acessorio}
        </header>
      )}
      {children}
    </section>
  )
}

function Fato({ k, v, largo }: { k: string; v: React.ReactNode; largo?: boolean }) {
  return (
    <div className={`ktm-fato${largo ? ' ktm-largo' : ''}`}>
      <div className="ktm-fato-k">{k}</div>
      <div className="ktm-fato-v">{v}</div>
    </div>
  )
}

/** Copiar o nome direto do título. */
function CopiarNome({ nome }: { nome: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      className={`ktm-nome-copia${ok ? ' ktm-nome-copia--ok' : ''}`}
      title="Copiar o nome"
      aria-label="Copiar o nome"
      onClick={async () => {
        if (await copiar(nome)) { setOk(true); setTimeout(() => setOk(false), 1600) }
      }}
    >
      {ok ? <IconeCheck /> : <IconeCopiar />}
    </button>
  )
}

/** Pílula de contato — clicar copia. O texto inteiro é a área de clique. */
function Copiavel({ valor, titulo, extra }: { valor: string; titulo: string; extra?: React.ReactNode }) {
  const [estado, setEstado] = useState<'ocioso' | 'ok' | 'erro'>('ocioso')

  async function aoClicar() {
    const ok = await copiar(valor)
    setEstado(ok ? 'ok' : 'erro')
    setTimeout(() => setEstado('ocioso'), 1600)
  }

  return (
    <>
      <button
        className={`ktm-copia${estado === 'ok' ? ' ktm-copia--ok' : estado === 'erro' ? ' ktm-copia--erro' : ''}`}
        onClick={aoClicar}
        title={`Copiar ${titulo}`}
        aria-label={`Copiar ${titulo}`}
      >
        <span className="ktm-copia-txt">{estado === 'erro' ? 'não consegui copiar' : valor}</span>
        <span className="ktm-copia-icone">{estado === 'ok' ? <IconeCheck /> : <IconeCopiar />}</span>
      </button>
      {extra}
    </>
  )
}

// ─── Gráficos ────────────────────────────────────────────────────────────────

const G_LARGURA = 300, G_ALTURA = 56, G_PAD = 6

/** Linha com área, pontos e tooltip por ponto. Escala no próprio intervalo da
 *  série — o que importa é a TENDÊNCIA, não a distância até o zero. */
function GraficoLinha({ pontos, cor, formatar }: {
  pontos: { rotulo: string; valor: number }[]
  cor: string
  formatar: (v: number) => string
}) {
  const id = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, [])
  const valores = pontos.map(p => p.valor)
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const amplitude = max - min

  const x = (i: number) => pontos.length === 1
    ? G_LARGURA / 2
    : G_PAD + (i * (G_LARGURA - G_PAD * 2)) / (pontos.length - 1)
  // Série inteira no mesmo valor: linha reta no MEIO (no rodapé pareceria queda).
  const y = (v: number) => amplitude === 0
    ? G_ALTURA / 2
    : G_ALTURA - G_PAD - ((v - min) / amplitude) * (G_ALTURA - G_PAD * 2)

  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ')
  const area  = `${linha} L${x(pontos.length - 1).toFixed(1)},${G_ALTURA} L${x(0).toFixed(1)},${G_ALTURA} Z`
  const ultimo = pontos.length - 1

  return (
    <svg viewBox={`0 0 ${G_LARGURA} ${G_ALTURA}`} style={{ width: '100%', height: G_ALTURA, display: 'block', overflow: 'visible' }} role="img">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={linha} fill="none" stroke={cor} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      {pontos.map((p, i) => (
        <g key={`${p.rotulo}-${i}`}>
          <circle cx={x(i)} cy={y(p.valor)} r={i === ultimo ? 3.4 : 1.9}
                  fill={i === ultimo ? cor : '#0B0B0E'} stroke={cor} strokeWidth={1.4} />
          {/* alvo invisível maior — o tooltip do ponto é o que dá o número exato */}
          <circle cx={x(i)} cy={y(p.valor)} r={9} fill="transparent">
            <title>{`${p.rotulo}: ${formatar(p.valor)}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  )
}

function Variacao({ delta, formatar, sufixo }: { delta: number; formatar: (v: number) => string; sufixo: string }) {
  if (delta === 0) return <Selo>estável {sufixo}</Selo>
  const subiu = delta > 0
  return <Selo tom={subiu ? 'verde' : 'vermelho'}>{subiu ? '↑' : '↓'} {formatar(Math.abs(delta))} {sufixo}</Selo>
}

function EixoGrafico({ de, ate, meio }: { de: string; ate: string; meio?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
      <span className="ktm-txt-3">{de}</span>
      {meio && <span className="ktm-txt-3">{meio}</span>}
      <span className="ktm-txt-3">{ate}</span>
    </div>
  )
}

/** Evolução do score (professor_score_historico — um ponto por mês com evento). */
function ScoreGrafico({ historico }: { historico: ScorePonto[] }) {
  if (historico.length < 2) {
    return (
      <p className="ktm-txt-3" style={{ marginTop: 10 }}>
        {historico.length === 1
          ? 'Só um mês registrado — o gráfico aparece a partir do segundo.'
          : 'Sem histórico mensal de score para este professor.'}
      </p>
    )
  }
  const pontos = historico.map(h => ({ rotulo: rotuloAnoMes(h.ano_mes), valor: h.score }))
  const delta  = pontos[pontos.length - 1].valor - pontos[0].valor

  return (
    <div style={{ marginTop: 12 }}>
      <div className="ktm-cartao-topo" style={{ marginBottom: 6 }}>
        <span className="ktm-txt-3">{pontos.length} meses</span>
        <Variacao delta={delta} formatar={v => String(Math.round(v))} sufixo="no período" />
      </div>
      <GraficoLinha pontos={pontos} cor="#86A8FF" formatar={v => String(Math.round(v))} />
      <EixoGrafico de={pontos[0].rotulo} ate={pontos[pontos.length - 1].rotulo} />
    </div>
  )
}

/** Evolução da avaliação de alunos (professor_avaliacao_historico, migration 20260771).
 *  Série esparsa por natureza: o backfill veio das observações e daí em diante só
 *  nasce ponto quando algum número muda. */
function AvaliacaoGrafico({ historico }: { historico: AvaliacaoPonto[] }) {
  const comMedia = historico.filter(h => h.media_estrelas != null)
  if (comMedia.length < 2) {
    return (
      <p className="ktm-txt-3" style={{ marginTop: 10 }}>
        Ainda não há histórico suficiente para o gráfico — a série começa a acumular
        a partir de agora, com um ponto a cada mudança na avaliação.
      </p>
    )
  }
  const pontos = comMedia.map(h => ({ rotulo: rotuloDia(h.dia), valor: Number(h.media_estrelas) }))
  const delta  = pontos[pontos.length - 1].valor - pontos[0].valor
  const novas  = (comMedia[comMedia.length - 1].total_avaliacoes ?? 0) - (comMedia[0].total_avaliacoes ?? 0)

  return (
    <div style={{ marginTop: 12 }}>
      <div className="ktm-cartao-topo" style={{ marginBottom: 6 }}>
        <span className="ktm-txt-3">{pontos.length} pontos</span>
        <Variacao delta={Number(delta.toFixed(2))} formatar={v => v.toFixed(2)} sufixo="★" />
      </div>
      <GraficoLinha pontos={pontos} cor="#F5B544" formatar={v => `${v.toFixed(2)} ★`} />
      <EixoGrafico
        de={pontos[0].rotulo}
        ate={pontos[pontos.length - 1].rotulo}
        meio={novas > 0 ? `+${novas} avaliação(ões)` : undefined}
      />
    </div>
  )
}

// ─── Feedbacks: mês corrente + anterior, dia a dia ───────────────────────────

/** "YYYY-MM-DD" no fuso local. */
function diaLocalStr(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

/** Todos os dias da janela: 1º do mês anterior → último dia do mês corrente. */
function diasDaJanela(inicio: string, divisa: string): string[] {
  const [ay, am] = inicio.split('-').map(Number)
  const [by, bm] = divisa.split('-').map(Number)
  const fim = new Date(by, bm, 0) // dia 0 do mês seguinte = último dia do mês corrente
  const dias: string[] = []
  for (const d = new Date(ay, am - 1, 1); d <= fim; d.setDate(d.getDate() + 1)) dias.push(diaLocalStr(d))
  return dias
}

function nomeDoMes(dia: string): string {
  const [y, m] = dia.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
}

const F_LARGURA = 300, F_META = 34, F_EIXO = 9

/** Evolução dos feedbacks nos DOIS MESES fixos (o corrente e o anterior).
 *
 *  Colunas divergentes por dia: positivo sobe, negativo desce. O negativo é o
 *  que interessa apontar, então ele fica em vermelho cheio e sai listado embaixo
 *  com data e texto. Feedback do KTM tem data exata; o do King é datado pelo dia
 *  em que o contador de comentários subiu — a origem aparece em cada linha. */
function FeedbacksGrafico({ j }: { j: FeedbacksJanela }) {
  const [verTodos, setVerTodos] = useState(false)

  const dias = useMemo(() => diasDaJanela(j.inicio, j.divisa), [j.inicio, j.divisa])
  const hoje = diaLocalStr(new Date())

  const porDia = useMemo(() => {
    const m = new Map<string, { pos: number; neg: number }>()
    for (const d of dias) m.set(d, { pos: 0, neg: 0 })
    for (const e of j.eventos) {
      const alvo = m.get(e.dia)
      if (!alvo || e.tipo === 'neutro') continue
      if (e.tipo === 'negativo') alvo.neg += e.qtd
      else alvo.pos += e.qtd
    }
    return m
  }, [dias, j.eventos])

  const negativos = j.eventos.filter(e => e.tipo === 'negativo')
  const totais = (mesAtual: boolean) => {
    const dentro = (d: string) => (mesAtual ? d >= j.divisa : d < j.divisa)
    return {
      neg: j.eventos.filter(e => e.tipo === 'negativo' && dentro(e.dia)).reduce((s, e) => s + e.qtd, 0),
      pos: j.eventos.filter(e => e.tipo === 'positivo' && dentro(e.dia)).reduce((s, e) => s + e.qtd, 0),
    }
  }
  const anterior = totais(false)
  const atual    = totais(true)

  const pico = Math.max(1, ...dias.map(d => Math.max(porDia.get(d)!.pos, porDia.get(d)!.neg)))
  const slot = F_LARGURA / dias.length
  const largura = Math.max(2.2, slot - 1.6)
  const altura = F_META * 2 + F_EIXO
  const idxDivisa = dias.indexOf(j.divisa)
  const idxHoje = dias.indexOf(hoje)

  const rotuloDoDia = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  return (
    <div>
      {/* Placar dos dois meses, lado a lado. */}
      <div className="ktm-bento" style={{ marginBottom: 11 }}>
        <div className="ktm-fato">
          <div className="ktm-fato-k">{nomeDoMes(j.inicio)}</div>
          <div className="ktm-fato-v">
            <span style={{ color: 'var(--vermelho)' }}>{anterior.neg} neg</span>
            <span className="ktm-txt-3"> · {anterior.pos} pos</span>
          </div>
        </div>
        <div className="ktm-fato">
          <div className="ktm-fato-k">{nomeDoMes(j.divisa)} · em curso</div>
          <div className="ktm-fato-v">
            <span style={{ color: 'var(--vermelho)' }}>{atual.neg} neg</span>
            <span className="ktm-txt-3"> · {atual.pos} pos</span>
          </div>
        </div>
      </div>

      {atual.neg !== anterior.neg && (
        <div style={{ marginBottom: 9 }}>
          {/* Menos negativos é melhora — daí o verde invertido. */}
          <Selo tom={atual.neg < anterior.neg ? 'verde' : 'vermelho'}>
            {atual.neg < anterior.neg ? '↓' : '↑'} {Math.abs(atual.neg - anterior.neg)} negativo(s) neste mês
          </Selo>
        </div>
      )}

      <svg viewBox={`0 0 ${F_LARGURA} ${altura}`} style={{ width: '100%', height: altura, display: 'block' }} role="img">
        {/* divisa entre os dois meses */}
        {idxDivisa > 0 && (
          <line x1={idxDivisa * slot - 0.8} x2={idxDivisa * slot - 0.8} y1={0} y2={altura}
                stroke="rgba(255,255,255,0.14)" strokeWidth={1} strokeDasharray="2 3" />
        )}
        {/* hoje */}
        {idxHoje >= 0 && (
          <line x1={idxHoje * slot + largura / 2} x2={idxHoje * slot + largura / 2} y1={0} y2={altura}
                stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
        )}
        {/* linha do zero */}
        <line x1={0} x2={F_LARGURA} y1={F_META + F_EIXO / 2} y2={F_META + F_EIXO / 2}
              stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

        {dias.map((d, i) => {
          const { pos, neg } = porDia.get(d)!
          const hPos = (pos / pico) * F_META
          const hNeg = (neg / pico) * F_META
          const x = i * slot
          const futuro = d > hoje
          return (
            <g key={d}>
              {pos > 0 && (
                <rect x={x} y={F_META - hPos} width={largura} height={hPos} rx={1}
                      fill="var(--verde)" opacity={0.85} />
              )}
              {neg > 0 && (
                <rect x={x} y={F_META + F_EIXO} width={largura} height={hNeg} rx={1} fill="var(--vermelho)" />
              )}
              {/* alvo de hover do dia inteiro — é o que dá a leitura precisa */}
              <rect x={x} y={0} width={Math.max(largura, slot)} height={altura} fill="transparent">
                <title>
                  {rotuloDoDia(d)}
                  {futuro ? ' · ainda não aconteceu'
                    : pos || neg
                      ? ` · ${neg} negativo(s), ${pos} positivo(s)`
                      : ' · sem feedback'}
                </title>
              </rect>
            </g>
          )
        })}
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span className="ktm-txt-3">{nomeDoMes(j.inicio)}</span>
        <span className="ktm-txt-3">{nomeDoMes(j.divisa)}</span>
      </div>

      {/* Os negativos, um a um — a parte que precisa ser precisa. */}
      <div style={{ marginTop: 12 }}>
        <div className="ktm-cartao-topo" style={{ marginBottom: 7 }}>
          <span className="ktm-rotulo">Negativos no período</span>
          <Selo tom={negativos.length ? 'vermelho' : 'verde'}>{negativos.reduce((s, e) => s + e.qtd, 0)}</Selo>
        </div>

        {negativos.length === 0 ? (
          <p className="ktm-txt-2">Nenhum feedback negativo nos dois meses.</p>
        ) : (
          <>
            <ul className="ktm-lista ktm-lista--esp">
              {(verTodos ? negativos : negativos.slice(0, 5)).map((e, i) => (
                <li key={e.id} className="ktm-registro ktm-registro--critica ktm-entra" style={atraso(i * 45)}>
                  <div className="ktm-registro-topo">
                    <span>{e.origem === 'ktm' ? 'Coordenação' : 'Comentário de aluno'}{e.qtd > 1 ? ` · ${e.qtd}×` : ''}</span>
                    <span>{rotuloDoDia(e.dia)}</span>
                  </div>
                  {e.texto
                    ? <p className="ktm-registro-txt">{e.texto}</p>
                    : <p className="ktm-txt-3" style={{ marginTop: 3 }}>
                        O King não expõe o texto nem a hora — a data é o dia em que o contador subiu.
                      </p>}
                </li>
              ))}
            </ul>
            {negativos.length > 5 && (
              <button className="ktm-linkbtn" style={{ marginTop: 9 }} onClick={() => setVerTodos(v => !v)}>
                {verTodos ? 'Ver menos' : `Ver todos (${negativos.length})`}
              </button>
            )}
          </>
        )}
      </div>

      {!j.temSerieKing && (
        <p className="ktm-txt-3" style={{ marginTop: 10 }}>
          Só os feedbacks lançados no KTM entram aqui: a série de comentários de aluno
          depende da migration <code>20260771</code> estar aplicada.
        </p>
      )}
    </div>
  )
}

/** Foto de hoje: barra positivo/negativo + distribuição de estrelas. */
function FeedbackGrafico({ av }: { av: AvaliacaoAlunos }) {
  const pos = av.comentarios_positivos ?? 0
  const neg = av.comentarios_negativos ?? 0
  const totalComent = pos + neg
  const estrelas = [5, 4, 3, 2, 1].map(n => ({ n, v: (av[`estrelas_${n}` as keyof AvaliacaoAlunos] as number | undefined) ?? 0 }))
  const maxEstrela = Math.max(1, ...estrelas.map(e => e.v))

  return (
    <div>
      <div className="ktm-delta">
        <span className="ktm-numero">{av.media_estrelas?.toFixed(1) ?? '—'}<span style={{ fontSize: 15, color: 'var(--ambar)' }}> ★</span></span>
        <span className="ktm-txt-2">{av.total_avaliacoes} avaliações</span>
      </div>

      {totalComent > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="ktm-split">
            <i style={{ width: `${(pos / totalComent) * 100}%`, background: 'var(--verde)' }} />
            <i style={{ width: `${(neg / totalComent) * 100}%`, background: 'var(--vermelho)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span className="ktm-txt-3" style={{ color: 'var(--verde)' }}>{pos} positivo{pos === 1 ? '' : 's'}</span>
            <span className="ktm-txt-3" style={{ color: 'var(--vermelho)' }}>{neg} negativo{neg === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {estrelas.map((e, i) => (
          <div key={e.n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ktm-txt-3" style={{ width: 18 }}>{e.n}★</span>
            <div className="ktm-barra">
              <i style={{ width: `${(e.v / maxEstrela) * 100}%`, background: 'var(--ambar)', animationDelay: `${i * 70}ms` }} />
            </div>
            <span className="ktm-txt-3" style={{ width: 20, textAlign: 'right' }}>{e.v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Leitura rápida ──────────────────────────────────────────────────────────

/** Veredito de risco de 90 dias + Índice de Prioridade, com os sinais abertos.
 *  Mesmas contas da tela do Comercial e da fila do Acompanhamento — a extensão
 *  importa `diagnosticar`/`calcularPrioridade` do app em vez de recalcular. */
function LeituraRapida({ conf, prio }: { conf: ConfiabilidadeResumo | null; prio: PrioridadeResumo }) {
  const [aberto, setAberto] = useState(false)
  const meta = conf ? VEREDITO_META[conf.veredito] : null
  const nivel = NIVEL_PRIORIDADE_META[prio.nivel] ?? NIVEL_PRIORIDADE_META.baixa
  const sinais = conf ? [...conf.alertas, ...conf.positivos] : []

  return (
    <Cartao rotulo="Leitura rápida" style={atraso(0)} acessorio={
      <div className="ktm-chips" style={{ justifyContent: 'flex-end' }}>
        {meta && <Selo tom={meta.tom} titulo={`Risco operacional dos últimos 90 dias · ${conf!.pontos} ponto(s)`}>{meta.label}</Selo>}
        <Selo tom={nivel.tom} titulo={`Índice de Prioridade: ${prio.valor}`}>{nivel.label}</Selo>
      </div>
    }>
      {sinais.length > 0 ? (
        <>
          <button className="ktm-linkbtn" onClick={() => setAberto(v => !v)}>
            {aberto ? '↑ Esconder os sinais' : `↓ Ver os ${sinais.length} sinais que formam o veredito`}
          </button>
          {aberto && (
            <ul className="ktm-lista ktm-lista--esp" style={{ marginTop: 10 }}>
              {sinais.map((s, i) => (
                <li key={i} className="ktm-entra"
                    style={{ ...atraso(i * 50), display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{
                    marginTop: 6, width: 5, height: 5, borderRadius: 999, flexShrink: 0,
                    background: `var(--${TOM_SINAL[s.tom] ?? 'ambar'})`,
                  }} />
                  <span className="ktm-txt">
                    {s.titulo}
                    {s.detalhe && <span className="ktm-txt-2"> · {s.detalhe}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="ktm-txt-2">Nenhum sinal de risco nos últimos 90 dias.</p>
      )}
    </Cartao>
  )
}

// ─── Situação ────────────────────────────────────────────────────────────────

function LinhaSituacao({ titulo, chip, tom, detalhe, atrasoMs = 0 }: {
  titulo: string; chip?: string; tom?: Tom; detalhe?: React.ReactNode; atrasoMs?: number
}) {
  return (
    <li className="ktm-entra" style={{ ...atraso(atrasoMs), display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 550 }}>{titulo}</span>
        {chip && <Selo tom={tom}>{chip}</Selo>}
      </div>
      {detalhe && <span className="ktm-txt-2" style={{ fontSize: 11.5 }}>{detalhe}</span>}
    </li>
  )
}

/** Quantos itens da Situação exigem atenção — alimenta o selo da aba. */
function contarSituacao(s: SituacaoResumo): number {
  const pausa = s.pausa && !s.pausa.encerrada_em && (s.pausa.status !== 'concluida' || s.pausa.ativada_em) ? 1 : 0
  const transf = s.transferencias.filter(t => t.status === 'pendente' || t.status === 'em_atendimento').length
  return pausa + transf + s.convocacoes.length + s.tarefas.length + (s.silencio ? 1 : 0)
}

function SituacaoAba({ s }: { s: SituacaoResumo }) {
  // Pausa que ainda pesa: não foi encerrada e ou está na fila, ou já entrou em vigor.
  const pausa = s.pausa && !s.pausa.encerrada_em
    && (s.pausa.status !== 'concluida' || s.pausa.ativada_em) ? s.pausa : null
  const transf = s.transferencias.filter(t => t.status === 'pendente' || t.status === 'em_atendimento')
  const diasOnboarding = s.onboarding?.dias?.filter(Boolean).length ?? 0

  const nada = !pausa && !transf.length && !s.convocacoes.length && !s.tarefas.length
    && !s.silencio && !s.onboarding && !s.welcomePath && !s.contatoHoje && !s.ultimoEmail

  if (nada) return <p className="ktm-vazio ktm-entra">Nada em aberto sobre este professor.<br />Sem pausa, transferência, convocação ou tarefa.</p>

  let i = 0
  const passo = () => (i++) * 45

  return (
    <>
      {(pausa || transf.length > 0 || s.convocacoes.length > 0 || s.tarefas.length > 0 || s.silencio) && (
        <Cartao rotulo="Em aberto" style={atraso(0)}>
          <ul className="ktm-lista ktm-lista--esp">
            {pausa && (
              <LinhaSituacao
                titulo="Pausa" atrasoMs={passo()}
                chip={STATUS_FILA_LABEL[pausa.status] ?? pausa.status}
                tom={STATUS_FILA_TOM[pausa.status]}
                detalhe={<>
                  Para em {formatarData(pausa.data_inicio)} · contato em {formatarData(pausa.data_fim)}
                  {pausa.motivo && <> · {pausa.motivo}</>}
                </>}
              />
            )}

            {transf.length > 0 && (
              <LinhaSituacao
                titulo="Transferência de aluno" atrasoMs={passo()}
                chip={`${transf.length} em aberto`} tom="ambar"
                detalhe={transf.slice(0, 3).map(t => (
                  <span key={t.id} style={{ display: 'block' }}>
                    {t.aluno_nome} · {t.motivo}
                    {t.urgencia === 'alta' && <strong style={{ color: 'var(--vermelho)' }}> · urgente</strong>}
                    {t.data_ultima_aula && <> · última aula {formatarData(t.data_ultima_aula)}</>}
                  </span>
                ))}
              />
            )}

            {s.convocacoes.map(c => (
              <LinhaSituacao
                key={c.id} titulo="Convocação" atrasoMs={passo()}
                chip={ETAPA_CONVOCACAO_LABEL[c.etapa] ?? c.etapa}
                tom={c.etapa === 'pendente_contato' ? 'vermelho' : 'ambar'}
                detalhe={<>
                  {c.motivo ?? `Origem: ${c.origem}`}
                  {c.ultima_mensagem_em && <> · última mensagem {formatarData(c.ultima_mensagem_em)}</>}
                </>}
              />
            ))}

            {s.tarefas.length > 0 && (
              <LinhaSituacao
                titulo="Tarefas abertas" atrasoMs={passo()}
                chip={String(s.tarefas.length)} tom="ambar"
                detalhe={s.tarefas.slice(0, 3).map(t => (
                  <span key={t.id} style={{ display: 'block' }}>
                    {t.titulo}{t.atribuido_time ? ` · ${t.atribuido_time}` : ''}
                  </span>
                ))}
              />
            )}

            {s.silencio && (
              <LinhaSituacao
                titulo="Silêncio (pendências)" atrasoMs={passo()}
                chip={SILENCIO_LABEL[s.silencio.status] ?? s.silencio.status}
                tom={s.silencio.status === 'alerta' ? 'ambar' : 'vermelho'}
                detalhe={<>
                  {s.silencio.dias_pendente != null && <>{s.silencio.dias_pendente} dia(s) sem lançar</>}
                  {s.silencio.aulas_pendentes != null && <> · {s.silencio.aulas_pendentes} aula(s)</>}
                  {s.silencio.qtd_alunos != null && <> · {s.silencio.qtd_alunos} aluno(s)</>}
                  {s.silencio.precisa_mes_analise && <strong style={{ color: 'var(--vermelho)' }}> · pede Mês de Análise</strong>}
                </>}
              />
            )}
          </ul>
        </Cartao>
      )}

      {(s.onboarding || s.welcomePath || s.contatoHoje || s.ultimoEmail) && (
        <Cartao rotulo="Trajetória e contato" style={atraso(90)}>
          <ul className="ktm-lista ktm-lista--esp">
            {s.onboarding && (
              <LinhaSituacao
                titulo="Onboarding (primeiros dias)" atrasoMs={passo()}
                chip={`${diasOnboarding}/7 dias`} tom={diasOnboarding >= 7 ? 'verde' : 'azul'}
                detalhe={<>
                  {s.onboarding.data_inicio && <>Início {formatarData(s.onboarding.data_inicio)}</>}
                  {s.onboarding.tag_texto && <> · {s.onboarding.tag_texto}</>}
                  {s.onboarding.observacao && <> · {s.onboarding.observacao}</>}
                </>}
              />
            )}

            {s.welcomePath && s.welcomePath.total > 0 && (
              <LinhaSituacao
                titulo="Trilha de boas-vindas" atrasoMs={passo()}
                chip={`${s.welcomePath.concluidas}/${s.welcomePath.total} etapas`}
                tom={s.welcomePath.concluidas >= s.welcomePath.total ? 'verde' : 'azul'}
                detalhe={<>
                  {s.welcomePath.revisaoPendente > 0 && <strong>{s.welcomePath.revisaoPendente} etapa(s) esperando revisão</strong>}
                  {s.welcomePath.ultimaConclusao && <> · última em {formatarData(s.welcomePath.ultimaConclusao)}</>}
                </>}
              />
            )}

            {s.contatoHoje && (
              <LinhaSituacao
                titulo="Mensagens do dia" atrasoMs={passo()}
                chip={s.contatoHoje.enviado ? 'Já contatado hoje' : 'Na lista de hoje'}
                tom={s.contatoHoje.enviado ? 'verde' : 'azul'}
              />
            )}

            {s.ultimoEmail && (
              <LinhaSituacao
                titulo="Último e-mail do sistema" atrasoMs={passo()}
                chip={formatarData(s.ultimoEmail.created_at) ?? undefined}
                tom={s.ultimoEmail.sucesso ? 'neutro' : 'vermelho'}
                detalhe={<>
                  {s.ultimoEmail.assunto}
                  {!s.ultimoEmail.sucesso && <strong style={{ color: 'var(--vermelho)' }}> · falhou no envio</strong>}
                </>}
              />
            )}
          </ul>
        </Cartao>
      )}
    </>
  )
}

// ─── Ranking da reunião em grupo ─────────────────────────────────────────────

const NIVEL_RANK_META: Record<string, { label: string; tom: Tom; cor: string }> = {
  destaque: { label: 'Destaque', tom: 'verde',    cor: 'var(--verde)' },
  regular:  { label: 'Regular',  tom: 'azul',     cor: 'var(--azul)' },
  atencao:  { label: 'Atenção',  tom: 'vermelho', cor: 'var(--vermelho)' },
}

/** Uma linha do ranking. Clicar abre o dossiê completo daquele professor. */
function LinhaRanking({ item, ultimo, aoAbrir, atrasoMs }: {
  item: ItemRankingGrupo; ultimo: boolean; aoAbrir: () => void; atrasoMs: number
}) {
  const [aberto, setAberto] = useState(false)
  const meta = NIVEL_RANK_META[item.nivel] ?? NIVEL_RANK_META.regular
  const classePodio = item.posicao <= 3 ? ` ktm-rank--${item.posicao}` : ultimo ? ' ktm-rank--ultimo' : ''

  return (
    <li className="ktm-entra" style={atraso(atrasoMs)}>
      <div className={`ktm-rank${classePodio}`} onClick={aoAbrir} role="button" tabIndex={0}
           onKeyDown={e => { if (e.key === 'Enter') aoAbrir() }}
           title="Abrir o dossiê deste professor">
        <div className="ktm-rank-topo">
          <span className="ktm-rank-pos">{item.posicao}</span>
          <span className="ktm-rank-nome">{item.nome}</span>
          <span className="ktm-rank-pts" style={{ color: meta.cor }}>{item.pontos}</span>
        </div>

        <div className="ktm-rank-barra">
          <i style={{ width: `${item.pontos}%`, background: meta.cor, animationDelay: `${atrasoMs}ms` }} />
        </div>

        <div className="ktm-rank-metricas">
          <span>Score <b>{item.score ?? '—'}</b></span>
          <span><b>{item.incidentes}</b> incidente(s)</span>
          <span><b>{item.feedbacksPositivos}</b> positivo(s)</span>
          {item.feedbacksNegativos > 0 && (
            <span style={{ color: 'var(--vermelho)' }}><b>{item.feedbacksNegativos}</b> negativo(s)</span>
          )}
          {item.origem === 'chamada' && (
            <span title={item.confianca != null ? `Reconhecido pelo nome na chamada (${Math.round(item.confianca * 100)}%)` : 'Reconhecido na chamada'}>
              fora da agenda
            </span>
          )}
        </div>
      </div>

      <button className="ktm-linkbtn" style={{ margin: '5px 0 0 10px' }} onClick={() => setAberto(v => !v)}>
        {aberto ? 'Esconder a conta' : 'Por que esta posição?'}
      </button>
      {aberto && (
        <div style={{ margin: '5px 0 0 10px', paddingLeft: 9, borderLeft: '1px solid var(--fio)' }}>
          {item.eixos.map(e => (
            <div key={e.chave} className="ktm-eixo">
              <span className="ktm-txt-2">{e.titulo}</span>
              <span className="ktm-eixo-n" style={{ color: e.pontos < 0 ? 'var(--vermelho)' : e.pontos > 0 ? 'var(--verde)' : 'var(--ink-3)' }}>
                {e.pontos > 0 ? '+' : ''}{e.pontos}
              </span>
            </div>
          ))}
          {item.semScore && (
            <p className="ktm-txt-3" style={{ marginTop: 5 }}>
              Sem score sincronizado do King — a posição saiu só dos outros eixos.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/** Ranking dos professores da chamada em grupo, do melhor ao pior. */
function GrupoAba({ ranking, carregando, aoAbrir }: {
  ranking: RankingGrupo | null; carregando: boolean; aoAbrir: (id: string) => void
}) {
  if (carregando && !ranking) return <p className="ktm-vazio ktm-entra">Montando o ranking da chamada…</p>
  if (!ranking) return <p className="ktm-vazio ktm-entra">Ranking indisponível.</p>

  if (ranking.itens.length === 0) {
    return (
      <p className="ktm-vazio ktm-entra">
        Nenhum professor da chamada foi reconhecido.
        {ranking.naoIdentificados.length > 0 && <><br />Vistos: {ranking.naoIdentificados.join(', ')}</>}
      </p>
    )
  }

  return (
    <>
      <Cartao rotulo={`Ranking · ${ranking.itens.length} professor(es)`} style={atraso(0)} acessorio={
        <Selo titulo={`Incidentes e feedbacks dos últimos ${ranking.janelaDias} dias`}>{ranking.janelaDias}d</Selo>
      }>
        <p className="ktm-txt-2" style={{ marginBottom: 10 }}>
          Do melhor ao pior por score do King, menos incidentes e mais feedbacks positivos.
          Toque num nome para abrir o dossiê.
        </p>
        <ul className="ktm-lista ktm-lista--esp">
          {ranking.itens.map((item, i) => (
            <LinhaRanking
              key={item.professorId}
              item={item}
              ultimo={i === ranking.itens.length - 1 && ranking.itens.length > 3}
              atrasoMs={i * 45}
              aoAbrir={() => aoAbrir(item.professorId)}
            />
          ))}
        </ul>
      </Cartao>

      {ranking.naoIdentificados.length > 0 && (
        <Cartao rotulo="Na chamada, sem cadastro" style={atraso(120)}
                acessorio={<Selo tom="ambar">{ranking.naoIdentificados.length}</Selo>}>
          <p className="ktm-txt-2" style={{ marginBottom: 7 }}>
            Nomes vistos no Meet que não casaram com nenhum professor ativo — pode ser
            a coordenação, um convidado, ou nome muito diferente do cadastro.
          </p>
          <div className="ktm-chips">
            {ranking.naoIdentificados.map((n, i) => <Selo key={i}>{n}</Selo>)}
          </div>
        </Cartao>
      )}
    </>
  )
}

// ─── Alunos ──────────────────────────────────────────────────────────────────

const ALUNOS_VISIVEIS = 8

function AlunosAba({ alunos, saidas }: { alunos: AlunoVinculado[]; saidas: AlunoSaida[] }) {
  const [todos, setTodos] = useState(false)
  const lista = todos ? alunos : alunos.slice(0, ALUNOS_VISIVEIS)
  const aguardando = alunos.filter(a => a.status_vinculo_codigo === 'aguardando_assinatura_contrato').length
  const pausados = alunos.filter(a => a.status_aluno === 'pausado').length

  return (
    <>
      <div className="ktm-bento ktm-entra" style={atraso(0)}>
        <Fato k="Na carteira" v={alunos.length} />
        <Fato k="Saíram" v={saidas.length} />
        {pausados > 0 && <Fato k="Pausados" v={pausados} />}
        {aguardando > 0 && <Fato k="Sem contrato" v={aguardando} />}
      </div>

      <Cartao rotulo="Carteira" style={atraso(70)} acessorio={
        alunos.length > ALUNOS_VISIVEIS
          ? <button className="ktm-linkbtn" onClick={() => setTodos(v => !v)}>{todos ? 'Ver menos' : `Ver todos (${alunos.length})`}</button>
          : undefined
      }>
        {alunos.length === 0 ? (
          <p className="ktm-txt-2">Nenhum aluno vinculado no roster do King.</p>
        ) : (
          <ul className="ktm-lista">
            {lista.map(a => (
              <li key={a.aluno_id} className="ktm-item">
                <span className="ktm-item-nome">{a.primeiro_nome ?? `Aluno ${a.aluno_id}`}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {a.status_aluno && a.status_aluno !== 'ativo' && (
                    <Selo tom={STATUS_ALUNO_TOM[a.status_aluno] ?? 'neutro'}>{a.status_aluno}</Selo>
                  )}
                  {a.status_vinculo_codigo === 'aguardando_assinatura_contrato' && (
                    <Selo tom="ambar" titulo="Aguardando assinatura de contrato">contrato</Selo>
                  )}
                  {a.data_adicao && <span className="ktm-item-meta" title="Entrou nesta carteira">{formatarData(a.data_adicao)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {saidas.length > 0 && (
        <Cartao rotulo="Saíram desta carteira" style={atraso(140)}
                acessorio={<Selo tom="vermelho">{saidas.length}</Selo>}>
          <ul className="ktm-lista">
            {saidas.map(s => (
              <li key={`${s.aluno_id}-${s.data_saida}`} className="ktm-item">
                <span className="ktm-item-nome">
                  {s.primeiro_nome ?? `Aluno ${s.aluno_id}`}
                  {s.motivo_saida && <span className="ktm-txt-2"> · {s.motivo_saida}</span>}
                </span>
                <span className="ktm-item-meta">
                  {formatarData(s.data_saida)}{s.saiu_da_escola ? ' · saiu da King' : ''}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </>
  )
}

// ─── Painel ──────────────────────────────────────────────────────────────────

type AbaId = 'visao' | 'grupo' | 'situacao' | 'desempenho' | 'alunos' | 'registros'

/** A partir de quantos professores reconhecidos na chamada o painel assume que
 *  é uma reunião em grupo, mesmo sem reunião de grupo agendada no KTM. */
const MIN_PARA_GRUPO = 3

export function Panel() {
  const [sessao, setSessao]         = useState<SessaoArmazenada | null | undefined>(undefined)
  const [colapsado, setColapsado]   = useState(false)
  const [buscando, setBuscando]     = useState(false)
  const [resultado, setResultado]   = useState<ProfessorEncontrado | null>(null)
  const [aba, setAba]               = useState<AbaId>('visao')
  const [buscaManual, setBuscaManual] = useState('')
  const [obsReuniao, setObsReuniao]   = useState('')
  const [salvandoReuniao, setSalvandoReuniao] = useState(false)
  const [anotacaoInterna, setAnotacaoInterna] = useState('')
  const [salvandoAnotacao, setSalvandoAnotacao] = useState(false)
  const [mesAnaliseAberto, setMesAnaliseAberto] = useState(false)
  const [mesAnaliseTexto, setMesAnaliseTexto]   = useState('')
  const [salvandoMesAnalise, setSalvandoMesAnalise] = useState(false)
  const [resolvendoObsId, setResolvendoObsId] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [sugestoes, setSugestoes] = useState<SugestaoProfessor[]>([])
  // Liberar agenda (desbloqueio direto da pendência)
  const [liberandoAgenda, setLiberandoAgenda] = useState(false)
  const [confirmLiberar, setConfirmLiberar] = useState(false)
  const [erroLiberar, setErroLiberar] = useState<string | null>(null)
  // Registro de incidente (única ação de escrita fora da reunião)
  const [incAberto, setIncAberto]     = useState(false)
  const [incNatureza, setIncNatureza] = useState<'informe' | 'desafio'>('desafio')
  const [incTipo, setIncTipo]         = useState<string>(CATEGORIAS_INCIDENTE[0])
  const [incUrgencia, setIncUrgencia] = useState<string>('Média')
  const [incAluno, setIncAluno]       = useState('')
  const [incTexto, setIncTexto]       = useState('')
  const [salvandoInc, setSalvandoInc] = useState(false)
  // Reunião em grupo: quem está na chamada e o ranking deles.
  const [participantesMeet, setParticipantesMeet] = useState<{ nomes: string[]; emails: string[] }>({ nomes: [], emails: [] })
  const [ranking, setRanking] = useState<RankingGrupo | null>(null)
  const [carregandoRanking, setCarregandoRanking] = useState(false)
  const ultimosCandidatos = useRef<string>('')
  const ultimaChaveRanking = useRef<string>('')
  const corpoRef = useRef<HTMLDivElement>(null)
  const abasRef = useRef<HTMLElement>(null)
  const abaGrupoJaAberta = useRef(false)

  // Reunião em grupo detectada por duas vias: a agenda do KTM (reunião com mais
  // de um participante) ou a própria chamada, quando vários professores são
  // reconhecidos entre os participantes do Meet.
  const reuniaoGrupoId = resultado?.reuniaoHoje?.tipo_reuniao === 'grupo'
    ? resultado.reuniaoHoje.reuniao_id
    : undefined
  const ehGrupo = !!reuniaoGrupoId || participantesMeet.nomes.length >= MIN_PARA_GRUPO

  useEffect(() => {
    if (!sessao || !ehGrupo) { setRanking(null); ultimaChaveRanking.current = ''; return }
    const chave = `${reuniaoGrupoId ?? ''}#${participantesMeet.nomes.join('|')}`
    if (chave === ultimaChaveRanking.current) return
    ultimaChaveRanking.current = chave

    let vivo = true
    setCarregandoRanking(true)
    enviar({
      tipo: 'RANKEAR_GRUPO',
      nomes: participantesMeet.nomes,
      emails: participantesMeet.emails,
      reuniaoId: reuniaoGrupoId,
    })
      .then(r => { if (vivo && r.ok && 'ranking' in r) setRanking(r.ranking) })
      .finally(() => { if (vivo) setCarregandoRanking(false) })
    return () => { vivo = false }
  }, [sessao, ehGrupo, reuniaoGrupoId, participantesMeet])

  // A fileira de abas só ganha a máscara de desvanecer se de fato transbordar,
  // e a aba ativa é trazida pra vista quando muda (com 6 abas ela pode ficar fora).
  useEffect(() => {
    const el = abasRef.current
    if (!el) return
    // Só vale desvanecer quando sobra mais que uns poucos pixels — com 4px de
    // estouro a máscara apagaria a última aba sem motivo.
    el.classList.toggle('ktm-abas--rola', el.scrollWidth > el.clientWidth + 12)
    el.querySelector('.ktm-aba--on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [aba, ehGrupo, resultado?.professor.id])

  // Numa reunião em grupo o ranking é o que o coordenador foi ver — abre nele.
  // Só uma vez por reunião: se ele voltar pra Visão, a escolha dele fica.
  useEffect(() => {
    if (!ranking || ranking.itens.length < 2 || abaGrupoJaAberta.current) return
    abaGrupoJaAberta.current = true
    setAba('grupo')
  }, [ranking])

  // A aba Grupo some quando a chamada deixa de ser em grupo — sem isso o painel
  // ficaria preso num conteúdo que não tem mais aba para voltar.
  useEffect(() => { if (!ehGrupo && aba === 'grupo') setAba('visao') }, [ehGrupo, aba])

  // Trocar de aba sempre começa do topo — o Chrome tenta "ancorar" a rolagem
  // quando a altura do conteúdo muda e deixava o primeiro cartão meio cortado.
  useEffect(() => { corpoRef.current?.scrollTo({ top: 0 }) }, [aba, resultado?.professor.id])

  useEffect(() => {
    enviar({ tipo: 'OBTER_SESSAO' }).then(r => setSessao(r.ok && 'sessao' in r ? r.sessao : null))
  }, [])

  // Busca automática: reavalia os participantes a cada poucos segundos.
  useEffect(() => {
    if (!sessao) return

    async function checar() {
      const candidatos = extrairCandidatos()
      const emails = extrairEmailsParticipantes()
      // E-mail primeiro (identificação inequívoca), nome como fallback — a chave
      // do dedupe inclui os dois pra reavaliar quando qualquer um deles mudar.
      const chave = `${candidatos.join('|')}#${emails.join('|')}`
      if ((!candidatos.length && !emails.length) || chave === ultimosCandidatos.current) return
      ultimosCandidatos.current = chave
      setParticipantesMeet({ nomes: candidatos, emails })

      setBuscando(true)
      const r = await enviar({ tipo: 'BUSCAR_PROFESSOR', nomes: candidatos, emails })
      setBuscando(false)
      if (r.ok && 'resultado' in r && r.resultado) setResultado(r.resultado)
    }

    checar()
    const intervalo = setInterval(checar, 4000)
    return () => clearInterval(intervalo)
  }, [sessao])

  // Só reseta os rascunhos quando o professor identificado muda — evita apagar
  // texto em digitação a cada refresh automático (a cada 4s).
  useEffect(() => {
    setObsReuniao(resultado?.reuniaoHoje?.observacao ?? '')
    setAnotacaoInterna(resultado?.reuniaoHoje?.anotacaoInterna ?? '')
    setMesAnaliseAberto(false)
    setMesAnaliseTexto('')
    setErroAcao(null)
    setIncAberto(false); setIncTexto(''); setIncAluno('')
    setConfirmLiberar(false); setErroLiberar(null)
    setAba('visao')
    abaGrupoJaAberta.current = false
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

  async function abrirIncidente() {
    if (!resultado || !incTexto.trim()) return
    setSalvandoInc(true); setErroAcao(null)
    const r = await enviar({
      tipo: 'ABRIR_INCIDENTE',
      professorId: resultado.professor.id,
      problemType: incTipo,
      // Informe não tem urgência na web — entra como Baixa e sem prazo.
      urgency: incNatureza === 'informe' ? 'Baixa' : incUrgencia,
      description: incTexto,
      natureza: incNatureza,
      alunoNome: incAluno || null,
      prazoResolucao: incNatureza === 'informe' ? null : prazoSugeridoISO(incUrgencia),
    })
    setSalvandoInc(false)
    if (r.ok && 'resultado' in r && r.resultado) {
      setResultado(r.resultado); setIncAberto(false); setIncTexto(''); setIncAluno('')
    } else if (!r.ok) setErroAcao(r.erro)
  }

  async function liberarAgenda() {
    if (!resultado?.kmsId) return
    // Dois cliques: o primeiro arma a confirmação (evita liberar sem querer).
    if (!confirmLiberar) { setConfirmLiberar(true); setTimeout(() => setConfirmLiberar(false), 4000); return }
    setConfirmLiberar(false)
    setLiberandoAgenda(true); setErroLiberar(null)
    const r = await enviar({ tipo: 'LIBERAR_AGENDA', professorId: resultado.professor.id, idProfessor: resultado.kmsId })
    setLiberandoAgenda(false)
    if (r.ok && 'resultado' in r && r.resultado) setResultado(r.resultado)
    else if (!r.ok) setErroLiberar(r.erro)
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

  async function salvarAnotacaoInterna() {
    const r0 = resultado?.reuniaoHoje
    if (!r0?.reuniao_id) return
    setSalvandoAnotacao(true); setErroAcao(null)
    const r = await enviar({
      tipo: 'SALVAR_ANOTACAO_INTERNA',
      reuniaoId: r0.reuniao_id,
      participanteId: r0.participanteId,
      texto: anotacaoInterna,
    })
    setSalvandoAnotacao(false)
    if (r.ok && 'reuniaoHoje' in r) atualizarReuniaoHoje(r)
    else if (!r.ok) setErroAcao(r.erro)
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
    setSalvandoMesAnalise(true); setErroAcao(null)
    const r = await enviar({ tipo: 'COLOCAR_MES_ANALISE', professorId: resultado.professor.id, descricao: mesAnaliseTexto })
    setSalvandoMesAnalise(false)
    if (r.ok && 'resultado' in r && r.resultado) {
      setResultado(r.resultado); setMesAnaliseAberto(false); setMesAnaliseTexto('')
    } else if (!r.ok) setErroAcao(r.erro)
  }

  async function confirmarResolverMesAnalise() {
    if (!resultado?.mesAnalise || !mesAnaliseTexto.trim()) return
    setSalvandoMesAnalise(true); setErroAcao(null)
    const r = await enviar({
      tipo: 'RESOLVER_MES_ANALISE',
      professorId: resultado.professor.id,
      incidentId: resultado.mesAnalise.id,
      resultado: mesAnaliseTexto,
    })
    setSalvandoMesAnalise(false)
    if (r.ok && 'resultado' in r && r.resultado) {
      setResultado(r.resultado); setMesAnaliseAberto(false); setMesAnaliseTexto('')
    } else if (!r.ok) setErroAcao(r.erro)
  }

  async function alternarResolvidoObservacao(id: string, resolvidoAtual: boolean) {
    if (!resultado) return
    setResolvendoObsId(id); setErroAcao(null)
    const r = await enviar({ tipo: 'RESOLVER_OBSERVACAO', professorId: resultado.professor.id, id, resolvido: !resolvidoAtual })
    setResolvendoObsId(null)
    if (r.ok && 'resultado' in r && r.resultado) setResultado(r.resultado)
    else if (!r.ok) setErroAcao(r.erro)
  }

  if (sessao === undefined) return null // ainda carregando, evita flash

  if (colapsado) {
    return (
      <button className="ktm ktm-fab" onClick={() => setColapsado(false)} aria-label="Abrir o painel">
        <span className="ktm-selo" style={{ width: 26, height: 26, fontSize: 12 }}>K</span>
      </button>
    )
  }

  const p = resultado?.professor
  const abas: { id: AbaId; label: string; n?: number; alerta?: boolean }[] = resultado ? [
    { id: 'visao',      label: 'Visão' },
    ...(ehGrupo ? [{ id: 'grupo' as AbaId, label: 'Grupo', n: ranking?.itens.length }] : []),
    { id: 'situacao',   label: 'Situação',   n: contarSituacao(resultado.situacao), alerta: contarSituacao(resultado.situacao) > 0 },
    { id: 'desempenho', label: 'Números' },
    { id: 'alunos',     label: 'Alunos',     n: resultado.alunosTotal },
    {
      id: 'registros', label: 'Registros',
      n: resultado.nexus.ocorrenciasAbertasTotal + resultado.observacoesAbertasTotal,
      alerta: resultado.nexus.ocorrenciasAbertasTotal + resultado.observacoesAbertasTotal > 0,
    },
  ] : []

  return (
    <div className="ktm">
      <div className="ktm-nucleo">
        <header className="ktm-topo">
          <div className="ktm-marca">
            <span className="ktm-selo">K</span>
            <span className="ktm-marca-txt">TeacherTrack</span>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {resultado && (
              <button className="ktm-icone-btn" onClick={() => { setResultado(null); setSugestoes([]) }}
                      title="Buscar outro professor" aria-label="Buscar outro professor">⌕</button>
            )}
            <button className="ktm-icone-btn" onClick={() => setColapsado(true)} title="Minimizar" aria-label="Minimizar">–</button>
          </div>
        </header>

        {/* Identidade fixa: o nome e os contatos ficam a um clique em qualquer aba. */}
        {p && (
          <div className="ktm-id">
            <div className="ktm-id-nome">
              <span className="ktm-nome" title={p.nome}>{p.nome}</span>
              <CopiarNome nome={p.nome} />
              {resultado!.confianca != null && (
                <Selo tom={resultado!.confianca! >= 0.8 ? 'verde' : resultado!.confianca! >= 0.6 ? 'azul' : 'ambar'}
                      titulo="Confiança do reconhecimento automático pelo nome">
                  {Math.round(resultado!.confianca! * 100)}%
                </Selo>
              )}
            </div>
            <div className="ktm-contatos">
              {p.email && <Copiavel valor={p.email} titulo="o e-mail" />}
              {p.telefone && (
                <Copiavel valor={p.telefone} titulo="o telefone" extra={
                  whatsappLink(p.telefone) && (
                    <a className="ktm-wpp" href={whatsappLink(p.telefone)!} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                  )
                } />
              )}
            </div>
          </div>
        )}

        {resultado && (
          <nav className="ktm-abas" ref={abasRef}>
            {abas.map(a => (
              <button key={a.id} className={`ktm-aba${aba === a.id ? ' ktm-aba--on' : ''}`} onClick={() => setAba(a.id)}>
                {a.label}
                {!!a.n && <span className={`ktm-aba-n${a.alerta ? ' ktm-aba-n--alerta' : ''}`}>{a.n}</span>}
              </button>
            ))}
          </nav>
        )}

        <div className="ktm-corpo" ref={corpoRef} key={resultado ? `${resultado.professor.id}-${aba}` : 'busca'}>
          {!sessao ? (
            <p className="ktm-vazio ktm-entra">
              Faça login no ícone da extensão, na barra do navegador,<br />para ver o perfil do professor aqui.
            </p>
          ) : !resultado ? (
            <>
              <p className="ktm-txt-2 ktm-entra">
                {buscando ? 'Procurando professor…' : 'Nenhum professor reconhecido automaticamente ainda.'}
              </p>
              <form onSubmit={buscarManual} style={{ display: 'flex', gap: 6 }} className="ktm-entra" >
                <input className="ktm-campo" value={buscaManual} onChange={e => setBuscaManual(e.target.value)} placeholder="Buscar pelo nome…" />
                <button type="submit" className="ktm-btn ktm-btn--principal" style={{ flexShrink: 0 }}>
                  Buscar<span className="ktm-btn-icone"><IconeSeta /></span>
                </button>
              </form>
              <p className="ktm-txt-3">Busca só entre professores ativos.</p>

              {sugestoes.length > 0 && (
                <Cartao rotulo="Correspondências mais próximas" style={atraso(60)}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {sugestoes.map((s, i) => (
                      <button key={s.id} className="ktm-sugestao ktm-entra" style={atraso(80 + i * 45)} onClick={() => carregarProfessor(s.id)}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nome}</span>
                        <Selo tom={s.score >= 0.8 ? 'verde' : s.score >= 0.6 ? 'azul' : 'neutro'}>{Math.round(s.score * 100)}%</Selo>
                      </button>
                    ))}
                  </div>
                </Cartao>
              )}
            </>
          ) : aba === 'visao' ? (
            <>
              <LeituraRapida conf={resultado.confiabilidade} prio={resultado.prioridade} />

              {resultado.pendencia && (
                <Cartao rotulo="Pendência de lançamento" style={atraso(60)} acessorio={
                  resultado.pendencia.agendaBloqueada
                    ? <Selo tom="vermelho">Agenda bloqueada</Selo>
                    : <Selo tom="ambar">Estágio {resultado.pendencia.estagio}</Selo>
                }>
                  <p className="ktm-txt">
                    <strong>{resultado.pendencia.aulasPendentes}</strong> aula(s) pendente(s) ·{' '}
                    <strong>{resultado.pendencia.dias}</strong> dia(s) sem lançar
                    {resultado.pendencia.qtdAlunos != null && <> · {resultado.pendencia.qtdAlunos} aluno(s)</>}
                  </p>
                  {resultado.pendencia.agendaBloqueada
                    && (resultado.pendencia.estagio === 3 || resultado.pendencia.liberacaoManualExigida)
                    && resultado.kmsId != null ? (
                    <button onClick={liberarAgenda} disabled={liberandoAgenda}
                            className={`ktm-btn ktm-btn--bloco ${confirmLiberar ? 'ktm-btn--perigo' : ''}`} style={{ marginTop: 10 }}>
                      {liberandoAgenda ? 'Liberando…' : confirmLiberar ? 'Confirmar liberação?' : 'Liberar agenda'}
                    </button>
                  ) : resultado.pendencia.agendaBloqueada ? (
                    <p className="ktm-txt-3" style={{ marginTop: 8 }}>O desbloqueio manual fica disponível no estágio final (5+ dias).</p>
                  ) : null}
                  {erroLiberar && <p className="ktm-erro">{erroLiberar}</p>}
                </Cartao>
              )}

              <Cartao rotulo="Reunião de hoje" style={atraso(120)} acessorio={
                resultado.reuniaoHoje && (
                  <Selo tom={REUNIAO_STATUS_TOM[resultado.reuniaoHoje.status] ?? 'neutro'}>
                    {REUNIAO_STATUS_LABEL[resultado.reuniaoHoje.status] ?? resultado.reuniaoHoje.status}
                    {resultado.reuniaoHoje.numero ? ` · ${resultado.reuniaoHoje.numero}º` : ''}
                  </Selo>
                )
              }>
                {!resultado.reuniaoHoje ? (
                  <>
                    <p className="ktm-txt-2">Nenhuma reunião de hoje registrada para este professor.</p>
                    <button onClick={criarReuniaoAgora} disabled={salvandoReuniao} className="ktm-btn ktm-btn--principal ktm-btn--bloco" style={{ marginTop: 10 }}>
                      {salvandoReuniao ? 'Criando…' : 'Registrar reunião agora'}
                      <span className="ktm-btn-icone"><IconeMais /></span>
                    </button>
                  </>
                ) : resultado.reuniaoHoje.status === 'pendente' ? (
                  resultado.reuniaoHoje.tipo_reuniao === 'grupo' && resultado.reuniaoHoje.participantes ? (
                    <GrupoParticipantes
                      participantes={resultado.reuniaoHoje.participantes}
                      observacaoComum={resultado.reuniaoHoje.observacao}
                      onSalvar={async (presentesIds, obs) => {
                        setSalvandoReuniao(true)
                        try {
                          if (!resultado.reuniaoHoje!.reuniao_id) throw new Error('Reunião de grupo sem ID')
                          const r = await enviar({
                            tipo: 'CONFIRMAR_GRUPO',
                            reuniaoId: resultado.reuniaoHoje!.reuniao_id,
                            presentesIds, observacao: obs,
                            professorId: resultado.professor.id,
                          })
                          if (r.ok && 'resultado' in r) {
                            setResultado(r.resultado)
                            // Recarrega o resultado após confirmar
                            const r2 = await enviar({ tipo: 'BUSCAR_PROFESSOR', nomes: [], emails: [resultado.professor.email ?? ''] })
                            if (r2.ok && 'resultado' in r2) setResultado(r2.resultado)
                          }
                        } finally {
                          setSalvandoReuniao(false)
                        }
                      }}
                    />
                  ) : (
                    <>
                      <textarea className="ktm-area" value={obsReuniao} onChange={e => setObsReuniao(e.target.value)}
                                placeholder="Observações da reunião…" />
                      <div className="ktm-acoes">
                        <button onClick={() => confirmarReuniao(true)} disabled={salvandoReuniao} className="ktm-btn ktm-btn--ok">Realizada</button>
                        <button onClick={() => confirmarReuniao(false)} disabled={salvandoReuniao} className="ktm-btn">Não aconteceu</button>
                      </div>
                    </>
                  )
                ) : (
                  <>
                    <textarea className="ktm-area" value={obsReuniao} onChange={e => setObsReuniao(e.target.value)}
                              placeholder="Observações da reunião…" />
                    <button onClick={salvarObservacaoReuniao} className="ktm-linkbtn" style={{ marginTop: 8 }}
                            disabled={salvandoReuniao || obsReuniao === (resultado.reuniaoHoje.observacao ?? '')}>
                      {salvandoReuniao ? 'Salvando…' : 'Salvar observação'}
                    </button>
                  </>
                )}

                {/* Anotação privada: só o autor lê (RLS dono-apenas), aparece na Minha Área. */}
                {resultado.reuniaoHoje?.reuniao_id && (
                  <div style={{ marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--fio)' }}>
                    <div className="ktm-cartao-topo">
                      <span className="ktm-rotulo">Anotação privada</span>
                      <span className="ktm-txt-3">só você lê</span>
                    </div>
                    <textarea className="ktm-area" value={anotacaoInterna} onChange={e => setAnotacaoInterna(e.target.value)}
                              placeholder="Anotações suas sobre esta reunião…" />
                    <button onClick={salvarAnotacaoInterna} className="ktm-linkbtn" style={{ marginTop: 8 }}
                            disabled={salvandoAnotacao || anotacaoInterna === (resultado.reuniaoHoje.anotacaoInterna ?? '')}>
                      {salvandoAnotacao ? 'Salvando…' : 'Salvar anotação'}
                    </button>
                  </div>
                )}
                {erroAcao && <p className="ktm-erro">{erroAcao}</p>}
              </Cartao>

              {/* Ficha: o que antes era uma fileira de selos soltos virou grade legível. */}
              <div className="ktm-bento ktm-entra" style={atraso(180)}>
                <Fato k="Grupo" v={p!.grupo?.nome ?? '—'} />
                <Fato k="Coordenação" v={p!.coordenador_nome ?? '—'} />
                <Fato k="Tempo de casa" v={tempoDeCasaLabel(p!.data_inicio) ?? '—'} />
                <Fato k="Desde" v={formatarData(p!.data_inicio) ?? '—'} />
                {(p!.cidade || p!.estado) && <Fato k="Onde" v={[p!.cidade, p!.estado].filter(Boolean).join(' · ')} />}
                {p!.nivel_recomendado_alunos && <Fato k="Nível recomendado" v={p!.nivel_recomendado_alunos} />}
              </div>

              <div className="ktm-chips ktm-entra" style={atraso(220)}>
                <Selo tom={p!.status === 'ativo' ? 'verde' : 'neutro'}>{p!.status === 'ativo' ? 'Ativo' : p!.status}</Selo>
                {resultado.mesAnalise && <Selo tom="vermelho">Em Mês de Análise</Selo>}
                {p!.despausado_em && p!.status !== 'pausa' && (
                  <Selo tom="azul" titulo={`Tirado da pausa em ${formatarData(p!.despausado_em)}`}>Retorno de pausa</Selo>
                )}
                {p!.monitoramento && <Selo>Monitorada</Selo>}
                {p!.dados_atualizados === false && (
                  <Selo tom="ambar" titulo="O professor ainda não confirmou os dados cadastrais no King — telefone e e-mail podem estar desatualizados.">
                    Cadastro não confirmado
                  </Selo>
                )}
              </div>
            </>
          ) : aba === 'grupo' ? (
            <GrupoAba ranking={ranking} carregando={carregandoRanking} aoAbrir={carregarProfessor} />
          ) : aba === 'situacao' ? (
            <SituacaoAba s={resultado.situacao} />
          ) : aba === 'desempenho' ? (
            <>
              {resultado.acompanhamento ? (
                <>
                  <Cartao rotulo="Score" style={atraso(0)} acessorio={
                    resultado.acompanhamento.score_faixa
                      ? <Selo tom={FAIXA_TOM[resultado.acompanhamento.score_faixa] ?? 'neutro'}>{resultado.acompanhamento.score_faixa}</Selo>
                      : undefined
                  }>
                    <div className="ktm-delta">
                      <span className="ktm-numero">{resultado.acompanhamento.score_atual ?? '—'}</span>
                      <span className="ktm-txt-2">
                        {resultado.acompanhamento.elegivel_alocacao ? 'Elegível p/ alocação' : 'Não elegível p/ alocação'}
                      </span>
                    </div>
                    <ScoreGrafico historico={resultado.scoreHistorico} />
                  </Cartao>

                  {(!!resultado.acompanhamento.avaliacao_alunos?.total_avaliacoes || resultado.avaliacaoHistorico.length > 0) && (
                    <Cartao rotulo="Avaliações dos alunos" style={atraso(70)}>
                      {resultado.acompanhamento.avaliacao_alunos?.total_avaliacoes
                        ? <FeedbackGrafico av={resultado.acompanhamento.avaliacao_alunos} />
                        : null}
                      <AvaliacaoGrafico historico={resultado.avaliacaoHistorico} />
                    </Cartao>
                  )}

                  <Cartao rotulo="Sinais do King" style={atraso(140)}>
                    {(resultado.acompanhamento.reuniao_status || resultado.acompanhamento.reuniao_proxima || resultado.acompanhamento.reuniao_ultima) && (
                      <p className="ktm-txt">
                        Monitoramento: <strong>{resultado.acompanhamento.reuniao_status?.replace(/_/g, ' ') ?? '—'}</strong>
                        {formatarData(resultado.acompanhamento.reuniao_ultima) && <span className="ktm-txt-2"> · última {formatarData(resultado.acompanhamento.reuniao_ultima)}</span>}
                        {formatarData(resultado.acompanhamento.reuniao_proxima) && <span className="ktm-txt-2"> · próxima {formatarData(resultado.acompanhamento.reuniao_proxima)}</span>}
                      </p>
                    )}

                    {resultado.acompanhamento.agenda_bloqueada && (
                      <p className="ktm-txt" style={{ color: 'var(--vermelho)', marginTop: 8 }}>
                        <strong>Agenda inteira bloqueada</strong> — fora de operação
                        {resultado.acompanhamento.motivos_bloqueio?.length
                          ? `: ${resultado.acompanhamento.motivos_bloqueio.map(m => `${m.motivo} (${m.quantidade})`).join(' · ')}`
                          : '.'}
                      </p>
                    )}

                    {resultado.acompanhamento.alertas.length > 0 && (
                      <div className="ktm-chips" style={{ marginTop: 10 }}>
                        {resultado.acompanhamento.alertas.map((a, i) => (
                          <Selo key={i} tom="ambar" titulo={a.detalhe}>{a.label}{a.detalhe ? ' ⓘ' : ''}</Selo>
                        ))}
                      </div>
                    )}

                    {formatarData(resultado.acompanhamento.api_atualizado_em) && (
                      <p className="ktm-txt-3" style={{ marginTop: 10 }}>
                        Dados do King atualizados em {formatarData(resultado.acompanhamento.api_atualizado_em)}
                      </p>
                    )}
                  </Cartao>
                </>
              ) : (
                <p className="ktm-vazio ktm-entra">Sem dados de acompanhamento do King para este professor.</p>
              )}

              {/* Fora do ramo acima de propósito: os feedbacks do KTM saem de
                  `observacoes` e existem mesmo sem acompanhamento do King. */}
              <Cartao rotulo="Feedbacks · dois meses" style={atraso(210)}>
                <FeedbacksGrafico j={resultado.feedbacks} />
              </Cartao>
            </>
          ) : aba === 'alunos' ? (
            <AlunosAba alunos={resultado.alunos} saidas={resultado.alunosSaidas} />
          ) : (
            <>
              {/* ── Registros ── */}
              <Cartao rotulo="Registrar incidente" style={atraso(0)} acessorio={
                !incAberto ? <button className="ktm-linkbtn" onClick={() => setIncAberto(true)}>+ Novo</button> : undefined
              }>
                {incAberto ? (
                  <>
                    <div className="ktm-opcoes">
                      {NATUREZAS.map(n => (
                        <button key={n.value} title={n.ajuda} onClick={() => setIncNatureza(n.value)}
                                className={`ktm-opcao${incNatureza === n.value ? ' ktm-opcao--on' : ''}`}>{n.label}</button>
                      ))}
                    </div>
                    <p className="ktm-txt-3" style={{ margin: '7px 0 9px' }}>{NATUREZAS.find(n => n.value === incNatureza)?.ajuda}</p>

                    <select className="ktm-select" value={incTipo} onChange={e => setIncTipo(e.target.value)}>
                      {CATEGORIAS_INCIDENTE.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    {/* Aluno citado — sai direto do roster que o painel já carregou. */}
                    {resultado.alunos.length > 0 && (
                      <select className="ktm-select" style={{ marginTop: 7 }} value={incAluno} onChange={e => setIncAluno(e.target.value)}>
                        <option value="">Sem aluno específico</option>
                        {resultado.alunos.map(a => {
                          const nome = a.primeiro_nome ?? `Aluno ${a.aluno_id}`
                          return <option key={a.aluno_id} value={nome}>{nome}</option>
                        })}
                      </select>
                    )}

                    {incNatureza === 'desafio' && (
                      <>
                        <div className="ktm-opcoes" style={{ margin: '7px 0' }}>
                          {URGENCIAS.map(u => (
                            <button key={u} onClick={() => setIncUrgencia(u)}
                                    className={`ktm-opcao${incUrgencia === u ? ' ktm-opcao--on' : ''}`}>{u}</button>
                          ))}
                        </div>
                        <p className="ktm-txt-3" style={{ marginBottom: 8 }}>Prazo sugerido: {formatarData(prazoSugeridoISO(incUrgencia))}</p>
                      </>
                    )}

                    <textarea className="ktm-area" value={incTexto} onChange={e => setIncTexto(e.target.value)}
                              placeholder={incNatureza === 'informe' ? 'O que aconteceu…' : 'Descreva o chamado…'} />
                    <div className="ktm-acoes">
                      <button onClick={abrirIncidente} disabled={salvandoInc || !incTexto.trim()} className="ktm-btn ktm-btn--ok">
                        {salvandoInc ? 'Salvando…' : incNatureza === 'informe' ? 'Registrar informe' : 'Abrir chamado'}
                      </button>
                      <button onClick={() => { setIncAberto(false); setIncTexto('') }} className="ktm-btn">Cancelar</button>
                    </div>
                  </>
                ) : (
                  <p className="ktm-txt-2">Abre um chamado ou registra um informe sobre este professor, sem sair da chamada.</p>
                )}
                {erroAcao && <p className="ktm-erro">{erroAcao}</p>}
              </Cartao>

              <Cartao rotulo="Mês de Análise" style={atraso(60)}
                      acessorio={resultado.mesAnalise ? <Selo tom="vermelho">Em análise</Selo> : undefined}>
                {resultado.mesAnalise ? (
                  <>
                    <p className="ktm-txt">{resultado.mesAnalise.description}</p>
                    {!mesAnaliseAberto ? (
                      <button className="ktm-linkbtn" style={{ marginTop: 9 }} onClick={() => setMesAnaliseAberto(true)}>Resolver</button>
                    ) : (
                      <>
                        <textarea className="ktm-area" style={{ marginTop: 9 }} value={mesAnaliseTexto}
                                  onChange={e => setMesAnaliseTexto(e.target.value)} placeholder="Resultado do Mês de Análise…" />
                        <div className="ktm-acoes">
                          <button onClick={confirmarResolverMesAnalise} disabled={salvandoMesAnalise || !mesAnaliseTexto.trim()} className="ktm-btn ktm-btn--ok">
                            {salvandoMesAnalise ? 'Salvando…' : 'Confirmar'}
                          </button>
                          <button onClick={() => { setMesAnaliseAberto(false); setMesAnaliseTexto('') }} className="ktm-btn">Cancelar</button>
                        </div>
                      </>
                    )}
                  </>
                ) : !mesAnaliseAberto ? (
                  <button className="ktm-linkbtn" onClick={() => setMesAnaliseAberto(true)}>Colocar em Mês de Análise</button>
                ) : (
                  <>
                    <textarea className="ktm-area" value={mesAnaliseTexto} onChange={e => setMesAnaliseTexto(e.target.value)}
                              placeholder="Descreva o motivo…" />
                    <div className="ktm-acoes">
                      <button onClick={confirmarColocarMesAnalise} disabled={salvandoMesAnalise || !mesAnaliseTexto.trim()} className="ktm-btn ktm-btn--ok">
                        {salvandoMesAnalise ? 'Salvando…' : 'Confirmar'}
                      </button>
                      <button onClick={() => { setMesAnaliseAberto(false); setMesAnaliseTexto('') }} className="ktm-btn">Cancelar</button>
                    </div>
                  </>
                )}
              </Cartao>

              {!!(resultado.nexus.ocorrencias.length || resultado.nexus.tracking || resultado.nexus.alertas.length) && (
                <Cartao rotulo="Ocorrências" style={atraso(120)} acessorio={
                  resultado.nexus.ocorrenciasAbertasTotal > 0
                    ? <Selo tom="vermelho">{resultado.nexus.ocorrenciasAbertasTotal} em aberto</Selo>
                    : undefined
                }>
                  {resultado.nexus.tracking && (
                    <p className="ktm-txt-2" style={{ marginBottom: 9 }}>
                      Escalonamento: <strong>{statusEscalonamento(resultado.nexus.tracking).label}</strong>
                      {resultado.nexus.tracking.recurrence_count > 0 && <> · {resultado.nexus.tracking.recurrence_count} reincidência(s)</>}
                    </p>
                  )}

                  {resultado.nexus.alertas.length > 0 && (
                    <div className="ktm-chips" style={{ marginBottom: 10 }}>
                      {resultado.nexus.alertas.map((a, i) => (
                        <Selo key={i} tom={NIVEL_TOM[a.level] ?? 'neutro'}>{NIVEL_LABEL[a.level] ?? a.level} · {a.total_count}</Selo>
                      ))}
                    </div>
                  )}

                  <ul className="ktm-lista ktm-lista--esp">
                    {resultado.nexus.ocorrencias.slice(0, 3).map((o, i) => (
                      <li key={o.id} className={`ktm-registro ktm-entra ${URGENCIA_CLASSE[o.urgency] ?? ''}`} style={atraso(140 + i * 50)}>
                        <div className="ktm-registro-topo">
                          <span>{o.problem_type}</span>
                          <span>{formatarData(o.created_at)}</span>
                        </div>
                        <p className="ktm-registro-txt">{o.description}</p>
                        <div className="ktm-chips" style={{ marginTop: 6 }}>
                          <Selo tom={o.natureza === 'informe' ? 'neutro' : 'azul'}>{o.natureza === 'informe' ? 'Informe' : 'Chamado'}</Selo>
                          {o.aluno_nome && <Selo>Aluno: {o.aluno_nome}</Selo>}
                          {o.ti_status && <Selo tom="azul">TI</Selo>}
                          {!o.resolved && o.assumido_em && <Selo tom="ambar">Assumido {formatarData(o.assumido_em)}</Selo>}
                          {!o.resolved && o.prazo_resolucao && (
                            <Selo tom={new Date(o.prazo_resolucao) < new Date() ? 'vermelho' : 'neutro'}>
                              {new Date(o.prazo_resolucao) < new Date() ? 'Vencido' : 'Vence'} {formatarData(o.prazo_resolucao)}
                            </Selo>
                          )}
                          {o.resolved && <Selo tom="verde">Resolvido</Selo>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Cartao>
              )}

              <Cartao rotulo="Observações" style={atraso(180)} acessorio={
                resultado.observacoesAbertasTotal > 0
                  ? <Selo tom="vermelho">{resultado.observacoesAbertasTotal} em aberto</Selo>
                  : undefined
              }>
                {resultado.observacoes.length === 0 ? (
                  <p className="ktm-txt-2">Nenhuma observação registrada.</p>
                ) : (
                  <ul className="ktm-lista ktm-lista--esp">
                    {resultado.observacoes.map((o, i) => (
                      <li key={o.id} className="ktm-registro ktm-entra" style={atraso(200 + i * 45)}>
                        <div className="ktm-registro-topo">
                          <span>{TIPO_LABEL[o.tipo] ?? o.tipo}</span>
                          <span>{formatarData(o.created_at)}</span>
                        </div>
                        <p className="ktm-registro-txt">{o.texto}</p>
                        {o.tipo === 'ocorrencia' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7 }}>
                            <Selo tom={o.resolvido ? 'verde' : 'vermelho'}>{o.resolvido ? 'Resolvida' : 'Em aberto'}</Selo>
                            <button className="ktm-linkbtn" disabled={resolvendoObsId === o.id}
                                    onClick={() => alternarResolvidoObservacao(o.id, o.resolvido)}>
                              {resolvendoObsId === o.id ? 'Salvando…' : o.resolvido ? 'Reabrir' : 'Marcar como resolvida'}
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Cartao>

              <Cartao rotulo="Histórico de reuniões" style={atraso(240)}
                      acessorio={<Selo>{resultado.totalReunioesRealizadas} realizada(s)</Selo>}>
                {resultado.historicoReunioes.length === 0 ? (
                  <p className="ktm-txt-2">Nenhuma reunião registrada ainda.</p>
                ) : (
                  <ul className="ktm-lista">
                    {resultado.historicoReunioes.slice(0, 4).map(h => (
                      <li key={h.id} className="ktm-item">
                        <span className="ktm-item-nome">{formatarData(h.data)}{h.numero ? ` · #${h.numero}` : ''}</span>
                        <Selo tom={REUNIAO_STATUS_TOM[h.status] ?? 'neutro'}>{REUNIAO_STATUS_LABEL[h.status] ?? h.status}</Selo>
                      </li>
                    ))}
                  </ul>
                )}
              </Cartao>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function statusEscalonamento(t: { problem_resolved: boolean; forwarded_to_coordination: boolean }): { label: string } {
  if (t.problem_resolved) return { label: 'Resolvido' }
  if (t.forwarded_to_coordination) return { label: 'Encaminhado à coordenação' }
  return { label: 'Em acompanhamento' }
}
