import { Calendar, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReuniaoConfirmada } from '@/hooks/useBookMeeting'

function googleCalendarUrl(reuniao: ReuniaoConfirmada): string {
  const inicio = new Date(reuniao.data_hora)
  const fim = new Date(inicio.getTime() + 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: reuniao.titulo,
    dates: `${fmt(inicio)}/${fmt(fim)}`,
    details: reuniao.meet_link ? `Link da reunião: ${reuniao.meet_link}` : '',
    location: reuniao.meet_link ?? '',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function Confirmacao({ reuniao }: { reuniao: ReuniaoConfirmada }) {
  const dataFmt = new Date(reuniao.data_hora).toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
    timeZone: 'America/Sao_Paulo',
  })
  const horaFmt = new Date(reuniao.data_hora).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })

  return (
    <div className="w-full max-w-sm space-y-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-urg-lowBg">
          <Check className="h-6 w-6 text-urg-lowFg" />
        </div>
        <h1 className="text-[1.5rem] font-bold tracking-[-0.03em] text-ink">Inscrição confirmada</h1>
      </div>

      <div className="card-surface p-5 space-y-1 text-left">
        <p className="text-[15px] font-semibold text-ink">{reuniao.titulo}</p>
        <p className="text-[14px] font-semibold text-ink capitalize">{dataFmt} às {horaFmt}</p>
        <p className="text-[13px] text-ink-muted">Coordenador: {reuniao.coordenador_nome}</p>
      </div>

      <div className="flex flex-col gap-2.5">
        {reuniao.meet_link && (
          <Button asChild className="h-10 text-[13px] bg-brand text-white hover:bg-brand-strong">
            <a href={reuniao.meet_link} target="_blank" rel="noopener noreferrer">Entrar na reunião</a>
          </Button>
        )}
        <Button asChild variant="outline" className="h-10 text-[13px] gap-2 border-line">
          <a href={googleCalendarUrl(reuniao)} target="_blank" rel="noopener noreferrer">
            <Calendar className="h-4 w-4" />
            Adicionar ao Google Calendar
          </a>
        </Button>
      </div>

      <p className="text-[12px] text-ink-secondary">
        Este link é só desta reunião (<span className="capitalize">{dataFmt}</span>). Cada data tem um link diferente — entre por este.
      </p>

      <p className="text-[12px] text-ink-muted">
        {reuniao.email_enviado
          ? 'Você também receberá um e-mail com esta confirmação.'
          : 'Salve o link acima — não temos um e-mail cadastrado pra te enviar esta confirmação.'}
      </p>
    </div>
  )
}
