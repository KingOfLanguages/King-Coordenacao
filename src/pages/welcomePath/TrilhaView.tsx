import { Check, Lock, Play, RotateCw, CalendarClock, Clock3, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dataBR, diasAte, fmtDuracao } from '@/lib/formato'
import type { EtapaTrilha } from '@/hooks/useWelcomePath'

// ─────────────────────────────────────────────────────────────────────────────
// A trilha: a lista de etapas com o estado de cada uma. Metáfora de caminho —
// uma linha vertical liga os marcos, e o marco atual é o único com destaque
// forte, para o professor não ter dúvida de onde continuar.
// ─────────────────────────────────────────────────────────────────────────────

function Marco({ etapa, atual }: { etapa: EtapaTrilha; atual: boolean }) {
  const base = 'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold'

  if (etapa.estado === 'concluida') {
    return <span className={cn(base, 'bg-urg-lowBg text-urg-lowFg')}><Check className="h-4 w-4" /></span>
  }
  if (etapa.estado === 'bloqueada') {
    return <span className={cn(base, 'bg-surface-subtle text-ink-subtle')}><Lock className="h-3.5 w-3.5" /></span>
  }
  return (
    <span className={cn(
      base,
      atual
        ? 'bg-ink text-ink-inverse shadow-[0_2px_10px_-2px_rgba(0,0,0,0.3)]'
        : 'bg-accentBlue-soft text-accentBlue',
    )}>
      {etapa.ordem}
    </span>
  )
}

function LinhaMeta({ etapa }: { etapa: EtapaTrilha }) {
  const itens: { icone: typeof Clock3; texto: string; tom?: string }[] = []

  if (etapa.estado === 'concluida') {
    if (etapa.nota != null) itens.push({ icone: Check, texto: `${Math.round(etapa.nota)}% de acerto` })
    if (etapa.tempoSegundos) itens.push({ icone: Clock3, texto: fmtDuracao(etapa.tempoSegundos) })
  }

  if (etapa.revisaoPendente) {
    itens.push({ icone: Clock3, texto: 'Aguardando revisão da coordenação', tom: 'text-urg-medFg' })
  }

  if (etapa.estado === 'bloqueada' && etapa.motivoBloqueio === 'data' && etapa.abreEm) {
    const dias = diasAte(etapa.abreEm)
    itens.push({
      icone: CalendarClock,
      texto: dias <= 1 ? 'Abre amanhã' : `Abre em ${dias} dias (${dataBR(etapa.abreEm)})`,
    })
  }

  if (etapa.estado === 'liberada' && etapa.prazoEm) {
    const dias = diasAte(etapa.prazoEm)
    itens.push({
      icone: CalendarClock,
      texto: dias < 0
        ? `Prazo venceu em ${dataBR(etapa.prazoEm)}`
        : dias === 0 ? 'Prazo é hoje' : `Até ${dataBR(etapa.prazoEm)}`,
      tom: dias < 0 ? 'text-urg-highFg' : undefined,
    })
  }

  if (itens.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5">
      {itens.map((it, i) => (
        <span key={i} className={cn('flex items-center gap-1 text-[11.5px]', it.tom ?? 'text-ink-muted')}>
          <it.icone className="h-3 w-3" /> {it.texto}
        </span>
      ))}
    </div>
  )
}

