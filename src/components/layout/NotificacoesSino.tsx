import { useNavigate } from 'react-router-dom'
import { Bell, AlertTriangle, Hand, CheckCircle2, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useNotificacoes, useMarcarNotificacaoLida, useMarcarTodasLidas,
  type Notificacao,
} from '@/hooks/useNotificacoes'

interface Props {
  isOpen: boolean
  onToggle: () => void
  registerRef: (el: HTMLDivElement | null) => void
}

const ICONE: Record<string, typeof Bell> = {
  incidente_novo:      FileText,
  incidente_critico:   AlertTriangle,
  incidente_assumido:  Hand,
  incidente_concluido: CheckCircle2,
}

const COR: Record<string, string> = {
  incidente_novo:      'text-accentBlue',
  incidente_critico:   'text-urg-critFg',
  incidente_assumido:  'text-accentBlue',
  incidente_concluido: 'text-urg-lowFg',
}

function tempoRelativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'há 1 dia' : `há ${d} dias`
}

export function NotificacoesSino({ isOpen, onToggle, registerRef }: Props) {
  const navigate = useNavigate()
  const { data: notificacoes = [] } = useNotificacoes()
  const marcarLida = useMarcarNotificacaoLida()
  const marcarTodas = useMarcarTodasLidas()

  const naoLidas = notificacoes.filter(n => !n.lida).length

  function abrir(n: Notificacao) {
    if (!n.lida) marcarLida.mutate(n.id)
    onToggle()
    if (n.incidente_id) navigate(`/incidentes?incidente=${n.incidente_id}`)
  }

  return (
    <div ref={registerRef} className="relative flex-shrink-0">
      <button
        onClick={onToggle}
        aria-label={naoLidas > 0 ? `Notificações (${naoLidas} não lidas)` : 'Notificações'}
        className={cn(
          'btn-press relative flex items-center justify-center h-9 w-9 rounded-full',
          'hover:bg-surface-subtle/80 transition-colors',
          isOpen && 'bg-surface-subtle',
        )}
      >
        <Bell className="h-4 w-4" />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-semibold text-white tabular-nums">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+10px)] w-80 animate-spring-in overflow-hidden
                        rounded-2xl border border-line-soft bg-surface-canvas
                        shadow-[0_12px_32px_-8px_rgba(0,0,0,0.14),0_4px_12px_-4px_rgba(0,0,0,0.06)]
                        dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.50)]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft bg-surface-subtle/40">
            <p className="text-[13px] font-semibold text-ink">Notificações</p>
            {naoLidas > 0 && (
              <button
                onClick={() => marcarTodas.mutate()}
                className="btn-press text-[11px] font-medium text-accentBlue hover:opacity-80 transition-opacity"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          {notificacoes.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="mx-auto h-5 w-5 text-ink-subtle" />
              <p className="mt-2 text-[12px] text-ink-muted">Nenhuma notificação por aqui.</p>
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {notificacoes.map(n => {
                const Icone = ICONE[n.tipo] ?? Bell
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => abrir(n)}
                      className={cn(
                        'btn-press w-full text-left flex gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-subtle/50',
                        !n.lida && 'bg-accentBlue-soft/25',
                      )}
                    >
                      <Icone className={cn('h-4 w-4 flex-shrink-0 mt-0.5', COR[n.tipo] ?? 'text-ink-muted')} />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-[12.5px] leading-snug', n.lida ? 'text-ink-secondary' : 'font-medium text-ink')}>
                          {n.titulo}
                        </p>
                        {n.corpo && (
                          <p className="text-[11.5px] text-ink-muted truncate mt-0.5">{n.corpo}</p>
                        )}
                        <p className="text-[10.5px] text-ink-subtle mt-0.5">{tempoRelativo(n.created_at)}</p>
                      </div>
                      {!n.lida && <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
