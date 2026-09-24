import { useMemo, useState } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { toast } from 'sonner'
import {
  Mail, Send, X, Check, AlertTriangle, Loader2, Sparkles, PenLine, ChevronDown, MailWarning, MailCheck, History, Gauge,
} from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import type { PainelProfessor } from '@/hooks/usePainelProfessores'
import {
  useEnviarEmailMassa, useHistoricoDisparos, useEmailQuotaHoje, diaMes, CARENCIA_EMAIL_DIAS,
  type MensagemAlvo, type RespostaDisparo, type DisparoRegistro, type QuotaHoje,
} from '@/hooks/useEnviarEmailMassa'
import {
  montarCorpoConvocacao, montarCorpoPersonalizado, TOKENS,
  ASSUNTO_CONVOCACAO_PADRAO, ASSUNTO_PERSONALIZADO_PADRAO, type AlvoEmail,
} from '@/lib/convocacaoEmail'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Painel de e-mail do Acompanhamento. Era a página /emails ("Disparo de
// E-mails"), que repetia a lista de professores e os mesmos filtros do Índice.
// Agora a seleção acontece no próprio Índice e este painel lateral só compõe e
// envia: convocação padrão ou mensagem personalizada, com prévia, limite diário
// e histórico. O e-mail de destino é sempre resolvido no servidor (Edge Function).
// ─────────────────────────────────────────────────────────────────────────────

const LIMITE_DIA = 200   // limite diário de e-mails auto-imposto

type ModoMsg = 'convocacao' | 'personalizado'

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

interface Props {
  aberto: boolean
  onFechar: () => void
  /** Selecionados que têm e-mail — os destinatários reais. */
  destinatarios: PainelProfessor[]
  /** Selecionados sem e-mail cadastrado (serão ignorados). */
  semEmail: number
  /** Selecionados em carência de e-mail — receberam nos últimos 15 dias (ignorados). */
  emCarencia: number
  /** Enviou: o Índice limpa a seleção. */
  onEnviado: () => void
}

export function PainelEmail({ aberto, onFechar, destinatarios, semEmail, emCarencia, onEnviado }: Props) {
  const { profile } = useAuth()
  const { data: quota } = useEmailQuotaHoje()
  const enviar = useEnviarEmailMassa()

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

  const textoValido = modo === 'convocacao' || texto.trim().length > 0
  const podeDisparar = destinatarios.length > 0 && assuntoEfetivo.trim().length > 0 && textoValido && !enviar.isPending

  function corpoParaAlvo(r: PainelProfessor): string {
    const alvo = alvoDe(r)
    const opts = { assinatura, comoCoordenador }
    return modo === 'convocacao'
      ? montarCorpoConvocacao(alvo, { ...opts, incluirLink })
      : montarCorpoPersonalizado(texto, alvo, { ...opts, prefixarAssinatura })
  }

  const alvoPreview = destinatarios[0] ?? null
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
      onEnviado()
      const carencia = res.em_carencia ?? 0
      if (res.falhas === 0 && res.sem_email === 0 && carencia === 0) {
        toast.success(`${res.enviados} e-mail(s) enviado(s).`)
      } else {
        toast.warning(
          `${res.enviados} enviado(s), ${res.falhas} falha(s), ${res.sem_email} sem e-mail` +
          (carencia > 0 ? `, ${carencia} em carência.` : '.'),
        )
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao disparar e-mails.')
    }
  }

  function inserirToken(token: string) {
    setTexto(t => (t ? `${t}${t.endsWith(' ') || t.endsWith('\n') ? '' : ' '}${token}` : token))
  }

  return (
    <>
      <DialogPrimitive.Root open={aberto} onOpenChange={o => { if (!o) onFechar() }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Content
            className={cn(
              'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto',
              'bg-surface-canvas border-l border-line px-5 py-5 text-ink shadow-popover outline-none',
              'duration-200 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right',
            )}
          >
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                <span className="sr-only">Fechar</span>
              </Button>
            </DialogPrimitive.Close>

            <div className="pr-8">
              <DialogPrimitive.Title className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Mail className="h-4 w-4 text-accentBlue" />
                E-mail para {destinatarios.length} professor{destinatarios.length !== 1 ? 'es' : ''}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-[12px] text-ink-muted mt-0.5">
                A seleção vem da lista do Índice — feche o painel para ajustar.
              </DialogPrimitive.Description>
            </div>

            <QuotaBar quota={quota} />

            {resultado && <PainelResultado resultado={resultado} onFechar={() => setResultado(null)} />}

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
                <CheckLinha checked={incluirLink} onChange={setIncluirLink} label="Incluir link de agendamento" />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="label-micro">Mensagem</label>
                <textarea
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  rows={7}
                  placeholder="Escreva a mensagem… use os campos abaixo para personalizar por professor."
                  className="w-full rounded-lg border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle resize-y focus:outline-none focus:ring-2 focus:ring-accentBlue-soft"
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
                <CheckLinha checked={prefixarAssinatura} onChange={setPrefixarAssinatura} label="Iniciar com a assinatura em negrito" />
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
              <CheckLinha checked={comoCoordenador} onChange={setComoCoordenador} label="Assinar como o coordenador de cada grupo" />
            </div>

            {/* Prévia */}
            <div className="space-y-1.5 border-t border-line-soft pt-3">
              <label className="label-micro">Prévia {alvoPreview && <span className="text-ink-subtle normal-case font-normal">· {alvoPreview.nome}</span>}</label>
              {preview ? (
                <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-subtle p-3 text-[12.5px] leading-relaxed text-ink-secondary font-sans">
                  {preview}
                </pre>
              ) : (
                <p className="text-[12px] text-ink-muted py-3">Selecione ao menos um professor com e-mail para ver a prévia.</p>
              )}
            </div>

            {destinatarios.length > restamHoje && (
              <p className="flex items-start gap-1.5 text-[11.5px] text-urg-highFg">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                {destinatarios.length} destinatários, mas só {restamHoje} e-mail(s) cabem hoje (limite {LIMITE_DIA}/dia). O excedente vai falhar — envie em levas.
              </p>
            )}
            {semEmail > 0 && (
              <p className="flex items-start gap-1.5 text-[11.5px] text-ink-muted">
                <MailWarning className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                {semEmail} selecionado(s) sem e-mail cadastrado — serão ignorados.
              </p>
            )}
            {emCarencia > 0 && (
              <p className="flex items-start gap-1.5 text-[11.5px] text-ink-muted">
                <MailCheck className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                {emCarencia} selecionado(s) receberam e-mail nos últimos {CARENCIA_EMAIL_DIAS} dias — ficam de fora até a carência acabar.
              </p>
            )}

            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!podeDisparar}
              className="w-full h-10 gap-2 bg-accentBlue text-white hover:bg-accentBlue-hov"
            >
              {enviar.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                : <><Send className="h-4 w-4" /> Enviar para {destinatarios.length} professor{destinatarios.length !== 1 ? 'es' : ''}</>}
            </Button>

            <HistoricoDisparos />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

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
              {semEmail > 0 && <> {semEmail} sem e-mail serão ignorados.</>}
              {emCarencia > 0 && <> {emCarencia} em carência ficam de fora.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-surface-subtle p-3 space-y-1">
            <p className="text-[12px] text-ink-muted">Assunto</p>
            <p className="text-[13px] text-ink font-medium">{assuntoEfetivo}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={dispararAgora} className="gap-2 bg-accentBlue text-white hover:bg-accentBlue-hov">
              <Send className="h-4 w-4" /> Enviar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Subcomponentes ────────────────────────────────────────────────────────────

function MetricCell({ label, valor, tone = 'neutral' }: {
  label: string; valor: number; tone?: 'neutral' | 'accent' | 'low' | 'high'
}) {
  const cls = tone === 'accent' ? 'text-accentBlue' : tone === 'high' ? 'text-urg-highFg' : tone === 'low' ? 'text-urg-lowFg' : 'text-ink'
  return (
    <div className="bg-surface-canvas px-3 py-2.5">
      <div className={cn('text-lg font-semibold tabular-nums leading-none', cls)}>{valor}</div>
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
    <div className="rounded-lg border border-line-soft px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-ink-secondary"><Gauge className="h-3.5 w-3.5" /><span className="label-micro">Enviados hoje</span></span>
        <span className="text-[12px] tabular-nums text-ink-secondary">
          <span className="font-semibold text-ink">{usados ?? '—'}</span> / {limite} ·{' '}
          <span className={cn('font-semibold', esgotado ? 'text-urg-highFg' : baixo ? 'text-urg-medFg' : 'text-urg-lowFg')}>{restantes ?? '—'}</span> restantes
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barCor }} />
      </div>
    </div>
  )
}

function ModoBotao({ ativo, onClick, icon, label }: {
  ativo: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      type="button"
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
  // Inativos e carência são raros: só ganham célula quando aconteceram.
  const celulas = [
    { label: 'Enviados', valor: resultado.enviados, tone: 'low' as const },
    { label: 'Falhas', valor: resultado.falhas, tone: resultado.falhas > 0 ? 'high' as const : 'neutral' as const },
    { label: 'Sem e-mail', valor: resultado.sem_email, tone: resultado.sem_email > 0 ? 'high' as const : 'neutral' as const },
    ...((resultado.inativos ?? 0) > 0 ? [{ label: 'Inativos', valor: resultado.inativos, tone: 'high' as const }] : []),
    ...((resultado.em_carencia ?? 0) > 0 ? [{ label: 'Em carência', valor: resultado.em_carencia, tone: 'neutral' as const }] : []),
  ]
  return (
    <div className="rounded-lg border border-line-soft p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="label-micro flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-urg-lowFg" /> Resultado do último disparo</h2>
        <button type="button" onClick={onFechar} className="btn-press text-ink-muted hover:text-ink" aria-label="Fechar resultado"><X className="h-4 w-4" /></button>
      </div>
      <div
        className="grid gap-px overflow-hidden rounded-lg border border-line-soft bg-line-soft"
        style={{ gridTemplateColumns: `repeat(${celulas.length}, minmax(0, 1fr))` }}
      >
        {celulas.map(c => <MetricCell key={c.label} label={c.label} valor={c.valor} tone={c.tone} />)}
      </div>
      {problemas.length > 0 && (
        <ul className="space-y-1 max-h-40 overflow-y-auto">
          {problemas.map(p => (
            <li key={p.professor_id} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-ink truncate">{p.nome}</span>
              <span className={cn('flex-shrink-0 text-[11px] font-medium', p.status === 'falha' ? 'text-urg-highFg' : 'text-ink-muted')}>
                {p.status === 'sem_email' ? 'sem e-mail'
                  : p.status === 'inativo' ? 'não está mais ativo'
                  : p.status === 'carencia' ? `em carência${p.libera_em ? ` · libera ${diaMes(p.libera_em)}` : ''}`
                  : 'falha'}
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
    <div className="space-y-2 border-t border-line-soft pt-3">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="btn-press inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-secondary hover:text-ink transition-colors"
      >
        <ChevronDown className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')} />
        <History className="h-3.5 w-3.5" />
        {aberto ? 'Ocultar histórico' : `Histórico de disparos (${lotes.length})`}
      </button>
      {aberto && (
        <div className="rounded-lg border border-line-soft divide-y divide-line-soft">
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
