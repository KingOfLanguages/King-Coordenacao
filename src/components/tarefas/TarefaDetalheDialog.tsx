import { useNavigate } from 'react-router-dom'
import { Dialog as DialogPrimitive } from 'radix-ui'
import {
  GraduationCap, User2, UserCog, CalendarClock, CheckCircle2, Ticket,
  Play, Check, Undo2, Loader2, Paperclip,
} from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { urgenciaChip } from '@/lib/nexusLabels'
import { cn } from '@/lib/utils'
import { useIncidente, statusChamado } from '@/hooks/useIncidentes'
import type { Tarefa, TarefaStatus } from '@/hooks/useTarefas'

const STATUS_TAREFA: Record<TarefaStatus, { label: string; cls: string }> = {
  aberto:       { label: 'Aberto',       cls: 'bg-urg-medBg text-urg-medFg' },
  em_andamento: { label: 'Em andamento', cls: 'bg-accentBlue-soft text-accentBlue' },
  concluido:    { label: 'Concluído',    cls: 'bg-urg-lowBg text-urg-lowFg' },
}

function dataFmt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  tarefa: Tarefa | null
  podeMover: boolean
  onMover: (status: TarefaStatus) => void
  movendo?: boolean
}

export function TarefaDetalheDialog({ open, onOpenChange, tarefa, podeMover, onMover, movendo }: Props) {
  const navigate = useNavigate()
  const { data: incidente, isLoading: carregandoInc } = useIncidente(tarefa?.incidente_id)

  if (!tarefa) return null
  const st = STATUS_TAREFA[tarefa.status]
  const temIncidente = !!tarefa.incidente_id

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
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

          {/* Cabeçalho da tarefa */}
          <div className="flex items-center gap-1.5 flex-wrap pr-8">
            <DialogPrimitive.Title className="text-ink font-semibold text-[14.5px]">{tarefa.titulo}</DialogPrimitive.Title>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium', st.cls)}>
              {tarefa.status === 'concluido' && <CheckCircle2 className="h-3 w-3" />}{st.label}
            </span>
            {temIncidente && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft text-brand-strong px-2 py-0.5 text-[10.5px] font-medium">
                <Ticket className="h-3 w-3" />Desafio
              </span>
            )}
          </div>

          <div className="space-y-4 flex-1">
            {/* Meta: quem abriu, quem resolve, datas */}
            <div className="space-y-1.5 text-[12px] text-ink-muted">
              {tarefa.criador?.nome && (
                <span className="flex items-center gap-1.5"><User2 className="h-3.5 w-3.5" />Aberta por <strong className="font-medium text-ink-secondary">{tarefa.criador.nome}</strong></span>
              )}
              <span className="flex items-center gap-1.5">
                <UserCog className="h-3.5 w-3.5" />
                {tarefa.responsavel?.nome
                  ? <>Resolvendo: <strong className="font-medium text-ink-secondary">{tarefa.responsavel.nome}</strong></>
                  : tarefa.atribuido_time
                    ? <>Time: <strong className="font-medium text-ink-secondary">{tarefa.atribuido_time === 'coordenacao' ? 'Coordenação' : 'Suporte'}</strong></>
                    : <>Sem responsável</>}
              </span>
              <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />Criada em {dataFmt(tarefa.created_at)}</span>
              {tarefa.status === 'concluido' && tarefa.concluido_em && (
                <span className="flex items-center gap-1.5 text-urg-lowFg">
                  <CheckCircle2 className="h-3.5 w-3.5" />Concluída em {dataFmt(tarefa.concluido_em)}
                  {tarefa.concluidor?.nome && <> por {tarefa.concluidor.nome}</>}
                </span>
              )}
            </div>

            {tarefa.descricao && !temIncidente && (
              <div className="space-y-1">
                <p className="label-micro">Descrição</p>
                <p className="text-[13.5px] text-ink-secondary whitespace-pre-wrap">{tarefa.descricao}</p>
              </div>
            )}

            {/* Bloco do incidente (desafio) — todas as infos + fotos */}
            {temIncidente && (
              <div className="rounded-xl border border-line-soft bg-surface-subtle/40 p-3.5 space-y-3">
                <p className="label-micro flex items-center gap-1.5"><Ticket className="h-3 w-3" />Do desafio</p>

                {carregandoInc ? (
                  <div className="flex items-center gap-2 text-[12px] text-ink-muted py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando informações do desafio…
                  </div>
                ) : !incidente ? (
                  <p className="text-[12px] text-ink-muted">Não foi possível carregar o desafio (pode ter sido removido ou você não tem acesso).</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                      <span className="inline-flex items-center rounded-full bg-surface-subtle text-ink-secondary px-2 py-0.5 text-[11px] font-medium">
                        {incidente.problem_type}
                      </span>
                      {incidente.urgency && (
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-medium', urgenciaChip[incidente.urgency] ?? 'bg-surface-subtle text-ink-secondary')}>
                          {incidente.urgency}
                        </span>
                      )}
                      {(() => {
                        const s = statusChamado(incidente)
                        const meta = STATUS_TAREFA[s]
                        return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', meta.cls)}>{meta.label}</span>
                      })()}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                      <span className="inline-flex items-center gap-1"><User2 className="h-3.5 w-3.5" />{incidente.teacher_name}</span>
                      {incidente.aluno_nome && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accentBlue-soft/60 text-accentBlue px-2 py-0.5 text-[11px] font-medium">
                          <GraduationCap className="h-3.5 w-3.5" />{incidente.aluno_nome}
                        </span>
                      )}
                    </div>

                    {!incidente.resolved && incidente.assumido_por_nome && (
                      <p className="text-[12px] text-accentBlue">
                        Sendo resolvido por <strong>{incidente.assumido_por_nome}</strong>
                        {incidente.assumido_em && <> desde {dataFmt(incidente.assumido_em)}</>}
                      </p>
                    )}

                    <div className="space-y-1">
                      <p className="label-micro">Descrição</p>
                      <p className="text-[13.5px] text-ink-secondary whitespace-pre-wrap">{incidente.description}</p>
                    </div>

                    {incidente.resolved && incidente.solution && (
                      <div className="space-y-1">
                        <p className="label-micro">Solução / resultado</p>
                        <p className="text-[13.5px] text-ink-secondary whitespace-pre-wrap">{incidente.solution}</p>
                      </div>
                    )}

                    {/* Fotos anexadas ao desafio */}
                    {incidente.image_urls.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="label-micro flex items-center gap-1.5"><Paperclip className="h-3 w-3" />Fotos ({incidente.image_urls.length})</p>
                        <div className="grid grid-cols-3 gap-2">
                          {incidente.image_urls.map((url, idx) => (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block aspect-square overflow-hidden rounded-lg border border-line hover:opacity-90"
                              title="Abrir foto"
                            >
                              <img src={url} alt={`Foto ${idx + 1}`} loading="lazy" className="h-full w-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11.5px] text-ink-subtle italic">Sem fotos anexadas.</p>
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
                  </>
                )}
              </div>
            )}
          </div>

          {/* Ações de status (Kanban) */}
          {podeMover && (
            <div className="flex flex-wrap gap-2 border-t border-line-soft pt-3">
              {tarefa.status !== 'em_andamento' && tarefa.status !== 'concluido' && (
                <Button
                  size="sm" disabled={movendo}
                  onClick={() => onMover('em_andamento')}
                  className="btn-press h-8 flex-1 gap-1.5 bg-accentBlue text-white hover:bg-accentBlue-hov text-[12px]"
                >
                  <Play className="h-3.5 w-3.5" />Começar a resolver
                </Button>
              )}
              {tarefa.status !== 'concluido' ? (
                <Button
                  size="sm" disabled={movendo}
                  onClick={() => onMover('concluido')}
                  className="btn-press h-8 flex-1 gap-1.5 bg-urg-lowFg text-white hover:opacity-90 text-[12px]"
                >
                  <Check className="h-3.5 w-3.5" />{temIncidente ? 'Resolver' : 'Concluir'}
                </Button>
              ) : (
                <Button
                  variant="outline" size="sm" disabled={movendo}
                  onClick={() => onMover('aberto')}
                  className="btn-press h-8 flex-1 gap-1.5 border-line text-ink-secondary hover:text-ink text-[12px]"
                >
                  <Undo2 className="h-3.5 w-3.5" />Reabrir
                </Button>
              )}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
