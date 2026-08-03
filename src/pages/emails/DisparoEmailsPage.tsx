import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Search, Mail, Send, X, Check, Users, AlertTriangle, Loader2, Sparkles,
  PenLine, ChevronDown, Ban, CalendarClock, MailWarning, History, Gauge,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { usePainelProfessores, type PainelProfessor } from '@/hooks/usePainelProfessores'
import { useGrupos } from '@/hooks/useGrupos'
import {
  useEnviarEmailMassa, useHistoricoDisparos, useEmailQuotaHoje,
  type MensagemAlvo, type RespostaDisparo, type DisparoRegistro, type QuotaHoje,
} from '@/hooks/useEnviarEmailMassa'
import {
  montarCorpoConvocacao, montarCorpoPersonalizado, TOKENS,
  ASSUNTO_CONVOCACAO_PADRAO, ASSUNTO_PERSONALIZADO_PADRAO, type AlvoEmail,
} from '@/lib/convocacaoEmail'
import { NIVEIS_ORDEM, nivelInfo } from '@/lib/prioridade'
import { scoreVisual } from '@/lib/score'
import { SCORE_BUCKETS, bucketFor } from '@/hooks/useDashboardGeral'
import { useAuth } from '@/contexts/AuthContext'
import { canEdit } from '@/lib/permissions'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Disparo de E-mails — a coordenação filtra professores (nome, grupo, prioridade,
// score, pendências, tempo sem reunião, bloqueio), seleciona individualmente ou
// em massa, e dispara a mensagem-padrão de convocação OU um texto personalizado.
// O e-mail de destino é sempre resolvido no servidor (Edge Function).
// ─────────────────────────────────────────────────────────────────────────────

const LIMITE_DIA = 200         // limite diário de e-mails auto-imposto
const VISIVEIS_MAX = 300       // teto de linhas renderizadas (a seleção opera no filtro inteiro)

type ModoMsg = 'convocacao' | 'personalizado'

interface Filtros {
  busca: string
  grupoId: string
  nivel: string
  faixaScore: string
  minPendencias: string
  semReuniao: string
  bloqueado: string
}

const FILTROS_PADRAO: Filtros = {
  busca: '', grupoId: 'todos', nivel: 'todos', faixaScore: 'todos',
  minPendencias: '0', semReuniao: '0', bloqueado: 'todos',
}

const MIN_PEND_OPTS = [
  { value: '0', label: 'Qualquer' }, { value: '1', label: '≥ 1' },
  { value: '3', label: '≥ 3' }, { value: '5', label: '≥ 5' }, { value: '10', label: '≥ 10' },
]
const SEM_REUNIAO_OPTS = [
  { value: '0', label: 'Qualquer' }, { value: '7', label: '≥ 7 dias' },
  { value: '14', label: '≥ 14 dias' }, { value: '30', label: '≥ 30 dias' },
  { value: '60', label: '≥ 60 dias' }, { value: 'nunca', label: 'Nunca teve' },
]

function aplicarFiltros(rows: PainelProfessor[], f: Filtros): PainelProfessor[] {
  const termo = f.busca.trim().toLowerCase()
  const minP = Number(f.minPendencias) || 0
  return rows.filter(r => {
    if (termo && !r.nome.toLowerCase().includes(termo)) return false
    if (f.grupoId !== 'todos' && r.grupo_id !== f.grupoId) return false
    if (f.nivel !== 'todos' && r.nivel.id !== f.nivel) return false
    if (f.faixaScore !== 'todos') {
      if (r.score_atual == null || bucketFor(r.score_atual)?.label !== f.faixaScore) return false
    }
    if (r.aulas_pendentes_qtd < minP) return false
    if (f.semReuniao === 'nunca') {
      if (r.dias_sem_reuniao != null) return false
    } else {
      const min = Number(f.semReuniao) || 0
      if (min > 0 && (r.dias_sem_reuniao ?? Number.POSITIVE_INFINITY) < min) return false
    }
    if (f.bloqueado === 'sim' && r.elegivel_alocacao !== false) return false
    if (f.bloqueado === 'nao' && r.elegivel_alocacao === false) return false
    return true
  })
}

function alvoDe(r: PainelProfessor): AlvoEmail {
  return {
    nome: r.nome,
    coordenador_nome: r.coordenador_nome,
    grupo_nome: r.grupo_nome,
    data_ultima_reuniao: r.data_ultima_reuniao,
    elegivel_alocacao: r.elegivel_alocacao,
    aulas_pendentes_qtd: r.aulas_pendentes_qtd,
  }
}

export function DisparoEmailsPage() {
  const { profile } = useAuth()
  const podeEnviar = canEdit(profile) || profile?.is_lider === true
  const { data: rows = [], isLoading } = usePainelProfessores()
  const { data: grupos = [] } = useGrupos()
  const { data: quota } = useEmailQuotaHoje()
  const enviar = useEnviarEmailMassa()

  const [f, setF] = useState<Filtros>(FILTROS_PADRAO)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  const [modo, setModo] = useState<ModoMsg>('convocacao')
  const [assunto, setAssunto] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [assinaturaEdit, setAssinaturaEdit] = useState<string | null>(null)
  const [comoCoordenador, setComoCoordenador] = useState(false)
  const [incluirLink, setIncluirLink] = useState(true)
  const [prefixarAssinatura, setPrefixarAssinatura] = useState(true)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resultado, setResultado] = useState<RespostaDisparo | null>(null)

  // Estados derivados (sem efeito): a assinatura cai pro nome de quem está logado
  // até ser editada; o assunto segue o padrão do modo até a coordenação digitar.
  const assinatura = assinaturaEdit ?? profile?.nome ?? ''
  const assuntoEfetivo = assunto ?? (modo === 'convocacao' ? ASSUNTO_CONVOCACAO_PADRAO : ASSUNTO_PERSONALIZADO_PADRAO)
  const restamHoje = quota?.restantes ?? LIMITE_DIA

  const filtrados = useMemo(() => aplicarFiltros(rows, f), [rows, f])
  const filtradosComEmail = useMemo(() => filtrados.filter(r => !!r.email), [filtrados])

  // Professores selecionados que ainda existem e têm e-mail — os destinatários reais.
  const porId = useMemo(() => new Map(rows.map(r => [r.professor_id, r])), [rows])
  const destinatarios = useMemo(
    () => [...selecionados].map(id => porId.get(id)).filter((r): r is PainelProfessor => !!r && !!r.email),
    [selecionados, porId],
  )
  const selTotal = selecionados.size
  const selSemEmail = useMemo(
    () => [...selecionados].map(id => porId.get(id)).filter(r => r && !r.email).length,
    [selecionados, porId],
  )

  const filtrosAtivos = JSON.stringify(f) !== JSON.stringify(FILTROS_PADRAO)

  function toggleOne(id: string) {
    setSelecionados(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  function selecionarFiltrados() {
    setSelecionados(s => {
      const n = new Set(s)
      for (const r of filtradosComEmail) n.add(r.professor_id)
      return n
    })
  }
  function limparSelecao() { setSelecionados(new Set()) }

  const textoValido = modo === 'convocacao' || texto.trim().length > 0
  const podeDisparar = podeEnviar && destinatarios.length > 0 && assuntoEfetivo.trim().length > 0 && textoValido && !enviar.isPending

  function corpoParaAlvo(r: PainelProfessor): string {
    const alvo = alvoDe(r)
    const opts = { assinatura, comoCoordenador }
    return modo === 'convocacao'
      ? montarCorpoConvocacao(alvo, { ...opts, incluirLink })
      : montarCorpoPersonalizado(texto, alvo, { ...opts, prefixarAssinatura })
  }

  // Preview: o primeiro destinatário (ou o primeiro da lista filtrada como amostra).
  const alvoPreview = destinatarios[0] ?? filtradosComEmail[0] ?? null
  const preview = alvoPreview ? corpoParaAlvo(alvoPreview) : ''

  async function dispararAgora() {
    setConfirmOpen(false)
    const mensagens: MensagemAlvo[] = destinatarios.map(r => ({
      professor_id: r.professor_id,
      corpo: corpoParaAlvo(r),
    }))
    try {
      const res = await enviar.mutateAsync({
        assunto: assuntoEfetivo.trim(),
        tipo: modo,
        remetente_nome: (comoCoordenador ? '' : assinatura.trim()) || profile?.nome || 'Coordenação',
        mensagens,
      })
      setResultado(res)
      if (res.falhas === 0 && res.sem_email === 0) {
        toast.success(`${res.enviados} e-mail(s) enviado(s).`)
      } else {
        toast.warning(`${res.enviados} enviado(s), ${res.falhas} falha(s), ${res.sem_email} sem e-mail.`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao disparar e-mails.')
    }
  }

  function inserirToken(token: string) {
    setTexto(t => (t ? `${t}${t.endsWith(' ') || t.endsWith('\n') ? '' : ' '}${token}` : token))
  }

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <header className="space-y-0.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Disparo de E-mails</h1>
        <p className="text-[13px] text-ink-muted">
          Filtre os professores, selecione individualmente ou em massa e dispare a convocação padrão ou uma mensagem escrita pela coordenação.
        </p>
      </header>

      {/* ── Contador diário (visível a todos) ── */}
      <QuotaBar quota={quota} />

      {/* ── Faixa de resumo da seleção ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-xl border border-line-soft bg-line-soft">
        <MetricCell label="No filtro" valor={filtrados.length} />
        <MetricCell label="Selecionados" valor={selTotal} tone={selTotal > 0 ? 'accent' : 'neutral'} />
        <MetricCell label="Com e-mail" valor={destinatarios.length} tone="low" />
        <MetricCell label="Sem e-mail" valor={selSemEmail} tone={selSemEmail > 0 ? 'high' : 'neutral'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px] items-start">
        {/* ── Coluna esquerda: filtros + tabela ── */}
        <div className="space-y-4 min-w-0">
          {/* Filtros */}
          <div className="card-surface p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
                <Input
                  placeholder="Buscar professor…"
                  value={f.busca}
                  onChange={e => setF(s => ({ ...s, busca: e.target.value }))}
                  className="pl-9 h-9 bg-surface-canvas border-line"
                />
              </div>
              <FiltroSelect
                valor={f.grupoId}
                onChange={v => setF(s => ({ ...s, grupoId: v }))}
                opcoes={[{ value: 'todos', label: 'Todas as coordenações' }, ...grupos.map(g => ({ value: g.id, label: g.nome }))]}
              />
              <FiltroSelect
                valor={f.nivel}
                onChange={v => setF(s => ({ ...s, nivel: v }))}
                opcoes={[{ value: 'todos', label: 'Toda prioridade' }, ...NIVEIS_ORDEM.map(id => ({ value: id, label: nivelInfo(id).label }))]}
              />
              <FiltroSelect
                valor={f.faixaScore}
                onChange={v => setF(s => ({ ...s, faixaScore: v }))}
                opcoes={[{ value: 'todos', label: 'Toda faixa de score' }, ...SCORE_BUCKETS.map(b => ({ value: b.label, label: b.label }))]}
              />
              <FiltroSelect valor={f.minPendencias} onChange={v => setF(s => ({ ...s, minPendencias: v }))} opcoes={MIN_PEND_OPTS} prefixo="Pendências" />
              <FiltroSelect valor={f.semReuniao} onChange={v => setF(s => ({ ...s, semReuniao: v }))} opcoes={SEM_REUNIAO_OPTS} prefixo="Sem reunião" />
              <FiltroSelect
                valor={f.bloqueado}
                onChange={v => setF(s => ({ ...s, bloqueado: v }))}
                opcoes={[{ value: 'todos', label: 'Bloqueio: todos' }, { value: 'sim', label: 'Bloqueados' }, { value: 'nao', label: 'Não bloqueados' }]}
              />
              {filtrosAtivos && (
                <button
                  onClick={() => setF(FILTROS_PADRAO)}
                  className="btn-press inline-flex items-center gap-1 rounded-md px-2.5 h-9 text-[12px] font-medium text-ink-secondary hover:text-ink hover:bg-surface-subtle transition-colors"
                >
                  <X className="h-3.5 w-3.5" /> Limpar
                </button>
              )}
            </div>

            {/* Ações de seleção em massa */}
            <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-2.5">
              <button
                onClick={selecionarFiltrados}
                disabled={filtradosComEmail.length === 0}
                className="btn-press inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium text-accentBlue bg-accentBlue-soft hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                <Users className="h-3.5 w-3.5" />
                Selecionar {filtradosComEmail.length} filtrado{filtradosComEmail.length !== 1 ? 's' : ''}
              </button>
              {selTotal > 0 && (
                <button
                  onClick={limparSelecao}
                  className="btn-press inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium text-ink-secondary hover:text-ink hover:bg-surface-subtle transition-colors"
                >
                  <X className="h-3.5 w-3.5" /> Limpar seleção ({selTotal})
                </button>
              )}
              <span className="text-[12px] text-ink-muted tabular-nums ml-auto">
                {filtrados.length} professor{filtrados.length !== 1 ? 'es' : ''}
              </span>
            </div>
          </div>

          {/* Tabela */}
          <div className="card-surface overflow-x-auto">
            <table className="w-full text-[13px] min-w-[720px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-ink-muted uppercase tracking-wide">
                  <th className="px-3 py-2.5 w-9">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos filtrados"
                      checked={filtradosComEmail.length > 0 && filtradosComEmail.every(r => selecionados.has(r.professor_id))}
                      onChange={e => e.target.checked ? selecionarFiltrados() : limparSelecao()}
                      className="h-4 w-4 rounded border-line align-middle"
                      style={{ accentColor: 'var(--accent-blue)' }}
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">Professor</th>
                  <th className="px-3 py-2.5 font-medium text-center">Score</th>
                  <th className="px-3 py-2.5 font-medium text-center">Pend.</th>
                  <th className="px-3 py-2.5 font-medium text-center">Sem reunião</th>
                  <th className="px-3 py-2.5 font-medium">Prioridade</th>
                </tr>
              </thead>
              {isLoading ? (
                <tbody><SkeletonRows /></tbody>
              ) : filtrados.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={6}>
                      <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                        <Search className="h-7 w-7 text-ink-subtle" />
                        <p className="text-[13px] text-ink-secondary font-medium">Nenhum professor neste filtro.</p>
                        <p className="text-[12px] text-ink-muted">Ajuste a busca ou os filtros acima.</p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              ) : (
                <tbody>
                  {filtrados.slice(0, VISIVEIS_MAX).map(r => (
                    <LinhaProfessor
                      key={r.professor_id}
                      r={r}
                      selecionado={selecionados.has(r.professor_id)}
                      onToggle={() => toggleOne(r.professor_id)}
                    />
                  ))}
                </tbody>
              )}
            </table>
            {filtrados.length > VISIVEIS_MAX && (
              <p className="px-3 py-2.5 text-[11.5px] text-ink-muted border-t border-line-soft">
                Mostrando os primeiros {VISIVEIS_MAX} de {filtrados.length}. Refine os filtros — a seleção em massa acima considera todos os {filtradosComEmail.length} com e-mail.
              </p>
            )}
          </div>

          <HistoricoDisparos />
        </div>

        {/* ── Coluna direita: compositor ── */}
        <div className="lg:sticky lg:top-[4.75rem] space-y-4">
          <div className="card-surface p-4 space-y-3.5">
            {/* Modo */}
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-subtle p-1">
              <ModoBotao ativo={modo === 'convocacao'} onClick={() => setModo('convocacao')} icon={<Sparkles className="h-3.5 w-3.5" />} label="Convocação padrão" />
              <ModoBotao ativo={modo === 'personalizado'} onClick={() => setModo('personalizado')} icon={<PenLine className="h-3.5 w-3.5" />} label="Personalizada" />
            </div>

            {/* Assunto */}
            <div className="space-y-1">
              <label className="label-micro">Assunto</label>
              <Input
                value={assuntoEfetivo}
                onChange={e => setAssunto(e.target.value)}
                placeholder="Assunto do e-mail"
                className="h-9 bg-surface-canvas border-line"
              />
            </div>

            {/* Corpo */}
            {modo === 'convocacao' ? (
              <div className="space-y-2">
                <p className="text-[12px] text-ink-muted leading-relaxed">
                  Mensagem de check-in/convocação, personalizada por professor (primeiro nome, data da última reunião{incluirLink ? ' e link de agendamento' : ''}).
                </p>
                <CheckLinha
                  checked={incluirLink}
                  onChange={setIncluirLink}
                  label="Incluir link de agendamento"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="label-micro">Mensagem</label>
                <textarea
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  rows={7}
                  placeholder="Escreva a mensagem… use os campos abaixo para personalizar por professor."
                  className="w-full rounded-lg border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle resize-y focus:outline-none focus:ring-2 focus:ring-accentBlue/30"
                />
                <div className="flex flex-wrap gap-1.5">
                  {TOKENS.map(t => (
                    <button
                      key={t.token}
                      type="button"
                      title={t.descricao}
                      onClick={() => inserirToken(t.token)}
                      className="btn-press rounded-md bg-surface-subtle px-2 py-1 text-[11px] font-medium text-ink-secondary hover:text-accentBlue hover:bg-accentBlue-soft transition-colors"
                    >
                      {t.token}
                    </button>
                  ))}
                </div>
                <CheckLinha
                  checked={prefixarAssinatura}
                  onChange={setPrefixarAssinatura}
                  label="Iniciar com a assinatura em negrito"
                />
              </div>
            )}

            {/* Assinatura */}
            <div className="space-y-1.5 border-t border-line-soft pt-3">
              <label className="label-micro">Assinar como</label>
              <Input
                value={assinatura}
                onChange={e => setAssinaturaEdit(e.target.value)}
                disabled={comoCoordenador}
                placeholder="Seu nome"
                className="h-9 bg-surface-canvas border-line disabled:opacity-50"
              />
              <CheckLinha
                checked={comoCoordenador}
                onChange={setComoCoordenador}
                label="Assinar como o coordenador de cada grupo"
              />
            </div>

            {/* Preview */}
            <div className="space-y-1.5 border-t border-line-soft pt-3">
              <div className="flex items-center justify-between">
                <label className="label-micro">Prévia {alvoPreview && <span className="text-ink-subtle normal-case font-normal">· {alvoPreview.nome}</span>}</label>
              </div>
              {preview ? (
                <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-subtle/60 p-3 text-[12.5px] leading-relaxed text-ink-secondary font-sans">
                  {preview}
                </pre>
              ) : (
                <p className="text-[12px] text-ink-muted py-3">Selecione ao menos um professor para ver a prévia.</p>
              )}
            </div>

            {/* Aviso de limite diário */}
            {destinatarios.length > restamHoje && (
              <p className="flex items-start gap-1.5 text-[11.5px] text-urg-highFg">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                {destinatarios.length} destinatários, mas só {restamHoje} e-mail(s) cabem hoje (limite {LIMITE_DIA}/dia). O excedente vai falhar — envie em levas.
              </p>
            )}
            {selSemEmail > 0 && (
              <p className="flex items-start gap-1.5 text-[11.5px] text-ink-muted">
                <MailWarning className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                {selSemEmail} selecionado(s) sem e-mail cadastrado — serão ignorados.
              </p>
            )}

            {/* Disparar */}
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!podeDisparar}
              className="w-full h-10 gap-2 bg-accentBlue text-white hover:opacity-90"
            >
              {enviar.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                : <><Send className="h-4 w-4" /> Enviar para {destinatarios.length} professor{destinatarios.length !== 1 ? 'es' : ''}</>}
            </Button>
            {!podeEnviar && (
              <p className="text-[11.5px] text-ink-muted text-center">Seu cargo não permite disparar e-mails.</p>
            )}
          </div>

          {resultado && <PainelResultado resultado={resultado} onFechar={() => setResultado(null)} />}
        </div>
      </div>

      {/* Confirmação */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-accentBlue" /> Confirmar disparo
            </DialogTitle>
            <DialogDescription>
              {modo === 'convocacao' ? 'Convocação padrão' : 'Mensagem personalizada'} para{' '}
              <strong className="text-ink">{destinatarios.length}</strong> professor(es) com e-mail.
              {selSemEmail > 0 && <> {selSemEmail} sem e-mail serão ignorados.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-surface-subtle/60 p-3 space-y-1">
            <p className="text-[12px] text-ink-muted">Assunto</p>
            <p className="text-[13px] text-ink font-medium">{assuntoEfetivo}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={dispararAgora} className="gap-2 bg-accentBlue text-white hover:opacity-90">
              <Send className="h-4 w-4" /> Enviar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Subcomponentes ────────────────────────────────────────────────────────────

function MetricCell({ label, valor, tone = 'neutral' }: {
  label: string; valor: number; tone?: 'neutral' | 'accent' | 'low' | 'high'
}) {
  const cls = tone === 'accent' ? 'text-accentBlue' : tone === 'high' ? 'text-urg-highFg' : tone === 'low' ? 'text-urg-lowFg' : 'text-ink'
  return (
    <div className="bg-surface-canvas px-4 py-3">
      <div className={cn('text-xl font-semibold tabular-nums leading-none', cls)}>{valor}</div>
      <div className="mt-1 text-[11px] text-ink-muted">{label}</div>
    </div>
  )
}

function QuotaBar({ quota }: { quota?: QuotaHoje }) {
  const limite = quota?.limite ?? LIMITE_DIA
  const usados = quota?.usados
  const restantes = quota?.restantes
  const pct = usados != null ? Math.min(100, Math.round((usados / limite) * 100)) : 0
  const esgotado = restantes != null && restantes <= 0
  const baixo = restantes != null && restantes > 0 && restantes <= 30
  const barCor = esgotado ? 'var(--urg-high-fg)' : baixo ? 'var(--urg-med-fg)' : 'var(--urg-low-fg)'
  return (
    <div className="card-surface px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-1.5 text-ink-secondary">
        <Gauge className="h-4 w-4" />
        <span className="label-micro">E-mails enviados hoje</span>
      </div>
      <div className="flex-1 min-w-[160px] h-2 rounded-full bg-surface-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barCor }} />
      </div>
      <div className="text-[12.5px] tabular-nums text-ink-secondary">
        <span className="font-semibold text-ink">{usados ?? '—'}</span> / {limite} enviados
        {' · '}
        <span className={cn('font-semibold', esgotado ? 'text-urg-highFg' : baixo ? 'text-urg-medFg' : 'text-urg-lowFg')}>
          {restantes ?? '—'}
        </span> restantes
      </div>
    </div>
  )
}

function FiltroSelect({ valor, onChange, opcoes, prefixo }: {
  valor: string; onChange: (v: string) => void
  opcoes: { value: string; label: string }[]; prefixo?: string
}) {
  const sel = opcoes.find(o => o.value === valor)
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-fit min-w-[132px] bg-surface-canvas border-line text-[12.5px]">
        <SelectValue>
          {prefixo ? <span className="text-ink-muted">{prefixo}: <span className="text-ink">{sel?.label}</span></span> : sel?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {opcoes.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function LinhaProfessor({ r, selecionado, onToggle }: {
  r: PainelProfessor; selecionado: boolean; onToggle: () => void
}) {
  const score = scoreVisual(r.score_atual)
  const semEmail = !r.email
  return (
    <tr className={cn(
      'border-b border-line-soft last:border-0 transition-colors',
      selecionado ? 'bg-accentBlue-soft/40' : 'hover:bg-surface-subtle/50',
      semEmail && 'opacity-60',
    )}>
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          checked={selecionado}
          disabled={semEmail}
          onChange={onToggle}
          aria-label={`Selecionar ${r.nome}`}
          className="h-4 w-4 rounded border-line align-middle disabled:cursor-not-allowed"
          style={{ accentColor: 'var(--accent-blue)' }}
        />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/professores/${r.professor_id}`} className="text-ink font-medium hover:text-accentBlue hover:underline">
            {r.nome}
          </Link>
          {semEmail && (
            <span className="inline-flex items-center gap-1 rounded-full bg-urg-medBg text-urg-medFg px-2 py-0.5 text-[10px] font-medium">
              <MailWarning className="h-2.5 w-2.5" /> sem e-mail
            </span>
          )}
          {r.elegivel_alocacao === false && (
            <span title="Bloqueado para receber novos alunos" className="inline-flex items-center gap-1 rounded-full bg-urg-highBg text-urg-highFg px-2 py-0.5 text-[10px] font-medium">
              <Ban className="h-2.5 w-2.5" /> bloqueado
            </span>
          )}
        </div>
        <div className="text-[11px] text-ink-muted mt-0.5">
          {r.grupo_nome ?? 'Sem coordenação'}{r.email ? ` · ${r.email}` : ''}
        </div>
      </td>
      <td className="px-3 py-2.5 text-center">
        {r.score_atual != null ? (
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums', score.tagClass)}>
            {score.label}
          </span>
        ) : <span className="text-ink-muted">—</span>}
      </td>
      <td className="px-3 py-2.5 text-center tabular-nums font-medium text-ink">
        {r.aulas_pendentes_qtd > 0 ? r.aulas_pendentes_qtd : <span className="text-ink-muted font-normal">—</span>}
      </td>
      <td className="px-3 py-2.5 text-center">
        {r.dias_sem_reuniao == null ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-urg-medFg font-medium">
            <CalendarClock className="h-3 w-3" /> nunca
          </span>
        ) : (
          <span className={cn('tabular-nums font-medium', r.dias_sem_reuniao >= 30 ? 'text-urg-highFg' : r.dias_sem_reuniao >= 14 ? 'text-urg-medFg' : 'text-ink-secondary')}>
            {r.dias_sem_reuniao}d
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', r.nivel.tagClass)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', r.nivel.dotClass)} />
          {r.nivel.label}
        </span>
      </td>
    </tr>
  )
}

function ModoBotao({ ativo, onClick, icon, label }: {
  ativo: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'btn-press inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium transition-colors',
        ativo ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
      )}
    >
      {icon} {label}
    </button>
  )
}

function CheckLinha({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label: string
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-line"
        style={{ accentColor: 'var(--accent-blue)' }}
      />
      <span className="text-[12.5px] text-ink-secondary">{label}</span>
    </label>
  )
}

function PainelResultado({ resultado, onFechar }: { resultado: RespostaDisparo; onFechar: () => void }) {
  const problemas = resultado.resultados.filter(r => r.status !== 'enviado')
  return (
    <div className="card-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="label-micro flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-urg-lowFg" /> Resultado do disparo</h2>
        <button onClick={onFechar} className="btn-press text-ink-muted hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line-soft bg-line-soft">
        <MetricCell label="Enviados" valor={resultado.enviados} tone="low" />
        <MetricCell label="Falhas" valor={resultado.falhas} tone={resultado.falhas > 0 ? 'high' : 'neutral'} />
        <MetricCell label="Sem e-mail" valor={resultado.sem_email} tone={resultado.sem_email > 0 ? 'high' : 'neutral'} />
      </div>
      {problemas.length > 0 && (
        <ul className="space-y-1 max-h-40 overflow-y-auto">
          {problemas.map(p => (
            <li key={p.professor_id} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-ink truncate">{p.nome}</span>
              <span className={cn('flex-shrink-0 text-[11px] font-medium', p.status === 'sem_email' ? 'text-ink-muted' : 'text-urg-highFg')}>
                {p.status === 'sem_email' ? 'sem e-mail' : 'falha'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function HistoricoDisparos() {
  const [aberto, setAberto] = useState(false)
  const { data: registros = [] } = useHistoricoDisparos(60)

  const lotes = useMemo(() => {
    const mapa = new Map<string, { quando: string; assunto: string; tipo: string; total: number; ok: number }>()
    for (const r of registros as DisparoRegistro[]) {
      const chave = r.lote_id ?? r.id
      const g = mapa.get(chave) ?? { quando: r.created_at, assunto: r.assunto, tipo: r.tipo, total: 0, ok: 0 }
      g.total++; if (r.sucesso) g.ok++
      if (new Date(r.created_at) > new Date(g.quando)) g.quando = r.created_at
      mapa.set(chave, g)
    }
    return [...mapa.values()].sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime())
  }, [registros])

  if (registros.length === 0) return null

  return (
    <div className="space-y-2">
      <button
        onClick={() => setAberto(v => !v)}
        className="btn-press inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-secondary hover:text-ink transition-colors"
      >
        <ChevronDown className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')} />
        <History className="h-3.5 w-3.5" />
        {aberto ? 'Ocultar histórico' : `Histórico de disparos (${lotes.length})`}
      </button>
      {aberto && (
        <div className="card-surface divide-y divide-line-soft">
          {lotes.slice(0, 20).map((l, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[12.5px] text-ink font-medium truncate">{l.assunto}</p>
                <p className="text-[11px] text-ink-muted">
                  {new Date(l.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  {' · '}{l.tipo === 'convocacao' ? 'Convocação' : 'Personalizada'}
                </p>
              </div>
              <span className="flex-shrink-0 text-[12px] tabular-nums text-ink-secondary">
                <span className="text-urg-lowFg font-semibold">{l.ok}</span>/{l.total}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b border-line-soft last:border-0">
          <td className="px-3 py-3"><div className="h-4 w-4 rounded bg-surface-subtle animate-pulse" /></td>
          <td className="px-3 py-3"><div className="h-4 w-44 rounded bg-surface-subtle animate-pulse" /></td>
          {Array.from({ length: 4 }).map((_, j) => (
            <td key={j} className="px-3 py-3"><div className="h-4 w-12 mx-auto rounded bg-surface-subtle animate-pulse" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}
