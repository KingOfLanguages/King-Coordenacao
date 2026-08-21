import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  UserCog, Search, Hand, XCircle, CheckCircle2, Link2, Check, AlertTriangle,
  Clock, User, Plus, FileWarning, ChevronDown, ChevronRight, Phone,
  MessageCircle, Users, Zap, MessagesSquare, Handshake, Inbox, CalendarDays,
  Timer, BellRing, ShieldAlert,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useTransferenciasFila, useTransferenciasFinalizadas,
  useAssumirTransferencia, useLargarTransferencia,
  useConcluirTransferencia, useRecusarTransferencia,
  prazoAtendimento, diasDesde, prazoVencido,
  FAIXA_TRANSFERENCIA_META,
  type TransferenciaComProfessor, type FaixaTransferencia, type PrazoAtendimento,
} from '@/hooks/useTransferencias'
import { useProfessoresAtivos } from '@/hooks/useProfessores'
import {
  motivoTransferenciaLabel, motivoEhRelacional, desfechoMeta, tempoDeVinculo,
  diasUteisLabel, PRAZO_DIAS_UTEIS,
  STATUS_TRANSFERENCIA_META, DESFECHOS_TRANSFERENCIA,
  type DesfechoTransferencia,
} from '@/lib/transferenciaLabels'
import { DossieAluno } from '@/components/transferencias/DossieAluno'
import { AlunoId } from '@/components/alunos/AlunoId'
import { normalizarNome } from '@/hooks/useAcompanhamentoAlunos'
import { NovaObservacaoDialog } from '@/components/professores/NovaObservacaoDialog'
import { NovoIncidenteDialog } from '@/components/incidentes/NovoIncidenteDialog'
import { useAuth } from '@/contexts/AuthContext'
import { PORTAL_BASE_URL } from '@/lib/portal'
import { dataBR } from '@/lib/formato'
import { cn, whatsappLink } from '@/lib/utils'
import { toast } from 'sonner'

const ORDEM_FAIXAS: FaixaTransferencia[] = ['atrasada', 'vence_hoje', 'no_prazo']

const FAIXA_ESTILO: Record<FaixaTransferencia, { tone: string; icon: string }> = {
  atrasada:   { tone: 'text-urg-critFg', icon: 'bg-urg-critBg text-urg-critFg' },
  vence_hoje: { tone: 'text-urg-highFg', icon: 'bg-urg-highBg text-urg-highFg' },
  no_prazo:   { tone: 'text-ink-muted',  icon: 'bg-surface-subtle text-ink-muted' },
}

/** "atrasada há 2 dias úteis" / "vence hoje" / "faltam 4 dias úteis" — a frase
 *  que responde, no card, a única pergunta que importa na fila: já estourou? */
function prazoLabel(p: PrazoAtendimento): string {
  if (p.faixa === 'atrasada')   return `atrasada há ${diasUteisLabel(p.atraso)}`
  if (p.faixa === 'vence_hoje') return 'o prazo vence hoje'
  return `faltam ${diasUteisLabel(p.restantes)} de prazo`
}

function resolverPerfil(ref: { nome: string } | { nome: string }[] | null | undefined): string | null {
  const r = Array.isArray(ref) ? ref[0] : ref
  return r?.nome ?? null
}

type Aba = 'fila' | 'historico'

