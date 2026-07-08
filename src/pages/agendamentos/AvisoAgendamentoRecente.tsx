import { CalendarCheck2 } from 'lucide-react'
import type { AvisoAgendamentoRecente as AvisoAgendamentoRecenteType } from '@/hooks/usePortalAgendamento'

function dataFmt(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  })
}

export function AvisoAgendamentoRecente({
  professorNome, aviso, pendingDeclarar, onDeclararNaoFez, onSoTirarDuvida,
}: {
  professorNome: string
  aviso: AvisoAgendamentoRecenteType
  pendingDeclarar: boolean
  onDeclararNaoFez: () => void
  onSoTirarDuvida: () => void
}) {
  return (
    <div className="w-full max-w-sm space-y-6 animate-fade-up">
      <div className="flex flex-col items-center gap-3.5 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accentBlue-soft text-accentBlue shadow-inner-top">
          <CalendarCheck2 className="h-6 w-6" />
        </span>
        <div className="space-y-1.5">
          <span className="label-micro flex items-center justify-center gap-1.5 text-accentBlue">
            <span className="h-1.5 w-1.5 rounded-full bg-accentBlue" />
            Olá, {professorNome}
          </span>
          <h1 className="text-[1.4rem] font-bold tracking-[-0.03em] text-ink leading-tight">
            Você já tem um agendamento recente
          </h1>
        </div>
      </div>

      <div className="rounded-2xl border border-line-soft bg-surface-canvas px-5 py-4 space-y-2 text-left">
        <p className="text-[13.5px] text-ink-secondary leading-relaxed">
          Sua última reunião foi marcada para <strong className="text-ink">{dataFmt(aviso.data)}</strong>.
        </p>
        <p className="text-[13px] text-ink-muted leading-relaxed">
          Para professores no início da jornada (1 a 3 meses de casa), o acompanhamento é mensal —
          {aviso.diasParaProxima > 0 ? (
            <> sua próxima reunião pode ser agendada a partir de{' '}
              <strong className="text-ink-secondary">{dataFmt(aviso.proximaDataSugerida)}</strong>{' '}
              (em {aviso.diasParaProxima} {aviso.diasParaProxima === 1 ? 'dia' : 'dias'}).</>
          ) : (
            <> já é possível agendar sua próxima reunião.</>
          )}
        </p>
      </div>

      <div className="space-y-2.5">
        <button
          onClick={onDeclararNaoFez}
          disabled={pendingDeclarar}
          className="btn-press w-full h-11 rounded-full border border-line-soft text-[13.5px] font-medium text-ink-secondary hover:bg-surface-subtle disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pendingDeclarar ? 'Registrando…' : 'Na verdade, essa reunião não aconteceu'}
        </button>
        <button
          onClick={onSoTirarDuvida}
          disabled={pendingDeclarar}
          className="btn-press w-full h-11 rounded-full bg-ink text-ink-inverse text-[13.5px] font-medium hover:bg-ink/90 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Só quero tirar uma dúvida
        </button>
      </div>
    </div>
  )
}
