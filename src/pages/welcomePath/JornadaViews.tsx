import { useEffect, useRef } from 'react'
import { Hourglass, Lock, CalendarCheck2, ArrowUpRight, PartyPopper } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAgora } from '@/hooks/useAgora'
import { BotaoWhatsApp } from '@/components/portal/PortalUI'
import {
  ULTIMAS_HORAS_MS, dataHoraBR, fmtRestante, fmtRestanteCurto, mensagemDesbloqueio,
} from '@/lib/prazoTrilha'
import type { EtapaTrilha, JornadaPortal, PrimeiraReuniao } from '@/hooks/useWelcomePath'

// ─────────────────────────────────────────────────────────────────────────────
// As três telas do prazo da trilha (2026-10-07):
//
//   ContadorTrilha   quanto falta das 120h, dentro do cartão de progresso
//   ChipPrazo        o mesmo contador, curto, no cabeçalho de cada etapa
//   PainelBloqueio   prazo esgotado: progresso guardado + WhatsApp
//   PainelConclusao  "Congratulations…" + agendar a 1ª reunião
//
// `offsetMs` = hora do servidor − hora do navegador, medida quando a trilha
// chegou. Somar ao Date.now() faz o contador seguir o relógio do servidor, que
// é quem decide o bloqueio — celular com hora errada não ganha nem perde prazo.
// ─────────────────────────────────────────────────────────────────────────────

function useRestante(prazoEm: string, offsetMs: number, intervaloMs: number) {
  const agora = useAgora(intervaloMs)
  return new Date(prazoEm).getTime() - (agora + offsetMs)
}

export function ContadorTrilha({
  jornada, offsetMs, onExpirar,
}: {
  jornada: JornadaPortal
  offsetMs: number
  /** Chamado uma vez quando o contador zera — o portal recarrega a trilha. */
  onExpirar?: () => void
}) {
  const restante = useRestante(jornada.prazoEm, offsetMs, 30_000)
  const avisou = useRef(false)
  useEffect(() => {
    if (restante > 0 || avisou.current) return
    avisou.current = true
    onExpirar?.()
  }, [restante, onExpirar])

  const acabando = restante <= ULTIMAS_HORAS_MS

  if (restante <= 0) {
    // Chega aqui quando o servidor não travou: tudo o que falta está em revisão.
    return (
      <div className="flex items-start gap-3">
        <Hourglass className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-muted" />
        <p className="text-[12.5px] leading-relaxed text-ink-secondary">
          O prazo da trilha terminou, mas suas respostas estão em revisão pela coordenação.
          Assim que forem aprovadas, a trilha fica concluída.
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        '-mx-5 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-t-2xl border-b px-5 py-3.5',
        acabando ? 'border-aviso-warnBd bg-aviso-warnBg' : 'border-line-soft bg-surface-subtle',
      )}
      role="timer"
      aria-live="off"
    >
      <div className="flex items-center gap-3">
        <span className={cn(
          'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full',
          acabando ? 'bg-surface-canvas text-aviso-warnFg' : 'bg-surface-canvas text-ink-secondary',
        )}>
          <Hourglass className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className={cn('text-[11px] font-semibold uppercase tracking-label', acabando ? 'text-aviso-warnFg' : 'text-ink-muted')}>
            {acabando ? 'Menos de 24 horas' : 'Tempo para concluir'}
          </p>
          <p className={cn('text-[15px] font-semibold tabular-nums tracking-[-0.01em]', acabando ? 'text-aviso-warnFg' : 'text-ink')}>
            Faltam {fmtRestante(restante)}
          </p>
        </div>
      </div>
      <p className={cn('text-[12px] tabular-nums', acabando ? 'text-aviso-warnFg' : 'text-ink-muted')}>
        até {dataHoraBR(jornada.prazoEm)}
      </p>
    </div>
  )
}