export function TransferenciasPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [aba, setAba] = useState<Aba>('fila')
  const [busca, setBusca] = useState('')

  // Chegada pelo sino: /transferencias?pedido=<id> abre a fila já apontando para
  // o pedido escalado, em vez de largar a liderança na lista inteira.
  const [params, setParams] = useSearchParams()
  const destaque = params.get('pedido')

  const { data: fila = [], isLoading } = useTransferenciasFila()
  const { data: finalizadas = [] } = useTransferenciasFinalizadas()

  const filtrar = (lista: TransferenciaComProfessor[]) => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return lista

    // Busca por ID do aluno: é o que o suporte tem em mãos quando vem do sistema
    // do King, e o único jeito de achar o pedido certo entre homônimos. Aceita
    // com ou sem "#"; só vale quando o termo é mesmo um número.
    const termoId = termo.replace(/^#/, '')
    const buscaPorId = /^\d+$/.test(termoId)

    return lista.filter(t =>
      (t.professor?.nome ?? '').toLowerCase().includes(termo) ||
      t.aluno_nome.toLowerCase().includes(termo) ||
      (buscaPorId && String(t.aluno_id ?? '').includes(termoId)) ||
      (t.professor?.grupo?.nome ?? '').toLowerCase().includes(termo) ||
      (t.professor?.coordenador?.nome ?? '').toLowerCase().includes(termo) ||
      motivoTransferenciaLabel(t.motivo).toLowerCase().includes(termo) ||
      t.detalhe.toLowerCase().includes(termo))
  }

  const filaFiltrada = useMemo(() => filtrar(fila), [fila, busca])
  const historicoFiltrado = useMemo(() => filtrar(finalizadas), [finalizadas, busca])

  // Cada pedido carrega o próprio prazo calculado uma vez, e a fila é ordenada
  // pelo LIMITE (não pela última aula): quem estoura antes aparece antes.
  const comPrazo = useMemo(
    () => filaFiltrada
      .map(t => ({ pedido: t, prazo: prazoAtendimento(t) }))
      .sort((a, b) => a.prazo.limite.localeCompare(b.prazo.limite)),
    [filaFiltrada],
  )

  const porFaixa = useMemo(() => {
    const mapa = new Map<FaixaTransferencia, typeof comPrazo>()
    for (const item of comPrazo) {
      const atual = mapa.get(item.prazo.faixa) ?? []
      atual.push(item)
      mapa.set(item.prazo.faixa, atual)
    }
    return mapa
  }, [comPrazo])

  const atrasadas   = porFaixa.get('atrasada')   ?? []
  const vencemHoje  = porFaixa.get('vence_hoje') ?? []

  // A liderança do setor é quem recebe o escalonamento — para ela o aviso vem
  // endereçado; para o resto do time é informação de fila.
  const ehLideranca = (profile?.role === 'suporte_aluno' && profile?.is_lider === true)
    || profile?.is_admin === true || profile?.role === 'admin'

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Transferências de Aluno</h1>
          <p className="text-[13px] text-ink-muted">
            <span className="tabular-nums text-ink-secondary font-medium">{filaFiltrada.length}</span>{' '}
            {filaFiltrada.length === 1 ? 'pendente' : 'pendentes'}
            {atrasadas.length > 0 && (
              <> · <span className="text-urg-critFg font-medium">{atrasadas.length} atrasada{atrasadas.length > 1 ? 's' : ''}</span></>
            )}
            {vencemHoje.length > 0 && (
              <> · <span className="text-urg-highFg font-medium">{vencemHoje.length} vence{vencemHoje.length > 1 ? 'm' : ''} hoje</span></>
            )}
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <Input
            placeholder="Buscar professor, aluno, #ID, motivo…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-9 bg-surface-canvas border-line"
          />
        </div>
      </header>

      {aba === 'fila' && atrasadas.length > 0 && (
        <AlertaAtraso itens={atrasadas} ehLideranca={ehLideranca} />
      )}

      <CardLinkPublico />

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-line">
        {([
          { key: 'fila' as const,      label: 'Fila',      qtd: filaFiltrada.length },
          { key: 'historico' as const, label: 'Histórico', qtd: historicoFiltrado.length },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setAba(t.key)}
            className={cn(
              'btn-press -mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              aba === t.key
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-muted hover:text-ink-secondary',
            )}
          >
            {t.label}
            <span className="ml-1.5 tabular-nums text-[11.5px] text-ink-muted">{t.qtd}</span>
          </button>
        ))}
      </div>

      {aba === 'fila' ? (
        isLoading ? (
          <div className="flex h-48 items-center justify-center text-[13px] text-ink-muted">Carregando…</div>
        ) : filaFiltrada.length === 0 ? (
          <div className="card-surface p-12 text-center space-y-3">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle text-ink-muted">
              <Inbox className="h-4 w-4" />
            </div>
            <p className="text-[14px] font-medium text-ink">Nenhum pedido na fila</p>
            <p className="text-[13px] text-ink-muted">
              Quando um professor pedir a transferência de um aluno, o pedido aparece aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {ORDEM_FAIXAS.map(faixa => {
              const itens = porFaixa.get(faixa)
              if (!itens || itens.length === 0) return null
              return (
                <SecaoFaixa key={faixa} faixa={faixa} qtd={itens.length}>
                  {itens.map(({ pedido, prazo }) => (
                    <CardPedido
                      key={pedido.id}
                      pedido={pedido}
                      prazo={prazo}
                      destacado={pedido.id === destaque}
                      onLimparDestaque={() => setParams({}, { replace: true })}
                      onVerPerfil={() => pedido.professor && navigate(`/professores/${pedido.professor.id}`)}
                    />
                  ))}
                </SecaoFaixa>
              )
            })}
          </div>
        )
      ) : (
        <HistoricoLista
          itens={historicoFiltrado}
          onVerPerfil={id => navigate(`/professores/${id}`)}
        />
      )}
    </div>
  )
}

