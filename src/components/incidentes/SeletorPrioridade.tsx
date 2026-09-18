import { AlertTriangle, ArrowRightLeft } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { PRIORIDADES, PRIORIDADE_META, type Prioridade } from '@/lib/incidentePrioridade'

// ─────────────────────────────────────────────────────────────────────────────
// Seletor de prioridade dos formulários de incidente (criar e editar).
//
// Um Select de quatro palavras não diz o que cada nível significa — foi assim
// que 37% dos desafios viraram "Crítico". Aqui cada opção mostra o critério, a
// escolhida mostra os prazos que ela cria, e Urgente abre o campo de
// justificativa (o banco recusa Urgente sem ela).
//
// No informe o mesmo nível vira IMPORTÂNCIA de leitura, sem prazo. Informe
// marcado como Urgente quase sempre é um chamado disfarçado — daí o atalho
// para converter.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  valor: Prioridade
  onChange: (p: Prioridade) => void
  natureza: 'desafio' | 'informe'
  justificativa: string
  onJustificativa: (v: string) => void
  /** Nível sugerido pela categoria — ganha a marca "sugerido". */
  sugestao?: Prioridade | null
  /** Informe + Urgente: oferece virar desafio. */
  onConverterEmDesafio?: () => void
}

export function SeletorPrioridade({
  valor, onChange, natureza, justificativa, onJustificativa, sugestao, onConverterEmDesafio,
}: Props) {
  const informe = natureza === 'informe'
  const meta = PRIORIDADE_META[valor]

  return (
    <div className="space-y-1.5">
      <Label className="label-micro">{informe ? 'Importância' : 'Prioridade'}</Label>
      <div role="radiogroup" aria-label={informe ? 'Importância' : 'Prioridade'} className="overflow-hidden rounded-lg border border-line">
        {PRIORIDADES.map((p, idx) => {
          const m = PRIORIDADE_META[p]
          const ativo = p === valor
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => onChange(p)}
              className={cn(
                'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors',
                idx > 0 && 'border-t border-line-soft',
                ativo ? 'bg-surface-subtle' : 'hover:bg-surface-subtle',
              )}
            >
              <span className={cn(
                'mt-[3px] flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border',
                ativo ? 'border-ink' : 'border-line',
              )}>
                {ativo && <span className={cn('h-2 w-2 rounded-full', m.cor)} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={cn('inline-flex rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold', m.chip)}>{p}</span>
                  {sugestao === p && !ativo && (
                    <span className="text-[10.5px] text-ink-subtle">sugerido</span>
                  )}
                </span>
                <span className={cn('mt-0.5 block text-[11.5px] leading-snug', ativo ? 'text-ink-secondary' : 'text-ink-muted')}>
                  {informe ? m.importancia : m.criterio}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {!informe && (
        <p className="text-[11px] text-ink-subtle">
          Alguém precisa assumir <strong className="font-medium text-ink-secondary">{meta.primeiraAcao}</strong>
          {' '}e resolver <strong className="font-medium text-ink-secondary">{meta.resolucao}</strong>.
        </p>
      )}

      {valor === 'Urgente' && (
        <div className="space-y-1 pt-1">
          <Label className="label-micro flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-urg-critFg" />
            Por que é urgente<span className="text-urg-critFg">*</span>
          </Label>
          <textarea
            value={justificativa}
            onChange={e => onJustificativa(e.target.value)}
            rows={2}
            maxLength={280}
            placeholder="Quem está impedido agora e por quê. Ex.: 3 turmas sem conseguir entrar na aula desde as 14h."
            className={cn(
              'w-full resize-none rounded-lg border border-line bg-surface-canvas px-3 py-2 text-[13px] text-ink',
              'placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accentBlue-soft focus:border-accentBlue transition-colors',
            )}
          />
          <p className="text-[11px] text-ink-subtle">
            Urgente avisa toda a coordenação na hora. A frase fica no histórico do chamado.
          </p>
        </div>
      )}

      {informe && valor === 'Urgente' && onConverterEmDesafio && (
        <div className="flex items-start gap-2 rounded-lg border border-aviso-warnBd bg-aviso-warnBg px-3 py-2">
          <p className="flex-1 text-[12px] leading-snug text-aviso-warnFg">
            Informe não entra na fila nem tem prazo. Se isso precisa de ação agora, registre como chamado.
          </p>
          <button
            type="button"
            onClick={onConverterEmDesafio}
            className="btn-press inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-aviso-warnBd bg-surface-canvas px-2 py-1 text-[11.5px] font-medium text-ink hover:bg-surface-subtle"
          >
            <ArrowRightLeft className="h-3 w-3" />Virar chamado
          </button>
        </div>
      )}
    </div>
  )
}
