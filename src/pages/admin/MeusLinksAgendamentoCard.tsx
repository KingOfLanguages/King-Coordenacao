import { useState } from 'react'
import { CalendarClock, Info, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useCoordenadores, type CoordenadorPerfil } from '@/hooks/useAcompanhamento'
import { useLinksCoordenador, useAtualizarLinksCoordenador, type LinksCoordenador } from '@/hooks/useMeusLinksAgendamento'

// ─────────────────────────────────────────────────────────────────────────────
// Links individuais do coordenador para o Portal de Agendamento (/agendar).
// O professor nunca escolhe ou vê esses links diretamente — o portal resolve
// o coordenador responsável pelo professor e usa esses links automaticamente.
//
// Admin vê a lista de todos os coordenadores (via useCoordenadores) e pode
// editar em nome de qualquer um deles — a RLS de profiles já garante que só
// admin ou o próprio dono do perfil consegue de fato salvar. Coordenação só
// vê a si mesma (useCoordenadores já filtra isso), então o seletor nem
// aparece nesse caso.
// ─────────────────────────────────────────────────────────────────────────────

export function MeusLinksAgendamentoCard() {
  const { profile } = useAuth()
  const { data: coordenadores = [] } = useCoordenadores()
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)

  const idAtivo = selecionadoId ?? profile?.id ?? null
  const { data: linksAtuais, isLoading } = useLinksCoordenador(idAtivo)

  if (!profile || (profile.role !== 'coordenacao' && profile.role !== 'admin')) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accentBlue-soft text-accentBlue">
          <CalendarClock className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-[15px] font-semibold text-ink">
          {coordenadores.length > 1 ? 'Links de agendamento individual' : 'Meus links de agendamento individual'}
        </h2>
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

        {coordenadores.length > 1 && (
          <SeletorCoordenador
            coordenadores={coordenadores}
            selecionadoId={idAtivo}
            onChange={setSelecionadoId}
          />
        )}

        {isLoading || !idAtivo ? (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="h-16 rounded-lg bg-surface-subtle animate-pulse" />
            <div className="h-16 rounded-lg bg-surface-subtle animate-pulse" />
          </div>
        ) : (
          <LinksForm key={idAtivo} coordenadorId={idAtivo} inicial={linksAtuais ?? { koalendar_link: null, google_appointment_link: null }} />
        )}
      </div>
    </section>
  )
}

function SeletorCoordenador({ coordenadores, selecionadoId, onChange }: {
  coordenadores: CoordenadorPerfil[]
  selecionadoId: string | null
  onChange: (id: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] text-ink-secondary font-medium">Coordenador</Label>
      <Select value={selecionadoId ?? undefined} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-[13px] bg-surface-canvas border-line">
          <SelectValue placeholder="Selecione um coordenador" />
        </SelectTrigger>
        <SelectContent>
          {coordenadores.map(c => (
            <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function LinksForm({ coordenadorId, inicial }: { coordenadorId: string; inicial: LinksCoordenador }) {
  const atualizar = useAtualizarLinksCoordenador()
  const [koalendar, setKoalendar]   = useState(inicial.koalendar_link ?? '')
  const [googleAppt, setGoogleAppt] = useState(inicial.google_appointment_link ?? '')

  const dirty =
    koalendar.trim() !== (inicial.koalendar_link ?? '') ||
    googleAppt.trim() !== (inicial.google_appointment_link ?? '')

  async function salvar() {
    try {
      await atualizar.mutateAsync({
        coordenadorId,
        koalendar_link: koalendar.trim() || null,
        google_appointment_link: googleAppt.trim() || null,
      })
      toast.success('Links de agendamento atualizados.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar os links.')
    }
  }

  return (
    <>
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
    </>
  )
}