// ─── Link público ─────────────────────────────────────────────────────────────

function CardLinkPublico() {
  const [copiado, setCopiado] = useState(false)
  const link = `${PORTAL_BASE_URL}/transferencia`

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      toast.success('Link copiado.')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar o link.')
    }
  }

  return (
    <div className="card-surface p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accentBlue-soft text-accentBlue">
          <Link2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-[13px] font-medium text-ink">Link do formulário de transferência</p>
          <p className="truncate text-[11.5px] text-ink-muted">
            O professor se identifica por e-mail ou nome completo e escolhe o aluno da própria agenda.
          </p>
          <code className="break-all text-[11.5px] text-ink-secondary">{link}</code>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={copiar}
        className="btn-press h-8 shrink-0 gap-1.5 border-line text-[12px] text-ink-secondary hover:text-ink"
      >
        {copiado ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
        {copiado ? 'Copiado' : 'Copiar link'}
      </Button>
    </div>
  )
}

// ─── Alerta de atraso ─────────────────────────────────────────────────────────
// O que a cron `king-transferencia-atraso` manda para o sino da liderança, aqui
// na tela e sempre visível — a notificação avisa uma vez, este bloco é o estoque
// e não some enquanto houver pedido estourado.

function AlertaAtraso({ itens, ehLideranca }: {
  itens: { pedido: TransferenciaComProfessor; prazo: PrazoAtendimento }[]
  ehLideranca: boolean
}) {
  const pior = itens.reduce((a, b) => (b.prazo.atraso > a.prazo.atraso ? b : a))
  const semDono = itens.filter(i => i.pedido.status === 'pendente').length

  return (
    <div className="card-surface border-urg-critFg/40 bg-urg-critBg/30 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-urg-critBg text-urg-critFg">
          <ShieldAlert className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <p className="text-[13px] font-semibold text-urg-critFg">
            {itens.length === 1
              ? '1 transferência passou do prazo de atendimento'
              : `${itens.length} transferências passaram do prazo de atendimento`}
          </p>
          <p className="text-[12px] leading-relaxed text-ink-secondary">
            A mais antiga está atrasada há {diasUteisLabel(pior.prazo.atraso)} ({pior.pedido.aluno_nome}).
            {semDono > 0 && ` ${semDono === 1 ? '1 ainda não foi assumida' : `${semDono} ainda não foram assumidas`} por ninguém.`}
          </p>
          <p className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
            <BellRing className="h-3 w-3" />
            {ehLideranca
              ? 'Você recebe estes casos no sino assim que o prazo estoura.'
              : 'A liderança do Suporte ao Aluno já foi avisada automaticamente.'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Seção por faixa ──────────────────────────────────────────────────────────

function SecaoFaixa({
  faixa, qtd, children,
}: { faixa: FaixaTransferencia; qtd: number; children: React.ReactNode }) {
  const meta = FAIXA_TRANSFERENCIA_META[faixa]
  const estilo = FAIXA_ESTILO[faixa]
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-full', estilo.icon)}>
          {faixa === 'atrasada' ? <AlertTriangle className="h-3.5 w-3.5" />
            : faixa === 'vence_hoje' ? <Timer className="h-3.5 w-3.5" />
            : <Clock className="h-3.5 w-3.5" />}
        </span>
        <h2 className={cn('label-micro', estilo.tone)}>{meta.label} ({qtd})</h2>
        <p className="text-[11.5px] text-ink-muted">{meta.descricao}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

// ─── Card de pedido ───────────────────────────────────────────────────────────

function CardPedido({
  pedido, prazo, destacado = false, onLimparDestaque, onVerPerfil,
}: {
  pedido: TransferenciaComProfessor
  prazo: PrazoAtendimento
  destacado?: boolean
  onLimparDestaque?: () => void
  onVerPerfil: () => void
}) {
  const { profile } = useAuth()
  const assumir  = useAssumirTransferencia()
  const largar   = useLargarTransferencia()
  const recusar  = useRecusarTransferencia()

  const [dossieAberto, setDossieAberto] = useState(false)
  const [concluindo, setConcluindo] = useState(false)
  const [recusando, setRecusando] = useState(false)
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [obsAberta, setObsAberta] = useState(false)
  const [incidenteAberto, setIncidenteAberto] = useState(false)

  const faixa = prazo.faixa
  const diasNaFila = diasDesde(pedido.created_at)
  const statusMeta = STATUS_TRANSFERENCIA_META[pedido.status]
  // Antecedência que o professor DEU (congelada no envio) — não envelhece junto
  // com o pedido, então é ela que diz se ele cumpriu o combinado.
  const avisouCom = pedido.snapshot?.prazo_dias_uteis
  const foraDoPrazo = pedido.snapshot?.dentro_do_prazo === false
  const dono = resolverPerfil(pedido.assumido_por_perfil)
  const souDono = pedido.assumido_por === profile?.id
  const emAtendimento = pedido.status === 'em_atendimento'
  const snap = pedido.snapshot

  const ocupado = assumir.isPending || largar.isPending || recusar.isPending

  function erro(e: unknown, padrao: string) {
    toast.error(e instanceof Error ? e.message : padrao)
  }

  // Chegou pelo sino: rola até o card e apaga o parâmetro, para o destaque não
  // grudar na URL e reaparecer a cada re-render da fila.
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!destacado) return
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => onLimparDestaque?.(), 4000)
    return () => clearTimeout(t)
  }, [destacado, onLimparDestaque])

  return (
    <div ref={ref} className={cn(
      'card-surface p-4 space-y-3 transition-shadow',
      faixa === 'atrasada' && 'border-urg-critFg/30',
      faixa === 'vence_hoje' && 'border-urg-highFg/30',
      destacado && 'ring-2 ring-accentBlue ring-offset-2 ring-offset-surface-page',
    )}>
      {/* Cabeçalho: aluno em destaque, professor como contexto */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold leading-tight text-ink">{pedido.aluno_nome}</h3>
            <AlunoId id={pedido.aluno_id} className="text-[12px] font-medium" />
            {foraDoPrazo && (
              <span
                title={`O professor avisou com ${diasUteisLabel(avisouCom ?? 0)}, abaixo do prazo de ${PRAZO_DIAS_UTEIS} dias úteis. Já registrado como informe negativo no perfil dele.`}
                className="inline-flex items-center gap-1 rounded-full bg-urg-highBg px-2 py-0.5 text-[10.5px] font-medium text-urg-highFg"
              >
                <Zap className="h-3 w-3" />fora do prazo
              </span>
            )}
            {!pedido.aluno_da_lista && (
              <span
                title="Não conseguimos casar este nome com nenhum aluno da agenda do professor — pode ser homônimo na carteira dele ou grafia diferente. Localize o cadastro antes de agir."
                className="inline-flex items-center gap-1 rounded-full bg-urg-medBg px-2 py-0.5 text-[10.5px] font-medium text-urg-medFg"
              >
                <AlertTriangle className="h-3 w-3" />sem vínculo
              </span>
            )}
          </div>
          <p className="text-[12px] text-ink-muted">
            pedido por{' '}
            <button
              onClick={onVerPerfil}
              className="btn-press font-medium text-ink-secondary hover:text-accentBlue hover:underline"
            >
              {pedido.professor?.nome ?? 'Professor removido'}
            </button>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {faixa !== 'no_prazo' && (
            <span
              title={faixa === 'atrasada'
                ? `O prazo de atendimento venceu em ${dataBR(prazo.limite)}. A liderança do Suporte ao Aluno foi avisada.`
                : `O prazo de atendimento termina hoje, ${dataBR(prazo.limite)}.`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                faixa === 'atrasada' ? 'bg-urg-critBg text-urg-critFg' : 'bg-urg-highBg text-urg-highFg',
              )}
            >
              {faixa === 'atrasada' ? <AlertTriangle className="h-3 w-3" /> : <Timer className="h-3 w-3" />}
              {faixa === 'atrasada' ? 'Atrasada' : 'Vence hoje'}
            </span>
          )}
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', statusMeta.cls)}>
            {statusMeta.label}
          </span>
        </div>
      </div>

      {/* Faixa de fatos — o resumo que evita abrir o dossiê no caso simples */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
        <span
          title={prazo.regidoPelaUltimaAula
            ? `O prazo é a própria última aula (${dataBR(prazo.limite)}): o professor avisou com menos de ${PRAZO_DIAS_UTEIS} dias úteis, então os ${PRAZO_DIAS_UTEIS} dias úteis de atendimento não cabem.`
            : `Prazo de atendimento: ${PRAZO_DIAS_UTEIS} dias úteis a partir do pedido, ou seja, até ${dataBR(prazo.limite)}.`}
          className={cn(
            'inline-flex items-center gap-1 font-semibold tabular-nums',
            faixa === 'atrasada' ? 'text-urg-critFg'
              : faixa === 'vence_hoje' ? 'text-urg-highFg' : 'text-ink-secondary',
          )}
        >
          <Timer className="h-3 w-3" />
          {prazoLabel(prazo)} · até {dataBR(prazo.limite)}
        </span>
        <span
          className={cn('inline-flex items-center gap-1', prazoVencido(pedido.data_ultima_aula) ? 'font-medium text-urg-critFg' : 'text-ink-muted')}
          title={prazoVencido(pedido.data_ultima_aula)
            ? 'O aluno já teve a última aula com este professor e a transferência não foi processada.'
            : undefined}
        >
          <CalendarDays className="h-3 w-3" />
          última aula {dataBR(pedido.data_ultima_aula)}
          {prazoVencido(pedido.data_ultima_aula) && ' — já passou'}
        </span>
        <span className="text-ink-muted" title="Há quanto tempo o pedido está na fila.">
          na fila {diasNaFila <= 0 ? 'desde hoje' : diasNaFila === 1 ? 'há 1 dia' : `há ${diasNaFila} dias`}
        </span>
        <span className={cn(
          'rounded-full px-2 py-0.5 font-medium',
          motivoEhRelacional(pedido.motivo)
            ? 'bg-accentBlue-soft text-accentBlue'
            : 'bg-surface-subtle text-ink-secondary',
        )}>
          {motivoTransferenciaLabel(pedido.motivo)}
        </span>
        {tempoDeVinculo(snap?.aluno_dias_com_professor) && (
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <Users className="h-3 w-3" />
            com o professor {tempoDeVinculo(snap?.aluno_dias_com_professor)}
          </span>
        )}
        {!!snap?.aluno_saidas_historicas && snap.aluno_saidas_historicas > 0 && (
          <span className="inline-flex items-center gap-1 text-urg-medFg font-medium">
            <AlertTriangle className="h-3 w-3" />
            já saiu de {snap.aluno_saidas_historicas} professor{snap.aluno_saidas_historicas > 1 ? 'es' : ''}
          </span>
        )}
        {pedido.professor?.grupo?.nome && (
          <span className="text-ink-muted">{pedido.professor.grupo.nome}</span>
        )}
        {pedido.professor?.coordenador?.nome && (
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <User className="h-3 w-3" />{pedido.professor.coordenador.nome}
          </span>
        )}
      </div>

      {/* Relato do professor */}
      <p className="rounded-lg bg-surface-subtle/60 px-3 py-2 text-[12.5px] leading-relaxed text-ink-secondary">
        {pedido.detalhe}
      </p>

      {/* Os dois sinais que dizem se ainda dá pra mediar */}
      <SinaisDoPedido pedido={pedido} />

      <ContatoProfessor
        telefone={pedido.professor?.telefone}
        email={pedido.professor?.email}
      />

      {/* Dossiê */}
      <button
        onClick={() => setDossieAberto(v => !v)}
        className="btn-press flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[12px] font-medium text-accentBlue hover:bg-accentBlue-soft"
      >
        {dossieAberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {dossieAberto ? 'Ocultar dossiê do aluno' : 'Ver dossiê do aluno'}
      </button>

      {dossieAberto && (
        <DossieAluno
          transferenciaId={pedido.id}
          snapshot={pedido.snapshot}
          alunoDaLista={pedido.aluno_da_lista}
          alunoId={pedido.aluno_id}
        />
      )}

      {/* Ações */}
      {concluindo ? (
        <FormConcluir
          pedido={pedido}
          onCancelar={() => setConcluindo(false)}
        />
      ) : recusando ? (
        <div className="space-y-2 pt-1">
          <textarea
            value={motivoRecusa}
            onChange={e => setMotivoRecusa(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Motivo da recusa (opcional) — fica registrado no perfil do professor"
            className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[12px] text-ink placeholder:text-ink-subtle transition-colors focus:border-accentBlue focus:outline-none focus:ring-2 focus:ring-accentBlue-soft"
          />
          <div className="flex gap-2">
            <Button
              variant="ghost" size="sm"
              onClick={() => { setRecusando(false); setMotivoRecusa('') }}
              className="btn-press h-8 flex-1 text-[12px] text-ink-secondary"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={ocupado}
              onClick={() => recusar.mutate({ id: pedido.id, motivo: motivoRecusa }, {
                onSuccess: () => toast.success('Pedido recusado.'),
                onError: e => erro(e, 'Erro ao recusar.'),
              })}
              className="btn-press h-8 flex-1 bg-brand text-[12px] text-white hover:bg-brand-strong"
            >
              Confirmar recusa
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 pt-1">
            {!emAtendimento ? (
              <Button
                size="sm"
                disabled={ocupado}
                onClick={() => assumir.mutate(pedido.id, {
                  onSuccess: () => toast.success('Pedido assumido.'),
                  onError: e => erro(e, 'Erro ao assumir.'),
                })}
                className="btn-press h-8 flex-1 gap-1.5 bg-accentBlue text-[12px] text-white hover:bg-accentBlue-hov"
              >
                <Hand className="h-3.5 w-3.5" />Assumir
              </Button>
            ) : (
              <>
                <Button
                  variant="outline" size="sm"
                  disabled={ocupado}
                  onClick={() => largar.mutate(pedido.id, {
                    onSuccess: () => toast.success('Pedido devolvido à fila.'),
                    onError: e => erro(e, 'Erro ao largar.'),
                  })}
                  className="btn-press h-8 border-line text-[12px] text-ink-secondary hover:text-ink"
                >
                  Largar
                </Button>
                <Button
                  size="sm"
                  disabled={ocupado}
                  title="Registra o desfecho do pedido. A transferência em si é feita na plataforma do King."
                  onClick={() => setConcluindo(true)}
                  className="btn-press h-8 flex-1 gap-1.5 bg-urg-lowFg text-[12px] text-white hover:opacity-90"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />Registrar desfecho
                </Button>
              </>
            )}
            <Button
              variant="ghost" size="sm"
              disabled={ocupado}
              onClick={() => setRecusando(true)}
              title="Recusar pedido"
              className="btn-press h-8 w-8 p-0 text-ink-muted hover:text-brand"
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </div>

          {dono && (
            <p className="text-[11.5px] text-ink-muted">
              {souDono ? 'Você assumiu este pedido.' : `Em atendimento com ${dono}.`}
            </p>
          )}

          {pedido.professor && (
            <div className="flex items-center gap-1.5 border-t border-line-soft pt-2.5">
              <button
                onClick={() => setObsAberta(true)}
                className="btn-press inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-ink-secondary hover:bg-surface-subtle hover:text-ink"
              >
                <Plus className="h-3 w-3" />Observação
              </button>
              <button
                onClick={() => setIncidenteAberto(true)}
                className="btn-press inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-ink-secondary hover:bg-surface-subtle hover:text-ink"
              >
                <FileWarning className="h-3 w-3" />Incidente
              </button>
              <button
                onClick={onVerPerfil}
                className="btn-press ml-auto inline-flex items-center rounded-md px-2 py-1 text-[11.5px] text-ink-muted hover:bg-surface-subtle hover:text-ink"
              >
                Ver perfil
              </button>
            </div>
          )}
        </>
      )}

      {pedido.professor && (
        <>
          <NovaObservacaoDialog
            open={obsAberta}
            onOpenChange={setObsAberta}
            professorId={pedido.professor.id}
          />
          <NovoIncidenteDialog
            open={incidenteAberto}
            onOpenChange={setIncidenteAberto}
            professorFixo={{ id: pedido.professor.id, nome: pedido.professor.nome }}
          />
        </>
      )}
    </div>
  )
}

/** Os dois sim/não do formulário. Só aparecem quando o professor respondeu —
 *  são opcionais lá, e um "—" aqui não informaria nada. */
function SinaisDoPedido({ pedido }: { pedido: TransferenciaComProfessor }) {
  const avisouCom = pedido.snapshot?.prazo_dias_uteis
  const dentro = pedido.snapshot?.dentro_do_prazo
  if (pedido.ja_conversou === null && pedido.aceita_manter === null && avisouCom == null) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {avisouCom != null && (
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
          dentro === false ? 'bg-urg-highBg text-urg-highFg' : 'bg-surface-subtle text-ink-secondary',
        )}>
          <Clock className="h-3 w-3" />
          avisou com {diasUteisLabel(avisouCom)}
        </span>
      )}
      {pedido.ja_conversou !== null && (
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
          pedido.ja_conversou
            ? 'bg-surface-subtle text-ink-secondary'
            : 'bg-accentBlue-soft text-accentBlue',
        )}>
          <MessagesSquare className="h-3 w-3" />
          {pedido.ja_conversou ? 'já conversou com o aluno' : 'ainda não conversou com o aluno'}
        </span>
      )}
      {pedido.aceita_manter !== null && (
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
          pedido.aceita_manter
            ? 'bg-urg-lowBg text-urg-lowFg'
            : 'bg-surface-subtle text-ink-secondary',
        )}>
          <Handshake className="h-3 w-3" />
          {pedido.aceita_manter ? 'manteria com ajuste' : 'não manteria'}
        </span>
      )}
    </div>
  )
}

