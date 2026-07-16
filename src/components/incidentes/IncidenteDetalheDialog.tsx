import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { GraduationCap, User2, CalendarClock, CheckCircle2, Pencil, Ticket, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { urgenciaChip, tiStatusLabel } from '@/lib/nexusLabels'
import { cn } from '@/lib/utils'
import { statusChamado, natureza as naturezaDe, abaDoIncidente, type Incidente } from '@/hooks/useIncidentes'
import { buildMensagemIncidente } from '@/lib/incidenteMensagem'

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
  if (!incidente) return null
  const inc = incidente

  const isInforme = naturezaDe(incidente) === 'informe'
  const isPlataforma = abaDoIncidente(incidente) === 'plataforma'

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
            <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-medium', urgenciaChip[incidente.urgency] ?? 'bg-surface-subtle text-ink-secondary')}>
              {incidente.urgency}
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
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{dataFmt(incidente.created_at)}</span>
            <span className="inline-flex items-center rounded-full bg-surface-subtle text-ink-secondary px-2 py-0.5 text-[11px] font-medium">
              {incidente.problem_type}
            </span>
          </div>

          {incidente.aluno_nome && (
            <div className="inline-flex items-center gap-1 rounded-full bg-accentBlue-soft/60 text-accentBlue px-2.5 py-1 text-[12px] font-medium">
              <GraduationCap className="h-3.5 w-3.5" />Aluno: {incidente.aluno_nome}
            </div>
          )}

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
              {incidente.resolved_at && (
                <p className="text-[11px] text-ink-muted">
                  Concluído em {dataFmt(incidente.resolved_at)}
                  {incidente.assumido_por_nome && <> por {incidente.assumido_por_nome}</>}
                </p>
              )}
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
