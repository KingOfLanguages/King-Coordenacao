import { CalendarClock, Users, Sparkles, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PortalLookupResult } from '@/hooks/usePortalAgendamento'

export function OpcoesPortal({
  professorNome, resultado, onEscolherGrupo, carregandoGrupo,
}: {
  professorNome: string
  resultado: PortalLookupResult
  onEscolherGrupo: () => void
  carregandoGrupo: boolean
}) {
  const { primeira_reuniao, acompanhamento, reuniao_grupo } = resultado.opcoes
  const nenhumaOpcao = !primeira_reuniao.elegivel && !acompanhamento.elegivel && !reuniao_grupo.elegivel

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-[1.6rem] font-bold tracking-[-0.03em] text-ink leading-tight">
          Olá, {professorNome}!
        </h1>
        <p className="text-[14px] text-ink-muted leading-relaxed">
          Escolha o tipo de reunião que você quer agendar.
        </p>
      </div>

      {nenhumaOpcao ? (
        <div className="rounded-2xl border border-line-soft bg-surface-canvas px-6 py-8 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            Nenhuma opção de agendamento disponível no momento — fale com sua coordenação.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {primeira_reuniao.elegivel && primeira_reuniao.link && (
            <OpcaoCard
              icone={<CalendarClock className="h-4 w-4" />}
              titulo="Primeira reunião com a Coordenação"
              descricao="Agende sua primeira conversa com a Coordenação para conhecer melhor nosso acompanhamento, esclarecer dúvidas e iniciar sua jornada na King of Languages."
              href={primeira_reuniao.link}
            />
          )}

          {acompanhamento.elegivel && acompanhamento.link && (
            <OpcaoCard
              icone={<CalendarClock className="h-4 w-4" />}
              titulo="Reunião de Acompanhamento"
              descricao="Escolha um horário para conversar com seu coordenador, compartilhar desafios, tirar dúvidas e acompanhar sua evolução."
              href={acompanhamento.link}
            />
          )}

          {reuniao_grupo.elegivel && (
            <OpcaoCard
              icone={<Users className="h-4 w-4" />}
              titulo="Reuniões em Grupo"
              descricao="Encontros coletivos para troca de experiências, boas práticas e desenvolvimento profissional."
              badge={reuniao_grupo.recomendada ? 'Exclusiva para professores destaque' : undefined}
              onClick={onEscolherGrupo}
              pending={carregandoGrupo}
            />
          )}
        </div>
      )}
    </div>
  )
}

function OpcaoCard({
  icone, titulo, descricao, badge, href, onClick, pending,
}: {
  icone: React.ReactNode
  titulo: string
  descricao: string
  badge?: string
  href?: string
  onClick?: () => void
  pending?: boolean
}) {
  const conteudo = (
    <>
      <div className="flex items-start gap-3.5">
        <span className={cn(
          'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full',
          badge ? 'bg-brand/12 text-brand' : 'bg-surface-subtle text-ink-secondary',
        )}>
          {icone}
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-ink">{titulo}</p>
            {badge && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/12 px-2 py-0.5 text-[10.5px] font-medium text-brand-strong">
                <Sparkles className="h-3 w-3" />
                {badge}
              </span>
            )}
          </div>
          <p className="text-[12.5px] text-ink-muted leading-relaxed">{descricao}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-ink-muted flex-shrink-0 mt-1" />
    </>
  )

  const classe = cn(
    'w-full flex items-start justify-between gap-3 rounded-2xl border p-5 text-left transition-colors',
    badge
      ? 'border-brand/25 bg-gradient-to-br from-brand-soft/50 via-surface-canvas to-surface-canvas hover:border-brand/40'
      : 'border-line-soft bg-surface-canvas hover:border-line',
    pending && 'opacity-60 pointer-events-none',
  )

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classe}>
        {conteudo}
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} disabled={pending} className={classe}>
      {conteudo}
    </button>
  )
}
