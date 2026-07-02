import { CalendarPlus, MessageCircle, Users, Sparkles, ArrowRight } from 'lucide-react'
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
    <div className="w-full max-w-md space-y-7 animate-fade-up">
      <div className="space-y-2">
        <span className="label-micro flex items-center gap-1.5 text-accentBlue">
          <span className="h-1.5 w-1.5 rounded-full bg-accentBlue" />
          Portal de agendamento
        </span>
        <h1 className="text-[1.7rem] font-bold tracking-[-0.03em] text-ink leading-none">
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
        <div className="space-y-3">
          {primeira_reuniao.elegivel && primeira_reuniao.link && (
            <OpcaoCard
              icone={<CalendarPlus className="h-[18px] w-[18px]" />}
              titulo="Primeira reunião com a Coordenação"
              descricao="Sua conversa inicial pra conhecer melhor nosso acompanhamento, tirar dúvidas e começar sua jornada na King."
              href={primeira_reuniao.link}
              indice={0}
            />
          )}

          {acompanhamento.elegivel && acompanhamento.link && (
            <OpcaoCard
              icone={<MessageCircle className="h-[18px] w-[18px]" />}
              titulo="Reunião de Acompanhamento"
              descricao="Um horário com seu coordenador pra compartilhar desafios, tirar dúvidas e acompanhar sua evolução."
              href={acompanhamento.link}
              indice={1}
            />
          )}

          {reuniao_grupo.elegivel && (
            <OpcaoCard
              icone={<Users className="h-[18px] w-[18px]" />}
              titulo="Reuniões em Grupo"
              descricao="Encontros coletivos pra troca de experiências, boas práticas e desenvolvimento profissional."
              badge={reuniao_grupo.recomendada ? 'Exclusiva para professores destaque' : undefined}
              destaque={reuniao_grupo.recomendada}
              onClick={onEscolherGrupo}
              pending={carregandoGrupo}
              indice={2}
            />
          )}
        </div>
      )}
    </div>
  )
}

function OpcaoCard({
  icone, titulo, descricao, badge, destaque, href, onClick, pending, indice,
}: {
  icone: React.ReactNode
  titulo: string
  descricao: string
  badge?: string
  destaque?: boolean
  href?: string
  onClick?: () => void
  pending?: boolean
  indice: number
}) {
  const conteudo = (
    <>
      <span className={cn(
        'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors',
        destaque
          ? 'bg-brand/12 text-brand'
          : 'bg-accentBlue-soft text-accentBlue group-hover:bg-accentBlue group-hover:text-white',
      )}>
        {pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icone}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14.5px] font-semibold leading-tight text-ink">{titulo}</p>
          {badge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/12 px-2 py-0.5 text-[10.5px] font-medium text-brand-strong">
              <Sparkles className="h-3 w-3" />
              {badge}
            </span>
          )}
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-muted">{descricao}</p>
      </div>

      <ArrowRight className={cn(
        'mt-0.5 h-4 w-4 flex-shrink-0 self-center transition-transform group-hover:translate-x-0.5',
        destaque ? 'text-brand' : 'text-ink-subtle group-hover:text-accentBlue',
      )} />
    </>
  )

  const classe = cn(
    'btn-press group flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left',
    'hover:-translate-y-0.5 hover:shadow-elevated',
    destaque
      ? 'border-brand/25 bg-gradient-to-br from-brand-soft/60 via-surface-canvas to-surface-canvas hover:border-brand/45'
      : 'border-line-soft bg-surface-canvas hover:border-accentBlue/40',
    pending && 'pointer-events-none opacity-70',
  )

  const style = { animationDelay: `${indice * 70 + 60}ms`, animationFillMode: 'both' as const }

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(classe, 'animate-fade-up')}
        style={style}
      >
        {conteudo}
      </a>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(classe, 'animate-fade-up')}
      style={style}
    >
      {conteudo}
    </button>
  )
}