/** Contato do professor — quem atende quase sempre precisa ligar antes de decidir. */
function ContatoProfessor({
  telefone, email,
}: { telefone: string | null | undefined; email: string | null | undefined }) {
  const zap = whatsappLink(telefone)
  if (!telefone && !email) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
      {telefone && (
        <span className="inline-flex items-center gap-1.5 tabular-nums text-ink-secondary">
          <Phone className="h-3 w-3 text-ink-muted" />{telefone}
        </span>
      )}
      {zap && (
        <a
          href={zap}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-press inline-flex items-center gap-1 rounded-md bg-[#25D366]/12 px-2 py-0.5 text-[11px] font-medium text-[#128C4B] transition-colors hover:bg-[#25D366]/20"
        >
          <MessageCircle className="h-3 w-3" />WhatsApp
        </a>
      )}
      {email && <span className="truncate text-ink-muted">{email}</span>}
    </div>
  )
}

// ─── Formulário de desfecho ───────────────────────────────────────────────────

function FormConcluir({
  pedido, onCancelar,
}: { pedido: TransferenciaComProfessor; onCancelar: () => void }) {
  const concluir = useConcluirTransferencia()
  const { data: professores = [] } = useProfessoresAtivos()

  const [desfecho, setDesfecho] = useState<DesfechoTransferencia | ''>('')
  const [destinoId, setDestinoId] = useState<string>('')
  const [nota, setNota] = useState('')

  // O destino só faz sentido quando o aluno realmente mudou de professor.
  const pedeDestino = desfecho === 'transferido'

  const [buscaDestino, setBuscaDestino] = useState('')

  const destinos = useMemo(
    () => professores.filter(p => p.id !== pedido.professor_id),
    [professores, pedido.professor_id],
  )

  // São ~1900 professores na lista: rolar até achar era inviável. A busca
  // ignora acento e casa em QUALQUER parte do nome — quem atende costuma
  // lembrar do sobrenome, não do primeiro nome. Alguns cadastros vêm com lixo
  // grudado ("... inicio 14/01"), então normalizar também evita que isso
  // atrapalhe o casamento.
  const destinosFiltrados = useMemo(() => {
    const termo = normalizarNome(buscaDestino)
    if (!termo) return destinos
    const partes = termo.split(' ').filter(Boolean)
    return destinos.filter(p => {
      const alvo = normalizarNome(p.nome)
      return partes.every(t => alvo.includes(t))
    })
  }, [destinos, buscaDestino])

  function enviar() {
    if (!desfecho) {
      toast.error('Escolha o desfecho.')
      return
    }
    concluir.mutate(
      { id: pedido.id, desfecho, destinoId: pedeDestino ? (destinoId || null) : null, nota },
      {
        onSuccess: () => toast.success('Desfecho registrado no perfil do professor.'),
        onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao concluir.'),
      },
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface-subtle/60 p-3">
      <p className="text-[12px] font-medium text-ink">Como este pedido terminou?</p>

      <div className="grid gap-1.5 sm:grid-cols-2">
        {DESFECHOS_TRANSFERENCIA.map(d => (
          <button
            key={d.value}
            type="button"
            onClick={() => setDesfecho(d.value)}
            className={cn(
              'btn-press rounded-lg border px-2.5 py-2 text-left transition-colors',
              desfecho === d.value
                ? 'border-accentBlue bg-accentBlue-soft'
                : 'border-line-soft bg-surface-canvas hover:border-line',
            )}
          >
            <span className={cn(
              'block text-[12.5px] font-medium',
              desfecho === d.value ? 'text-accentBlue' : 'text-ink',
            )}>
              {d.label}
            </span>
            <span className="mt-0.5 block text-[11px] text-ink-muted">{d.ajuda}</span>
          </button>
        ))}
      </div>

      {pedeDestino && (
        <div className="space-y-1">
          <label className="text-[11.5px] font-medium text-ink-secondary">
            Para qual professor? <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <Select
            value={destinoId || undefined}
            onValueChange={setDestinoId}
            onOpenChange={aberto => { if (!aberto) setBuscaDestino('') }}
          >
            <SelectTrigger className="h-9 border-line bg-surface-canvas text-[12.5px]">
              <SelectValue placeholder="Selecionar professor…" />
            </SelectTrigger>
            <SelectContent>
              <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 border-b border-line-soft bg-surface-canvas px-2 py-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                  <Input
                    autoFocus
                    value={buscaDestino}
                    onChange={e => setBuscaDestino(e.target.value)}
                    placeholder="Buscar professor…"
                    // O Select do Radix usa as teclas pra "typeahead" e pra
                    // fechar no Espaço. Sem barrar aqui, digitar dentro do
                    // campo pula de item e fecha o menu no primeiro espaço.
                    onKeyDown={e => {
                      if (e.key === 'Escape') return
                      e.stopPropagation()
                    }}
                    className="h-8 border-line bg-surface-subtle pl-8 text-[12.5px]"
                  />
                </div>
              </div>

              {destinosFiltrados.length === 0 ? (
                <p className="px-2 py-4 text-center text-[12px] text-ink-muted">
                  Nenhum professor com esse nome.
                </p>
              ) : (
                destinosFiltrados.slice(0, 50).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))
              )}

              {destinosFiltrados.length > 50 && (
                <p className="px-2 py-2 text-center text-[11px] text-ink-muted">
                  Mostrando 50 de {destinosFiltrados.length} — refine a busca.
                </p>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      <textarea
        value={nota}
        onChange={e => setNota(e.target.value)}
        rows={2}
        placeholder="Nota do atendimento (opcional) — entra no registro do perfil do professor"
        className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[12px] text-ink placeholder:text-ink-subtle transition-colors focus:border-accentBlue focus:outline-none focus:ring-2 focus:ring-accentBlue-soft"
      />

      <div className="flex gap-2">
        <Button
          variant="ghost" size="sm"
          onClick={onCancelar}
          className="btn-press h-8 flex-1 text-[12px] text-ink-secondary"
        >
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={concluir.isPending || !desfecho}
          onClick={enviar}
          className="btn-press h-8 flex-1 gap-1.5 bg-urg-lowFg text-[12px] text-white hover:opacity-90"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />Concluir
        </Button>
      </div>
    </div>
  )
}

// ─── Histórico ────────────────────────────────────────────────────────────────

function HistoricoLista({
  itens, onVerPerfil,
}: { itens: TransferenciaComProfessor[]; onVerPerfil: (professorId: string) => void }) {
  if (itens.length === 0) {
    return (
      <div className="card-surface p-12 text-center space-y-2">
        <p className="text-[14px] font-medium text-ink">Nada no histórico ainda</p>
        <p className="text-[13px] text-ink-muted">Pedidos concluídos e recusados aparecem aqui.</p>
      </div>
    )
  }

  return (
    <section className="card-surface overflow-x-auto p-5">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-muted">
            <th className="px-3 py-2 text-left font-medium">Data</th>
            <th className="px-3 py-2 text-left font-medium">Aluno</th>
            <th className="px-3 py-2 text-left font-medium">Professor</th>
            <th className="px-3 py-2 text-left font-medium">Última aula</th>
            <th className="px-3 py-2 text-left font-medium">Motivo</th>
            <th className="px-3 py-2 text-left font-medium">Desfecho</th>
            <th className="px-3 py-2 text-left font-medium">Destino</th>
          </tr>
        </thead>
        <tbody>
          {itens.map(t => {
            const meta = desfechoMeta(t.desfecho)
            return (
              <tr key={t.id} className="border-b border-line-soft">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-muted">
                  {dataBR(t.created_at)}
                </td>
                <td className="px-3 py-2 font-medium text-ink">
                  <span className="inline-flex items-baseline gap-1.5">
                    {t.aluno_nome}
                    <AlunoId id={t.aluno_id} className="text-[11px] font-normal" />
                  </span>
                </td>
                <td className="px-3 py-2">
                  {t.professor ? (
                    <button
                      onClick={() => onVerPerfil(t.professor!.id)}
                      className="btn-press text-ink-secondary hover:text-accentBlue hover:underline"
                    >
                      {t.professor.nome}
                    </button>
                  ) : <span className="text-ink-muted">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-secondary">
                  {dataBR(t.data_ultima_aula)}
                  {t.snapshot?.dentro_do_prazo === false && (
                    <span
                      title={`Avisou com ${diasUteisLabel(t.snapshot?.prazo_dias_uteis ?? 0)}.`}
                      className="ml-1.5 rounded-full bg-urg-highBg px-1.5 py-0.5 text-[10px] font-medium text-urg-highFg"
                    >
                      fora do prazo
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-secondary">{motivoTransferenciaLabel(t.motivo)}</td>
                <td className="px-3 py-2">
                  {t.status === 'recusada' ? (
                    <span className="inline-flex items-center rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10.5px] font-medium text-ink-muted">
                      Recusado
                    </span>
                  ) : meta ? (
                    <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-medium', meta.cls)}>
                      {meta.label}
                    </span>
                  ) : <span className="text-ink-muted">—</span>}
                </td>
                <td className="px-3 py-2 text-ink-secondary">
                  {resolverPerfil(t.destino) ?? <span className="text-ink-muted">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

/** Reexportado só para manter o ícone do menu junto da página. */
export const TransferenciasIcon = UserCog
