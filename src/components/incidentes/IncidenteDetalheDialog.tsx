import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { GraduationCap, User2, UserCog, CalendarClock, CheckCircle2, Pencil, Ticket, Copy, Check, AlertTriangle, Hourglass, Clock, Eye, EyeOff, History } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { tiStatusLabel } from '@/lib/nexusLabels'
import { cn } from '@/lib/utils'
import {
  statusChamado, natureza as naturezaDe, abaDoIncidente, useHistoricoPrioridade, useCienteInforme, type Incidente,
} from '@/hooks/useIncidentes'
import { PRIORIDADE_META, normalizarPrioridade, duracaoCurta } from '@/lib/incidentePrioridade'
import { buildMensagemIncidente } from '@/lib/incidenteMensagem'
import { idKing, rotuloAluno } from '@/lib/incidenteRelato'
import { atributosChamadoTi } from '@/lib/chamadoTi'
import { useAgora } from '@/hooks/useAgora'

const STATUS_DETALHE: Record<string, { label: string; cls: string }> = {
  aberto:       { label: 'Em aberto',    cls: 'bg-urg-medBg text-urg-medFg' },
  em_andamento: { label: 'Em andamento', cls: 'bg-accentBlue-soft text-accentBlue' },
  concluido:    { label: 'Concluído',    cls: 'bg-urg-lowBg text-urg-lowFg' },
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  incidente: Incidente | null
  podeEditar?: boolean
  onEditar?: () => void
}

