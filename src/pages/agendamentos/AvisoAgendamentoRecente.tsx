import { CalendarCheck2 } from 'lucide-react'
import type { AvisoAgendamentoRecente as AvisoAgendamentoRecenteType } from '@/hooks/usePortalAgendamento'

// ─────────────────────────────────────────────────────────────────────────────
// "Você já fez o acompanhamento deste mês."
//
// Isto já foi uma TELA, e o professor tinha que passar por ela (declarando que a
// reunião não aconteceu, ou clicando em "só quero tirar uma dúvida") para chegar
// às opções de agendamento. Virou uma FAIXA acima das opções em 2026-08-21: a
// regra da coordenação é 1 acompanhamento oficial por mês até o 3º mês e
// quantas reuniões de dúvida o professor quiser — então avisar que ele já
// cumpriu o mês é informação, nunca trava.
//
// Sobra uma única ação, que é a que de fato muda dado: dizer que a reunião
// registrada não aconteceu.
// ─────────────────────────────────────────────────────────────────────────────

function dataFmt(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  })
}

export function AvisoAgendamentoRecente({
  aviso, pendingDeclarar, onDeclararNaoFez,
}: {
  aviso: AvisoAgendamentoRecenteType
  pendingDeclarar: boolean
  onDeclararNaoFez: () => void
}) {
  const mensal = aviso.janela.min === aviso.janela.max

  return (
    <div className="rounded-2xl border border-[rgba(42,92,255,0.22)] bg-accentBlue-soft/30 px-5 py-4 space-y-2.5 animate-fade-up">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accentBlue-soft text-accentBlue">
          <CalendarCheck2 className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-[13.5px] font-semibold leading-tight text-ink">
            Seu acompanhamento deste mês já está feito
          </p>
          <p className="text-[12.5px] leading-relaxed text-ink-secondary">
            Sua última reunião foi em <strong className="text-ink">{dataFmt(aviso.data)}</strong>.{' '}
            {mensal
              ? 'Nos primeiros 3 meses o acompanhamento é mensal, e o seu já está em dia.'
              : `Depois dos 3 primeiros meses você escolhe fazer o acompanhamento entre ${aviso.janela.min} e ${aviso.janela.max} dias após o último encontro.`}
          </p>
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            Se quiser conversar de novo antes disso — tirar uma dúvida, resolver
            alguma coisa — é só escolher uma das opções abaixo. Não tem limite, e
            isso não substitui nem adianta o acompanhamento do próximo mês.
          </p>
        </div>
      </div>

      <button
        onClick={onDeclararNaoFez}
        disabled={pendingDeclarar}
        className="btn-press w-full h-9 rounded-full border border-line-soft bg-surface-canvas text-[12.5px] font-medium text-ink-secondary hover:bg-surface-subtle disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pendingDeclarar ? 'Registrando…' : 'Na verdade, essa reunião não aconteceu'}
      </button>
    </div>
  )
}
