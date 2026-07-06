import { CalendarPlus, MessageCircle, Users, Sparkles, ArrowRight, Handshake, MessagesSquare, Zap } from 'lucide-react'
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
  const professorDestaque = reuniao_grupo.elegivel && reuniao_grupo.recomendada

  const cardGrupo = reuniao_grupo.elegivel && (
    reuniao_grupo.recomendada ? (
      <CardGrupoHero
        key="grupo"
        onClick={onEscolherGrupo}
        pending={carregandoGrupo}
        indice={0}
      />
    ) : (
      <OpcaoCard
        key="grupo"
        icone={<Users className="h-[18px] w-[18px]" />}
        titulo="Reuniões em Grupo"
        descricao="Encontros coletivos pra troca de experiências, boas práticas e desenvolvimento profissional."
        onClick={onEscolherGrupo}
        pending={carregandoGrupo}
        indice={2}
      />
    )
  )

  const cardAcompanhamento = acompanhamento.elegivel && acompanhamento.link && (
    <OpcaoCard
      key="acompanhamento"
      icone={<MessageCircle className="h-[18px] w-[18px]" />}
      titulo="Reunião de Acompanhamento"
      descricao={
        professorDestaque
          ? 'Prefere conversar individualmente? Essa opção continua disponível, mas o formato em grupo é o mais indicado pra quem está no seu momento.'
          : 'Um horário com seu coordenador pra compartilhar desafios, tirar dúvidas e acompanhar sua evolução.'
      }
      href={acompanhamento.link}
      secundaria={professorDestaque}
      indice={1}
    />
  )

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

          {professorDestaque ? (
            <>
              {cardGrupo}
              {cardAcompanhamento}
            </>
          ) : (
            <>
              {cardAcompanhamento}
              {cardGrupo}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const BENEFICIOS_GRUPO = [
  { icone: MessagesSquare, texto: 'Troca de experiências' },
  { icone: Handshake, texto: 'Rede de apoio' },
  { icone: Zap, texto: 'Mais dinâmico' },
]

function CardGrupoHero({
  onClick, pending, indice,
}: {
  onClick: () => void
  pending: boolean
  indice: number
}) {
  const style = { animationDelay: `${indice * 70 + 60}ms`, animationFillMode: 'both' as const }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      style={style}
      className={cn(
        'btn-press group relative w-full overflow-hidden rounded-[1.75rem] border p-5 text-left',
        'border-[rgba(209,51,58,0.22)]',
        'bg-gradient-to-br from-brand-soft via-surface-canvas to-surface-canvas',
        'shadow-[0_10px_32px_-12px_rgba(209,51,58,0.35)]',
        'transition-all duration-300 hover:-translate-y-1',
        'hover:border-[rgba(209,51,58,0.4)] hover:shadow-[0_16px_40px_-10px_rgba(209,51,58,0.42)]',
        'animate-fade-up',
        pending && 'pointer-events-none opacity-70',
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[rgba(209,51,58,0.18)] blur-3xl transition-transform duration-500 group-hover:scale-110"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -left-6 bottom-0 h-24 w-24 rounded-full bg-[rgba(42,92,255,0.1)] blur-2xl"
      />

      <div className="relative flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[10.5px] font-semibold text-white shadow-[0_2px_8px_-2px_rgba(209,51,58,0.5)]">
          <Sparkles className="h-3 w-3" />
          Exclusiva para professores destaque
        </span>
        {pending && (
          <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        )}
      </div>

      <div className="relative mt-4 flex items-center gap-3.5">
        <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_8px_20px_-6px_rgba(209,51,58,0.5)] transition-transform duration-300 group-hover:scale-105">
          <Users className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-[18px] font-bold leading-tight tracking-[-0.01em] text-ink">Reuniões em Grupo</p>
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            Encontros coletivos com outros professores no seu momento.
          </p>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-1.5">
        {BENEFICIOS_GRUPO.map(({ icone: Icone, texto }) => (
          <span
            key={texto}
            className="inline-flex items-center gap-1 rounded-full border border-[rgba(209,51,58,0.16)] bg-surface-canvas px-2.5 py-1 text-[11px] font-medium text-brand-strong"
          >
            <Icone className="h-3 w-3" />
            {texto}
          </span>
        ))}
      </div>

      <div className="relative mt-4 flex items-center justify-between rounded-xl bg-ink px-3.5 py-2.5 text-white transition-colors group-hover:bg-brand">
        <span className="text-[13px] font-semibold">
          {pending ? 'Carregando horários…' : 'Ver horários disponíveis'}
        </span>
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  )
}

function OpcaoCard({
  icone, titulo, descricao, secundaria, href, onClick, pending, indice,
}: {
  icone: React.ReactNode
  titulo: string
  descricao: string
  secundaria?: boolean
  href?: string
  onClick?: () => void
  pending?: boolean
  indice: number
}) {
  const conteudo = (
    <>
      <span className={cn(
        'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors',
        !secundaria && 'bg-accentBlue-soft text-accentBlue group-hover:bg-accentBlue group-hover:text-white',
        secundaria && 'bg-surface-subtle text-ink-subtle',
      )}>
        {pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icone}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn(
          'text-[14.5px] font-semibold leading-tight',
          secundaria ? 'text-ink-muted' : 'text-ink',
        )}>{titulo}</p>
        <p className="text-[12.5px] leading-relaxed text-ink-muted">{descricao}</p>
      </div>

      <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 self-center text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accentBlue" />
    </>
  )

  const classe = cn(
    'btn-press group flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left',
    'hover:-translate-y-0.5 hover:shadow-elevated',
    !secundaria && 'border-line-soft bg-surface-canvas hover:border-[rgba(42,92,255,0.4)]',
    secundaria && 'border-line-soft bg-surface-subtle hover:shadow-none hover:-translate-y-0',
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
