import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PauseCircle, PlayCircle, User, Users, CalendarClock, CheckCircle2, Search,
  Hand, XCircle, Plus, FileWarning, Link2, Check, AlertTriangle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  usePausasFila, usePausasVigentes, useAssumirPausa, useLargarPausa,
  useConcluirPausa, useRecusarPausa, useEncerrarPausa,
  faixaDaPausa, diasAte, FAIXA_META, STATUS_PAUSA_META,
  type PausaComProfessor, type FaixaPausa,
} from '@/hooks/usePausas'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { linkPausaPublico } from '@/lib/portal'
import { NovaObservacaoDialog } from '@/components/professores/NovaObservacaoDialog'
import { NovoIncidenteDialog } from '@/components/incidentes/NovoIncidenteDialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const ORDEM_FAIXAS: FaixaPausa[] = ['atrasada', 'hoje', 'proxima', 'futura']

const FAIXA_ESTILO: Record<FaixaPausa, { tone: string; icon: string }> = {
  atrasada: { tone: 'text-urg-critFg', icon: 'bg-urg-critBg text-urg-critFg' },
  hoje:     { tone: 'text-urg-highFg', icon: 'bg-urg-highBg text-urg-highFg' },
  proxima:  { tone: 'text-urg-medFg',  icon: 'bg-urg-medBg  text-urg-medFg'  },
  futura:   { tone: 'text-ink-muted',  icon: 'bg-surface-subtle text-ink-muted' },
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/** "faltam 3 dias" / "hoje" / "3 dias de atraso" — o indicador principal do card. */
function prazoLabel(dias: number): string {
  if (dias === 0) return 'começa hoje'
  if (dias > 0)   return dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`
  const atraso = Math.abs(dias)
  return atraso === 1 ? '1 dia de atraso' : `${atraso} dias de atraso`
}

function resolverPerfil(ref: { nome: string } | { nome: string }[] | null | undefined): string | null {
  const r = Array.isArray(ref) ? ref[0] : ref
  return r?.nome ?? null
}

export function AcompanhamentoPausasPage() {
  const { profile } = useAuth()
  const podeEncerrar = canEdit(profile)   // encerrar pausa é exclusivo da coordenação
  const navigate = useNavigate()

  const { data: fila = [], isLoading } = usePausasFila()
  const { data: vigentes = [] } = usePausasVigentes()
  const [busca, setBusca] = useState('')

  const filtrar = (lista: PausaComProfessor[]) => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return lista
    return lista.filter(p =>
      (p.professor?.nome ?? '').toLowerCase().includes(termo) ||
      (p.professor?.grupo?.nome ?? '').toLowerCase().includes(termo) ||
      (p.professor?.coordenador?.nome ?? '').toLowerCase().includes(termo) ||
      p.motivo.toLowerCase().includes(termo))
  }

  const filaFiltrada = useMemo(() => filtrar(fila), [fila, busca])
  const vigentesFiltradas = useMemo(() => filtrar(vigentes), [vigentes, busca])

  // Agrupa por urgência mantendo a ordem por data_inicio que veio do banco.
  const porFaixa = useMemo(() => {
    const mapa = new Map<FaixaPausa, PausaComProfessor[]>()
    for (const p of filaFiltrada) {
      const f = faixaDaPausa(p)
      const atual = mapa.get(f) ?? []
      atual.push(p)
      mapa.set(f, atual)
    }
    return mapa
  }, [filaFiltrada])

  const atrasadas = porFaixa.get('atrasada')?.length ?? 0
  const contatosVencidos = vigentesFiltradas.filter(p => diasAte(p.data_fim) <= 0).length

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Acompanhamento de Pausas</h1>
          <p className="text-[13px] text-ink-muted">
            <span className="tabular-nums text-ink-secondary font-medium">{filaFiltrada.length}</span> na fila
            {atrasadas > 0 && (
              <> · <span className="text-urg-critFg font-medium">{atrasadas} atrasada{atrasadas > 1 ? 's' : ''}</span></>
            )}
            {vigentesFiltradas.length > 0 && (
              <> · <span className="text-ink-secondary">{vigentesFiltradas.length} em pausa</span></>
            )}
            {contatosVencidos > 0 && (
              <> · <span className="text-urg-highFg font-medium">{contatosVencidos} aguardando contato</span></>
            )}
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <Input
            placeholder="Buscar professor, grupo, motivo…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-9 bg-surface-canvas border-line"
          />
        </div>
      </header>

      <CardLinkPublico />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-ink-muted text-[13px]">Carregando…</div>
      ) : (
        <>
          {filaFiltrada.length === 0 ? (
            <div className="card-surface p-12 text-center space-y-3">
              <div className="mx-auto h-10 w-10 rounded-full bg-surface-subtle text-ink-muted flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <p className="text-[14px] font-medium text-ink">Nenhuma solicitação na fila</p>
              <p className="text-[13px] text-ink-muted">
                Quando um professor preencher o formulário de pausa, a solicitação aparece aqui.
              </p>
            </div>
          ) : (
            ORDEM_FAIXAS.map(faixa => {
              const itens = porFaixa.get(faixa)
              if (!itens || itens.length === 0) return null
              return (
                <SecaoFaixa key={faixa} faixa={faixa} qtd={itens.length}>
                  {itens.map(p => (
                    <CardSolicitacao
                      key={p.id}
                      pausa={p}
                      onVerPerfil={() => p.professor && navigate(`/professores/${p.professor.id}`)}
                    />
                  ))}
                </SecaoFaixa>
              )
            })
          )}

          {vigentesFiltradas.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-subtle text-ink-secondary">
                  <PauseCircle className="h-3.5 w-3.5" />
                </span>
                <h2 className="label-micro text-ink-secondary">
                  Em pausa ({vigentesFiltradas.length})
                </h2>
                <p className="text-[11.5px] text-ink-muted">
                  A pausa só encerra depois do contato da coordenação.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {vigentesFiltradas.map(p => (
                  <CardVigente
                    key={p.id}
                    pausa={p}
                    podeEncerrar={podeEncerrar}
                    onVerPerfil={() => p.professor && navigate(`/professores/${p.professor.id}`)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

// ─── Link público ─────────────────────────────────────────────────────────────

function CardLinkPublico() {
  const [copiado, setCopiado] = useState(false)
  const link = linkPausaPublico()

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
      <div className="flex items-start gap-3 min-w-0">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accentBlue-soft text-accentBlue">
          <Link2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-[13px] font-medium text-ink">Link do formulário de pausa</p>
          <p className="text-[11.5px] text-ink-muted truncate">
            Envie para o professor oficializar a pausa — ele se identifica por e-mail ou nome completo.
          </p>
          <code className="text-[11.5px] text-ink-secondary break-all">{link}</code>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={copiar}
        className="btn-press h-8 gap-1.5 border-line text-ink-secondary hover:text-ink text-[12px] shrink-0"
      >
        {copiado ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
        {copiado ? 'Copiado' : 'Copiar link'}
      </Button>
    </div>
  )
}

// ─── Seção por faixa de urgência ──────────────────────────────────────────────

function SecaoFaixa({
  faixa, qtd, children,
}: { faixa: FaixaPausa; qtd: number; children: React.ReactNode }) {
  const meta = FAIXA_META[faixa]
  const estilo = FAIXA_ESTILO[faixa]
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-full', estilo.icon)}>
          {faixa === 'atrasada' ? <AlertTriangle className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
        </span>
        <h2 className={cn('label-micro', estilo.tone)}>{meta.label} ({qtd})</h2>
        <p className="text-[11.5px] text-ink-muted">{meta.descricao}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

// ─── Card da fila (pendente / em atendimento) ─────────────────────────────────

// A fila não tem "Tirar da pausa": o professor ainda não está pausado aqui.
function CardSolicitacao({
  pausa, onVerPerfil,
}: { pausa: PausaComProfessor; onVerPerfil: () => void }) {
  const assumir  = useAssumirPausa()
  const largar   = useLargarPausa()
  const concluir = useConcluirPausa()
  const recusar  = useRecusarPausa()

  const [obsAberta, setObsAberta] = useState(false)
  const [incidenteAberto, setIncidenteAberto] = useState(false)
  const [recusando, setRecusando] = useState(false)
  const [motivoRecusa, setMotivoRecusa] = useState('')

  const { profile } = useAuth()
  const faixa = faixaDaPausa(pausa)
  const dias = diasAte(pausa.data_inicio)
  const statusMeta = STATUS_PAUSA_META[pausa.status]
  const dono = resolverPerfil(pausa.assumido_por_perfil)
  const souDono = pausa.assumido_por === profile?.id
  const emAtendimento = pausa.status === 'em_atendimento'

  const ocupado = assumir.isPending || largar.isPending || concluir.isPending || recusar.isPending

  function erro(e: unknown, padrao: string) {
    toast.error(e instanceof Error ? e.message : padrao)
  }

  return (
    <div className={cn(
      'card-surface p-4 space-y-3',
      faixa === 'atrasada' && 'border-urg-critFg/30',
      faixa === 'hoje' && 'border-urg-highFg/30',
    )}>
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onVerPerfil}
          className="btn-press text-left font-medium text-[14px] text-ink leading-tight hover:text-accentBlue hover:underline truncate flex-1"
        >
          {pausa.professor?.nome ?? 'Professor removido'}
        </button>
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0', statusMeta.cls)}>
          {statusMeta.label}
        </span>
      </div>

      <p className={cn(
        'text-[12px] font-semibold tabular-nums',
        faixa === 'atrasada' ? 'text-urg-critFg' : faixa === 'hoje' ? 'text-urg-highFg' : 'text-ink-secondary',
      )}>
        {prazoLabel(dias)}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {pausa.professor?.grupo?.nome && (
          <span className="inline-flex items-center rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
            {pausa.professor.grupo.nome}
          </span>
        )}
        {pausa.professor?.coordenador?.nome && (
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
            <User className="h-3 w-3" />{pausa.professor.coordenador.nome}
          </span>
        )}
      </div>

      <p className="text-[12px] text-ink-secondary leading-relaxed line-clamp-3" title={pausa.motivo}>
        {pausa.motivo}
      </p>

      <div className="space-y-1 text-[11.5px] text-ink-muted">
        <p className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3 w-3" />
          <span className="tabular-nums">{dataBR(pausa.data_inicio)}</span>
          <span className="text-ink-subtle">→</span>
          <span className="tabular-nums">{dataBR(pausa.data_fim)}</span>
        </p>
        {dono && (
          <p className="inline-flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            {souDono ? 'Você assumiu' : `Com ${dono}`}
          </p>
        )}
      </div>

      {recusando ? (
        <div className="space-y-2 pt-1">
          <textarea
            value={motivoRecusa}
            onChange={e => setMotivoRecusa(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Motivo da recusa (opcional)"
            className="w-full resize-none rounded-md border border-line bg-surface-canvas px-3 py-2 text-[12px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors"
          />
          <div className="flex gap-2">
            <Button
              variant="ghost" size="sm"
              onClick={() => { setRecusando(false); setMotivoRecusa('') }}
              className="btn-press h-8 flex-1 text-ink-secondary text-[12px]"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={ocupado}
              onClick={() => recusar.mutate({ id: pausa.id, motivo: motivoRecusa }, {
                onSuccess: () => toast.success('Solicitação recusada.'),
                onError: e => erro(e, 'Erro ao recusar.'),
              })}
              className="btn-press h-8 flex-1 bg-brand text-white hover:bg-brand-strong text-[12px]"
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
                onClick={() => assumir.mutate(pausa.id, {
                  onSuccess: () => toast.success('Solicitação assumida.'),
                  onError: e => erro(e, 'Erro ao assumir.'),
                })}
                className="btn-press h-8 flex-1 gap-1.5 bg-accentBlue hover:bg-accentBlue-hov text-white text-[12px]"
              >
                <Hand className="h-3.5 w-3.5" />Assumir
              </Button>
            ) : (
              <>
                <Button
                  variant="outline" size="sm"
                  disabled={ocupado}
                  onClick={() => largar.mutate(pausa.id, {
                    onSuccess: () => toast.success('Solicitação devolvida à fila.'),
                    onError: e => erro(e, 'Erro ao largar.'),
                  })}
                  className="btn-press h-8 border-line text-ink-secondary hover:text-ink text-[12px]"
                >
                  Largar
                </Button>
                <Button
                  size="sm"
                  disabled={ocupado}
                  title="Confirma que os alunos já foram retirados. A pausa ativa na data de início."
                  onClick={() => concluir.mutate(pausa.id, {
                    onSuccess: () => toast.success(
                      diasAte(pausa.data_inicio) <= 0
                        ? 'Pausa concluída e ativada.'
                        : `Pausa concluída. Ativa em ${dataBR(pausa.data_inicio)}.`,
                    ),
                    onError: e => erro(e, 'Erro ao concluir.'),
                  })}
                  className="btn-press h-8 flex-1 gap-1.5 bg-urg-lowFg text-white hover:opacity-90 text-[12px]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />Concluir
                </Button>
              </>
            )}
            <Button
              variant="ghost" size="sm"
              disabled={ocupado}
              onClick={() => setRecusando(true)}
              title="Recusar solicitação"
              className="btn-press h-8 w-8 p-0 text-ink-muted hover:text-brand"
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </div>

          <AcoesProfessor
            professorId={pausa.professor?.id}
            onObservacao={() => setObsAberta(true)}
            onIncidente={() => setIncidenteAberto(true)}
            onVerPerfil={onVerPerfil}
          />
        </>
      )}

      {pausa.professor && (
        <>
          <NovaObservacaoDialog
            open={obsAberta}
            onOpenChange={setObsAberta}
            professorId={pausa.professor.id}
          />
          <NovoIncidenteDialog
            open={incidenteAberto}
            onOpenChange={setIncidenteAberto}
            professorFixo={{ id: pausa.professor.id, nome: pausa.professor.nome }}
          />
        </>
      )}
    </div>
  )
}

// ─── Card de pausa vigente (professor já pausado) ─────────────────────────────

function CardVigente({
  pausa, podeEncerrar, onVerPerfil,
}: { pausa: PausaComProfessor; podeEncerrar: boolean; onVerPerfil: () => void }) {
  const encerrar = useEncerrarPausa()
  const [obsAberta, setObsAberta] = useState(false)
  const [incidenteAberto, setIncidenteAberto] = useState(false)

  const diasFim = diasAte(pausa.data_fim)
  const vencido = diasFim <= 0

  return (
    <div className={cn('card-surface p-4 space-y-3', vencido && 'border-urg-highFg/30')}>
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onVerPerfil}
          className="btn-press text-left font-medium text-[14px] text-ink leading-tight hover:text-accentBlue hover:underline truncate flex-1"
        >
          {pausa.professor?.nome ?? 'Professor removido'}
        </button>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-ink-secondary shrink-0">
          <PauseCircle className="h-3 w-3" />Em pausa
        </span>
      </div>

      <p className={cn(
        'text-[12px] font-semibold tabular-nums',
        vencido ? 'text-urg-highFg' : 'text-ink-secondary',
      )}>
        {vencido
          ? (diasFim === 0 ? 'contato previsto para hoje' : `contato atrasado ${Math.abs(diasFim)} dia${Math.abs(diasFim) > 1 ? 's' : ''}`)
          : `contato em ${diasFim} dia${diasFim > 1 ? 's' : ''}`}
      </p>

      <p className="text-[12px] text-ink-secondary leading-relaxed line-clamp-2" title={pausa.motivo}>
        {pausa.motivo}
      </p>

      <div className="space-y-1 text-[11.5px] text-ink-muted">
        <p className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3 w-3" />
          <span className="tabular-nums">{dataBR(pausa.data_inicio)}</span>
          <span className="text-ink-subtle">→</span>
          <span className="tabular-nums">{dataBR(pausa.data_fim)}</span>
        </p>
        {pausa.professor?.coordenador?.nome && (
          <p className="inline-flex items-center gap-1.5">
            <User className="h-3 w-3" />{pausa.professor.coordenador.nome}
          </p>
        )}
      </div>

      {podeEncerrar && (
        <Button
          size="sm"
          disabled={encerrar.isPending}
          title="Registra que o contato aconteceu e tira o professor da pausa."
          onClick={() => pausa.professor && encerrar.mutate(pausa.professor.id, {
            onSuccess: () => toast.success('Pausa encerrada. O professor voltou a ficar ativo.'),
            onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao encerrar a pausa.'),
          })}
          className="btn-press h-8 w-full gap-1.5 bg-urg-lowFg text-white hover:opacity-90 text-[12px]"
        >
          <PlayCircle className="h-3.5 w-3.5" />Tirar da pausa
        </Button>
      )}

      <AcoesProfessor
        professorId={pausa.professor?.id}
        onObservacao={() => setObsAberta(true)}
        onIncidente={() => setIncidenteAberto(true)}
        onVerPerfil={onVerPerfil}
      />

      {pausa.professor && (
        <>
          <NovaObservacaoDialog
            open={obsAberta}
            onOpenChange={setObsAberta}
            professorId={pausa.professor.id}
          />
          <NovoIncidenteDialog
            open={incidenteAberto}
            onOpenChange={setIncidenteAberto}
            professorFixo={{ id: pausa.professor.id, nome: pausa.professor.nome }}
          />
        </>
      )}
    </div>
  )
}

/** Ações sobre o professor (não sobre a solicitação): observação, incidente e
 *  atalho pro perfil. Iguais às do ProfessorDetalhePage, trazidas pra cá pra
 *  não obrigar a sair da fila. */
function AcoesProfessor({
  professorId, onObservacao, onIncidente, onVerPerfil,
}: {
  professorId: string | undefined
  onObservacao: () => void
  onIncidente: () => void
  onVerPerfil: () => void
}) {
  if (!professorId) return null
  return (
    <div className="flex items-center gap-1.5 border-t border-line-soft pt-2.5">
      <button
        onClick={onObservacao}
        className="btn-press inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-ink-secondary hover:bg-surface-subtle hover:text-ink"
      >
        <Plus className="h-3 w-3" />Observação
      </button>
      <button
        onClick={onIncidente}
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
  )
}
