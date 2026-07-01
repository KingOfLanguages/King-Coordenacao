import { useState } from 'react'
import { CalendarClock, Info, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useAtualizarMeusLinks } from '@/hooks/useMeusLinksAgendamento'

// ─────────────────────────────────────────────────────────────────────────────
// Links individuais do coordenador para o Portal de Agendamento (/agendar).
// O professor nunca escolhe ou vê esses links diretamente — o portal resolve
// o coordenador responsável pelo professor e usa esses links automaticamente.
// ─────────────────────────────────────────────────────────────────────────────

export function MeusLinksAgendamentoCard() {
  const { profile } = useAuth()
  const atualizar = useAtualizarMeusLinks()

  const [koalendar, setKoalendar]   = useState(profile?.koalendar_link ?? '')
  const [googleAppt, setGoogleAppt] = useState(profile?.google_appointment_link ?? '')

  if (!profile || (profile.role !== 'coordenacao' && profile.role !== 'admin')) return null

  const dirty =
    koalendar.trim() !== (profile.koalendar_link ?? '') ||
    googleAppt.trim() !== (profile.google_appointment_link ?? '')

  async function salvar() {
    try {
      await atualizar.mutateAsync({
        koalendar_link: koalendar.trim() || null,
        google_appointment_link: googleAppt.trim() || null,
      })
      toast.success('Links de agendamento atualizados.')
    } catch {
      toast.error('Erro ao salvar os links.')
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-ink-secondary" />
        <h2 className="text-[15px] font-semibold text-ink">Meus links de agendamento individual</h2>
      </div>

      <div className="card-surface p-5 space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-line-soft bg-surface-subtle/60 px-3.5 py-2.5">
          <Info className="h-3.5 w-3.5 text-accentBlue flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-ink-secondary leading-relaxed">
            Usados pelo Portal de Agendamento para direcionar automaticamente cada professor do seu grupo.
            Configure o calendário de destino do Koalendar e do Google Appointment Schedule para o mesmo
            calendário Google conectado à King — reuniões marcadas por lá só aparecem no sistema se o
            destino for esse calendário.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="koalendar" className="text-[12px] text-ink-secondary font-medium">
              Link do Koalendar (1ª reunião)
            </Label>
            <Input
              id="koalendar"
              value={koalendar}
              onChange={e => setKoalendar(e.target.value)}
              placeholder="https://koalendar.com/e/..."
              className="h-9 text-[13px] bg-surface-canvas border-line"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="google-appt" className="text-[12px] text-ink-secondary font-medium">
              Link do Google Appointment Schedule (Acompanhamento)
            </Label>
            <Input
              id="google-appt"
              value={googleAppt}
              onChange={e => setGoogleAppt(e.target.value)}
              placeholder="https://calendar.app.google/..."
              className="h-9 text-[13px] bg-surface-canvas border-line"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!dirty || atualizar.isPending}
            onClick={salvar}
            className="btn-press h-8 text-[12px] gap-1.5 bg-brand text-white hover:bg-brand-strong"
          >
            {atualizar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>
    </section>
  )
}
