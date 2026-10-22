import { cn } from '@/lib/utils'
import type { SituacaoTrilha } from '@/lib/prazoTrilha'
import type { EtapaAdmin } from '@/hooks/useWelcomePathAdmin'
import { SITUACAO, type LinhaTrilha } from './trilhaComum'

export function ChipSituacao({ situacao }: { situacao: SituacaoTrilha }) {
  const cfg = SITUACAO[situacao]
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

type EstadoPonto = 'ok' | 'revisao' | 'atual' | 'travou' | 'falta'

const PONTO: Record<EstadoPonto, { cls: string; label: string }> = {
  ok:      { cls: 'bg-aviso-okFg',     label: 'concluída' },
  revisao: { cls: 'bg-urg-medFg',      label: 'esperando revisão' },
  atual:   { cls: 'bg-accentBlue',     label: 'onde está' },
  travou:  { cls: 'bg-aviso-warnFg',   label: 'travou no prazo' },
  falta:   { cls: 'bg-line',           label: 'falta' },
}

/** Uma bolinha por etapa ativa: dá para ver de longe onde cada um parou. */
export function PontosEtapas({ l, ativas }: { l: LinhaTrilha; ativas: EtapaAdmin[] }) {
  // A 1ª etapa não concluída (e não parada em revisão) é onde ele está.
  const atual = l.dispensado_em ? -1 : ativas.findIndex(e => {
    const p = l.porEtapa.get(e.id)
    return !p?.concluida_em && !p?.revisao_pendente
  })
  return (
    <div className="flex flex-wrap items-center gap-[3px]">
      {ativas.map((e, i) => {
        const p = l.porEtapa.get(e.id)
        let estado: EstadoPonto = 'falta'
        if (p?.concluida_em) estado = 'ok'
        else if (p?.revisao_pendente) estado = 'revisao'
        else if (i === atual) estado = l.situacao === 'bloqueado' ? 'travou' : 'atual'
        return (
          <span
            key={e.id}
            title={`${i + 1} · ${e.titulo}: ${PONTO[estado].label}`}
            className={cn('h-2 w-2 flex-shrink-0 rounded-full', PONTO[estado].cls)}
          />
        )
      })}
    </div>
  )
}

export function LegendaPontos() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
      {(Object.keys(PONTO) as EstadoPonto[]).map(k => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', PONTO[k].cls)} /> {PONTO[k].label}
        </span>
      ))}
    </div>
  )
}