function dataFmt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function IncidenteDetalheDialog({ open, onOpenChange, incidente, podeEditar, onEditar }: Props) {
  const navigate = useNavigate()
  const [copiado, setCopiado] = useState(false)
  const { data: historico = [] } = useHistoricoPrioridade(open ? incidente?.id : null)
  const ciente = useCienteInforme()
  const agora = useAgora()
  if (!incidente) return null
  const inc = incidente

  const isInforme = naturezaDe(incidente) === 'informe'
  const isPlataforma = abaDoIncidente(incidente) === 'plataforma'
  const nivel = normalizarPrioridade(incidente.urgency)
  const nivelMeta = PRIORIDADE_META[nivel]

  async function copiarMensagem() {
    try {
      await navigator.clipboard.writeText(buildMensagemIncidente(inc))
      setCopiado(true)
      toast.success('Incidente copiado como mensagem.')
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      toast.error('Não foi possível copiar.')
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          {...atributosChamadoTi(incidente)}
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

          <div className="flex items-center gap-1.5 flex-wrap pr-8">
            <DialogPrimitive.Title className="text-ink font-semibold text-[14.5px]">{incidente.teacher_name}</DialogPrimitive.Title>
            <span
              title={isInforme ? nivelMeta.importancia : nivelMeta.criterio}
              className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium', nivelMeta.chip)}
            >
              {(nivel === 'Urgente' || nivel === 'Alta') && <AlertTriangle className="h-3 w-3" />}{nivel}
            </span>
            {(() => {
              const meta = STATUS_DETALHE[statusChamado(incidente)]
              return (
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium', meta.cls)}>
                  {incidente.resolved && <CheckCircle2 className="h-3 w-3" />}{meta.label}
                </span>
              )
            })()}
            {isInforme && (
              <span className="inline-flex items-center rounded-full bg-surface-muted text-ink-muted px-2 py-0.5 text-[10.5px] font-medium">
                Informe
              </span>
            )}
            {isPlataforma && incidente.ti_status && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accentBlue-soft/60 text-accentBlue px-2 py-0.5 text-[10.5px] font-medium">
                <Ticket className="h-3 w-3" />{tiStatusLabel[incidente.ti_status] ?? incidente.ti_status}
              </span>
            )}
          </div>

          <div className="space-y-4 flex-1">
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-muted">
            <span className="inline-flex items-center gap-1"><User2 className="h-3.5 w-3.5" />{incidente.coordinator}</span>
            <span className="inline-flex items-center gap-1" title="Registrado em"><CalendarClock className="h-3.5 w-3.5" />{dataFmt(incidente.created_at)}</span>
            <span className="inline-flex items-center rounded-full bg-surface-subtle text-ink-secondary px-2 py-0.5 text-[11px] font-medium">
              {incidente.problem_type}
            </span>
          </div>

          {nivel === 'Urgente' && incidente.urgencia_justificativa && (
            <div className="rounded-lg border border-urg-critFg bg-urg-critBg px-3 py-2">
              <p className="text-[11px] font-medium text-urg-critFg flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />Por que é urgente
              </p>
              <p className="text-[12.5px] text-urg-critFg mt-0.5">{incidente.urgencia_justificativa}</p>
            </div>
          )}

          {/* Os dois relógios do chamado. Informe não tem prazo: tem leitura. */}
          {isInforme ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
              <p className="text-[12px] text-ink-secondary">
                {incidente.ciente_em
                  ? <>Lido{incidente.ciente_por_nome ? <> por <strong className="font-medium text-ink">{incidente.ciente_por_nome}</strong></> : ''} em {dataFmt(incidente.ciente_em)}</>
                  : <>Informe <strong className="font-medium text-ink">novo</strong>: ninguém marcou como lido ainda.</>}
              </p>
              {podeEditar && (
                <Button
                  variant="outline"
                  size="sm"
                  className="btn-press h-7 text-[11.5px] border-line gap-1"
                  disabled={ciente.isPending}
                  onClick={() => ciente.mutate(
                    { id: inc.id, ciente: !inc.ciente_em },
                    {
                      onSuccess: () => { toast.success(inc.ciente_em ? 'Informe voltou a ficar como novo.' : 'Informe marcado como lido.'); onOpenChange(false) },
                      onError: e => toast.error(e instanceof Error ? e.message : 'Erro ao marcar o informe.'),
                    },
                  )}
                >
                  {incidente.ciente_em ? <><EyeOff className="h-3.5 w-3.5" />Marcar como novo</> : <><Eye className="h-3.5 w-3.5" />Ciente</>}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  icone: Hourglass, rotulo: '1ª ação', prazo: incidente.prazo_primeira_acao, feito: incidente.primeira_acao_em,
                  regra: `assumir ${nivelMeta.primeiraAcao}`,
                },
                {
                  icone: Clock, rotulo: 'Resolução', prazo: incidente.prazo_resolucao, feito: incidente.resolved ? incidente.resolved_at : null,
                  regra: `resolver ${nivelMeta.resolucao}`,
                },
              ].map(r => {
                const prazoMs = r.prazo ? new Date(r.prazo).getTime() : null
                const feitoMs = r.feito ? new Date(r.feito).getTime() : null
                const vencido = prazoMs !== null && (feitoMs !== null ? feitoMs > prazoMs : prazoMs < agora)
                const Icone = r.icone
                return (
                  <div key={r.rotulo} className={cn('rounded-lg border px-3 py-2', vencido ? 'border-urg-critFg' : 'border-line')}>
                    <p className="text-[11px] text-ink-muted flex items-center gap-1"><Icone className="h-3 w-3" />{r.rotulo}</p>
                    {prazoMs === null ? (
                      <p className="text-[12px] text-ink-subtle">sem prazo</p>
                    ) : feitoMs !== null ? (
                      <p className={cn('text-[12px] font-medium', vencido ? 'text-urg-critFg' : 'text-urg-lowFg')}>
                        {vencido ? `fora do prazo (${duracaoCurta(feitoMs - prazoMs)} depois)` : 'no prazo'}
                      </p>
                    ) : (
                      <p className={cn('text-[12px] font-medium', vencido ? 'text-urg-critFg' : 'text-ink')}>
                        {vencido ? `venceu há ${duracaoCurta(prazoMs - agora)}` : `até ${dataFmt(r.prazo!)}`}
                      </p>
                    )}
                    <p className="text-[10.5px] text-ink-subtle">{nivel}: {r.regra}</p>
                  </div>
                )
              })}
            </div>
          )}

          {incidente.responsavel_nome && (
            <div className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary">
              <UserCog className="h-3.5 w-3.5 text-ink-muted" />
              Responsável: <strong className="font-medium text-ink">{incidente.responsavel_nome}</strong>
            </div>
          )}

          {/* Identificação: é o que uma equipe de fora (TI, escola) precisa pra
              saber de QUEM se trata — nome sozinho não identifica ninguém. */}
          <div className="flex flex-wrap items-center gap-2">
            {incidente.professor_id && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-subtle text-ink-secondary px-2.5 py-1 text-[12px] font-medium">
                <User2 className="h-3.5 w-3.5" />
                Professor {idKing(incidente.professor_kms_id) ? `King ${idKing(incidente.professor_kms_id)}` : 'sem ID no King'}
              </span>
            )}
            {rotuloAluno(incidente) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accentBlue-soft/60 text-accentBlue px-2.5 py-1 text-[12px] font-medium">
                <GraduationCap className="h-3.5 w-3.5" />Aluno: {rotuloAluno(incidente)}
              </span>
            )}
          </div>

          <div className="text-[12px] text-ink-secondary">
            {incidente.ocorrido_em ? (
              <>Aconteceu em <strong className="font-medium text-ink">{dataFmt(incidente.ocorrido_em)}</strong></>
            ) : (
              <span className="text-ink-muted">Quando aconteceu: não informado (registrado em {dataFmt(incidente.created_at)})</span>
            )}
          </div>

          {!incidente.resolved && incidente.assumido_por_nome && (
            <p className="text-[12px] text-accentBlue">
              Sendo resolvido por <strong>{incidente.assumido_por_nome}</strong>
              {incidente.assumido_em && <> desde {dataFmt(incidente.assumido_em)}</>}
            </p>
          )}

          <div className="space-y-1">
            <p className="label-micro">Qual é o problema</p>
            <p className="text-[13.5px] text-ink-secondary whitespace-pre-wrap">{incidente.description}</p>
          </div>

          {incidente.passos?.trim() && (
            <div className="space-y-1">
              <p className="label-micro">Como aconteceu</p>
              <p className="text-[13.5px] text-ink-secondary whitespace-pre-wrap">{incidente.passos}</p>
            </div>
          )}

          {incidente.resolved && incidente.solution && (
            <div className="space-y-1">
              <p className="label-micro">Solução / resultado</p>
              <p className="text-[13.5px] text-ink-secondary whitespace-pre-wrap">{incidente.solution}</p>
              {incidente.resolved_at && (
                <p className="text-[11px] text-ink-muted">
                  Concluído em {dataFmt(incidente.resolved_at)}
                  {incidente.assumido_por_nome && <> por {incidente.assumido_por_nome}</>}
                </p>
              )}
            </div>
          )}

          {historico.length > 0 && (
            <div className="space-y-1">
              <p className="label-micro flex items-center gap-1"><History className="h-3 w-3" />Prioridade</p>
              <ol className="space-y-1">
                {historico.map(h => (
                  <li key={h.id} className="text-[12px] text-ink-secondary">
                    <span className="text-ink-muted tabular-nums">{dataFmt(h.alterado_em)}</span>
                    {' · '}
                    {h.de ? <>{h.de} → <strong className="font-medium text-ink">{h.para}</strong></> : <>registrado como <strong className="font-medium text-ink">{h.para}</strong></>}
                    {h.alterado_por_nome && <> por {h.alterado_por_nome}</>}
                    {h.justificativa && h.para === 'Urgente' && <span className="block text-[11.5px] text-ink-muted">"{h.justificativa}"</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {incidente.image_urls.length > 0 && (
            <div className="space-y-1">
              <p className="label-micro">Anexos</p>
              <div className="flex flex-wrap gap-2">
                {incidente.image_urls.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-16 w-16 overflow-hidden rounded-md border border-line hover:opacity-90"
                  >
                    <img src={url} alt={`Anexo ${idx + 1}`} loading="lazy" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {/* Ponto de encaixe do botão "Abrir chamado no TI" da extensão. */}
            <span data-ktm-chamado-slot="" className="contents" />
            <Button
              variant="outline"
              size="sm"
              className="btn-press h-8 text-[12px] border-line gap-1.5"
              onClick={copiarMensagem}
              title="Copiar todo o incidente como mensagem para enviar a outra equipe"
            >
              {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiado ? 'Copiado' : 'Copiar mensagem'}
            </Button>
            {podeEditar && onEditar && (
              <Button
                variant="outline"
                size="sm"
                className="btn-press h-8 text-[12px] border-line gap-1.5"
                onClick={onEditar}
              >
                <Pencil className="h-3.5 w-3.5" />Editar
              </Button>
            )}
            {incidente.professor_id && (
              <Button
                variant="outline"
                size="sm"
                className="btn-press h-8 text-[12px] border-line"
                onClick={() => { onOpenChange(false); navigate(`/professores/${incidente.professor_id}`) }}
              >
                Ver professor
              </Button>
            )}
          </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
