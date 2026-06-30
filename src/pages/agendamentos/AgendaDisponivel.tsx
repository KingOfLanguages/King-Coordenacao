import { useState } from 'react'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import type { AgendaDisponivel as AgendaDisponivelType, HorarioDisponivel } from '@/hooks/useTeacherLookup'

function formatDataHora(iso: string) {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Sao_Paulo' })
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  return { dia, hora }
}

export function AgendaDisponivel({
  professorNome, agendas, onConfirmar, pending,
}: {
  professorNome: string
  agendas: AgendaDisponivelType[]
  onConfirmar: (horarioId: string) => Promise<void>
  pending: boolean
}) {
  const [selecionado, setSelecionado] = useState<{ agenda: AgendaDisponivelType; horario: HorarioDisponivel } | null>(null)

  async function confirmar() {
    if (!selecionado) return
    await onConfirmar(selecionado.horario.id)
    setSelecionado(null)
  }

  if (agendas.length === 0) {
    return (
      <div className="w-full max-w-sm text-center space-y-2">
        <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink">Olá, {professorNome}!</h1>
        <p className="text-[14px] text-ink-muted">
          No momento não há reuniões disponíveis para você. Volte mais tarde ou fale com sua coordenação.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink">Olá, {professorNome}!</h1>
        <p className="text-[14px] text-ink-muted">Estas são as reuniões disponíveis para você.</p>
      </div>

      <div className="space-y-4">
        {agendas.map(agenda => (
          <div key={agenda.id} className="card-surface p-4 space-y-3">
            <div>
              <p className="text-[15px] font-semibold text-ink">{agenda.titulo}</p>
              {agenda.descricao && <p className="text-[12.5px] text-ink-muted">{agenda.descricao}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {agenda.horarios.map(h => {
                const { dia, hora } = formatDataHora(h.data_hora)
                return (
                  <button
                    key={h.id}
                    type="button"
                    disabled={h.ja_inscrito}
                    onClick={() => setSelecionado({ agenda, horario: h })}
                    className="flex flex-col items-start gap-1 rounded-xl border border-line-soft bg-surface-canvas
                               px-3.5 py-2.5 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/30
                               disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-line-soft disabled:hover:bg-surface-canvas"
                  >
                    <span className="text-[13px] font-medium text-ink capitalize">{dia}</span>
                    <span className="text-[12px] text-ink-secondary">{hora}</span>
                    <span className="flex items-center gap-1 text-[11px] text-ink-muted">
                      <Users className="h-3 w-3" />
                      {h.ja_inscrito ? 'Você já está inscrito' : `${h.vagas} vaga${h.vagas === 1 ? '' : 's'}`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!selecionado} onOpenChange={open => !open && setSelecionado(null)}>
        <DialogContent>
          {selecionado && (
            <>
              <DialogHeader>
                <DialogTitle>{selecionado.agenda.titulo}</DialogTitle>
                <DialogDescription>
                  {(() => {
                    const { dia, hora } = formatDataHora(selecionado.horario.data_hora)
                    return (
                      <>
                        <span className="capitalize">{dia}</span> às {hora}
                        {selecionado.agenda.coordenador && <> · com {selecionado.agenda.coordenador.nome}</>}
                      </>
                    )
                  })()}
                </DialogDescription>
              </DialogHeader>
              <p className="text-[13px] text-ink-secondary">Deseja confirmar sua participação?</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelecionado(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button onClick={confirmar} disabled={pending} className="bg-brand text-white hover:bg-brand-strong">
                  {pending ? 'Confirmando…' : 'Confirmar inscrição'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