export function TrilhaView({
  nome, etapas, onAbrir, onSair,
}: {
  nome: string
  etapas: EtapaTrilha[]
  onAbrir: (etapaId: string) => void
  onSair: () => void
}) {
  const concluidas = etapas.filter(e => e.estado === 'concluida').length
  const total = etapas.length
  const pct = total ? Math.round((concluidas / total) * 100) : 0
  const atual = etapas.find(e => e.estado === 'liberada')
  const tudoFeito = total > 0 && concluidas === total
  const primeiroNome = nome.split(' ')[0]

  return (
    <div className="w-full max-w-2xl space-y-7 animate-fade-up">
      {/* Cabeçalho com o progresso */}
      <header className="space-y-4">
        <div className="space-y-1.5">
          <span className="label-micro flex items-center gap-1.5 text-accentBlue">
            <span className="h-1.5 w-1.5 rounded-full bg-accentBlue" />
            Welcome Path
          </span>
          <h1 className="text-[1.85rem] font-bold tracking-[-0.03em] leading-tight text-ink">
            {tudoFeito ? `Trilha concluída, ${primeiroNome}!` : `Olá, ${primeiroNome}`}
          </h1>
          <p className="text-[14px] leading-relaxed text-ink-muted">
            {tudoFeito
              ? 'Você passou por todas as etapas do onboarding. Pode voltar aqui quando quiser para revisar o conteúdo.'
              : 'Sua trilha de boas-vindas à King. Cada etapa libera a próxima — faça no seu ritmo.'}
          </p>
        </div>

        <div className="rounded-2xl border border-line-soft bg-surface-canvas px-5 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[12.5px] font-medium text-ink-secondary">
              {concluidas} de {total} etapas concluídas
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-ink">{pct}%</span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-subtle">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-500 ease-spring"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </header>

      {/* Etapas */}
      <ol className="relative space-y-2.5">
        {etapas.map((etapa, i) => {
          const ehAtual = atual?.id === etapa.id
          const clicavel = etapa.estado !== 'bloqueada'
          const ultima = i === etapas.length - 1

          return (
            <li key={etapa.id} className="relative">
              {/* Fio que liga um marco ao próximo */}
              {!ultima && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-[calc(1.25rem+1px)] top-[3.4rem] bottom-[-0.85rem] w-px',
                    etapa.estado === 'concluida' ? 'bg-urg-lowFg/35' : 'bg-line-soft',
                  )}
                />
              )}

              <button
                type="button"
                disabled={!clicavel}
                onClick={() => clicavel && onAbrir(etapa.id)}
                className={cn(
                  'btn-press relative w-full rounded-2xl border px-4 py-4 text-left transition-colors',
                  ehAtual
                    ? 'border-ink/15 bg-surface-canvas shadow-[0_8px_28px_-10px_rgba(0,0,0,0.16)]'
                    : etapa.estado === 'concluida'
                      ? 'border-line-soft bg-surface-canvas hover:bg-surface-subtle/50'
                      : 'border-line-soft bg-surface-canvas/60',
                  !clicavel && 'cursor-default opacity-70',
                )}
              >
                <div className="flex gap-3.5">
                  <Marco etapa={etapa} atual={ehAtual} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10.5px] font-semibold uppercase tracking-label text-ink-muted">
                          Etapa {etapa.ordem}
                          {!etapa.obrigatoria && ' · opcional'}
                        </p>
                        <p className="mt-0.5 text-[14.5px] font-semibold leading-snug tracking-[-0.01em] text-ink">
                          {etapa.titulo}
                        </p>
                      </div>

                      {clicavel && (
                        <span className={cn(
                          'flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium',
                          ehAtual ? 'bg-ink text-ink-inverse' : 'text-ink-muted',
                        )}>
                          {etapa.estado === 'concluida'
                            ? <><RotateCw className="h-3.5 w-3.5" /> Revisar</>
                            : <><Play className="h-3.5 w-3.5" /> {etapa.tentativas > 0 ? 'Continuar' : 'Começar'}</>}
                        </span>
                      )}
                    </div>

                    {etapa.descricao && (
                      <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
                        {etapa.descricao}
                      </p>
                    )}

                    {etapa.estado === 'bloqueada' && etapa.motivoBloqueio === 'anterior' && (
                      <p className="pt-1.5 text-[11.5px] text-ink-subtle">
                        Conclua a etapa {etapa.ordem - 1} para liberar.
                      </p>
                    )}

                    <LinhaMeta etapa={etapa} />
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={onSair}
          className="btn-press flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink-secondary"
        >
          <LogOut className="h-3.5 w-3.5" /> Não é você? Sair deste dispositivo
        </button>
      </div>
    </div>
  )
}