export function ChipPrazo({ prazoEm, offsetMs }: { prazoEm: string; offsetMs: number }) {
  const restante = useRestante(prazoEm, offsetMs, 30_000)
  if (restante <= 0) return null
  const acabando = restante <= ULTIMAS_HORAS_MS
  return (
    <span
      title={`Prazo da trilha: ${dataHoraBR(prazoEm)}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium tabular-nums',
        acabando ? 'bg-aviso-warnBg text-aviso-warnFg' : 'bg-surface-subtle text-ink-secondary',
      )}
    >
      <Hourglass className={cn('h-3.5 w-3.5', acabando ? 'text-aviso-warnFg' : 'text-ink-muted')} />
      Trilha: faltam {fmtRestanteCurto(restante)}
    </span>
  )
}

export function PainelBloqueio({
  nome, jornada, etapas,
}: {
  nome: string
  jornada: JornadaPortal
  etapas: EtapaTrilha[]
}) {
  const concluidas = etapas.filter(e => e.estado === 'concluida').length
  const idx = etapas.findIndex(e => e.estado !== 'concluida')
  const parou = idx >= 0 ? { numero: idx + 1, titulo: etapas[idx].titulo } : null

  return (
    <section className="overflow-hidden rounded-3xl border border-line-soft bg-surface-canvas shadow-card">
      <div className="space-y-4 px-6 py-6 sm:px-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-subtle text-ink-secondary">
          <Lock className="h-5 w-5" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-[1.6rem] font-bold leading-tight tracking-[-0.03em] text-ink">Seu prazo terminou</h1>
          <p className="text-[14px] leading-relaxed text-ink-muted">
            O prazo para concluir a trilha acabou em {dataHoraBR(jornada.prazoEm)}
            {jornada.desbloqueios === 0 && ', 5 dias depois do seu primeiro acesso'}.
          </p>
        </div>

        <div className="rounded-2xl border border-line-soft bg-surface-subtle px-4 py-3.5">
          <p className="text-[13px] font-medium text-ink">
            Seu progresso está guardado: {concluidas} de {etapas.length} etapas concluídas.
          </p>
          {parou && (
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              Você parou na etapa {parou.numero}, {parou.titulo}.
            </p>
          )}
        </div>

        <p className="text-[13.5px] leading-relaxed text-ink-secondary">
          Para continuar, fale com o suporte ao professor pelo WhatsApp e peça o desbloqueio.
          A mensagem já vai escrita.
        </p>
        <div className="sm:max-w-xs">
          <BotaoWhatsApp mensagem={mensagemDesbloqueio(nome, parou, etapas.length)}>
            Pedir desbloqueio no WhatsApp
          </BotaoWhatsApp>
        </div>
      </div>
    </section>
  )
}

export function PainelConclusao({ primeiraReuniao }: { primeiraReuniao: PrimeiraReuniao | null | undefined }) {
  const link = primeiraReuniao?.link ?? null
  const coordenador = primeiraReuniao?.coordenador ?? null

  return (
    <section className="relative overflow-hidden rounded-3xl border border-line-soft bg-surface-canvas shadow-card">
      {/* Tokens aviso-*: os únicos de destaque com par no tema escuro. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(90% 120% at 100% 0%, var(--aviso-info-bg), transparent 55%), radial-gradient(70% 90% at 0% 100%, var(--aviso-ok-bg), transparent 50%)' }}
      />
      <div className="relative space-y-6 px-6 py-7 sm:px-8 sm:py-8">
        <div className="space-y-3">
          <span className="flex h-12 w-12 animate-fade-up items-center justify-center rounded-2xl bg-aviso-okBg text-aviso-okFg">
            <PartyPopper className="h-6 w-6" />
          </span>
          <h1 lang="en" className="max-w-xl text-[1.75rem] font-bold leading-[1.15] tracking-[-0.03em] text-ink sm:text-[2rem]">
            Congratulations on becoming one of our incredible teachers!
          </h1>
          <p className="text-[14px] leading-relaxed text-ink-muted">
            Você concluiu todas as etapas do Welcome Path.
          </p>
        </div>

        <div className="space-y-3.5 rounded-2xl border border-aviso-infoBd bg-aviso-infoBg px-5 py-4">
          <div className="flex items-start gap-3">
            <CalendarCheck2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-aviso-infoFg" />
            <div className="space-y-1">
              <p className="text-[14px] font-semibold text-ink">Próximo passo: sua primeira reunião</p>
              <p className="text-[13px] leading-relaxed text-ink-secondary">
                Para liberar sua agenda e começar a receber alunos, agende agora sua primeira reunião
                com a coordenação de professores.
              </p>
            </div>
          </div>

          {link ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-8">
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-press inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[13.5px] font-medium text-ink-inverse hover:bg-ink/90"
              >
                Agendar minha primeira reunião <ArrowUpRight className="h-4 w-4" />
              </a>
              {coordenador && (
                <span className="text-[12px] text-ink-muted">Agenda de {coordenador}</span>
              )}
            </div>
          ) : (
            <div className="pl-8 sm:max-w-xs">
              <BotaoWhatsApp mensagem="Olá! Concluí o Welcome Path e quero agendar minha primeira reunião com a coordenação.">
                Agendar pelo WhatsApp
              </BotaoWhatsApp>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
