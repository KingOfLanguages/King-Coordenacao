import { useNavigate } from 'react-router-dom'
import { GraduationCap, User2, CalendarClock, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { urgenciaChip } from '@/lib/nexusLabels'
import { cn } from '@/lib/utils'
import type { Incidente } from '@/hooks/useIncidentes'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  incidente: Incidente | null
}

function dataFmt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function IncidenteDetalheDialog({ open, onOpenChange, incidente }: Props) {
  const navigate = useNavigate()
  if (!incidente) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-canvas border-line text-ink max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap pr-6">
            <DialogTitle className="text-ink font-semibold text-[15px]">{incidente.teacher_name}</DialogTitle>
            <span className={cn('inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium', urgenciaChip[incidente.urgency] ?? 'bg-surface-subtle text-ink-secondary')}>
              {incidente.urgency}
            </span>
            {incidente.resolved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-urg-lowBg text-urg-lowFg px-2 py-0.5 text-[11px] font-medium">
                <CheckCircle2 className="h-3 w-3" />Resolvido
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-urg-highBg text-urg-highFg px-2 py-0.5 text-[11px] font-medium">
                Aberto
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="space-y-1">
            <p className="label-micro">Descrição</p>
            <p className="text-[13.5px] text-ink-secondary whitespace-pre-wrap">{incidente.description}</p>
          </div>

          {incidente.resolved && incidente.solution && (
            <div className="space-y-1">
              <p className="label-micro">Solução / resultado</p>
              <p className="text-[13.5px] text-ink-secondary whitespace-pre-wrap">{incidente.solution}</p>
              {incidente.resolved_at && (
                <p className="text-[11px] text-ink-muted">Resolvido em {dataFmt(incidente.resolved_at)}</p>
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

          {incidente.professor_id && (
            <div className="flex justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                className="btn-press h-8 text-[12px] border-line"
                onClick={() => { onOpenChange(false); navigate(`/professores/${incidente.professor_id}`) }}
              >
                Ver professor
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
