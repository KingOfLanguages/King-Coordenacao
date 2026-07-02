import { bucketFor } from '@/hooks/useDashboardGeral'

// ─────────────────────────────────────────────────────────────────────────────
// Escala de cor do score do professor (200–1500).
//
// Reutiliza os buckets canônicos de SCORE_BUCKETS/bucketFor (useDashboardGeral)
// para o rótulo da faixa, e colore numa escala vermelho→âmbar→verde usando os
// tokens de urgência já existentes na paleta (urg-high/med/low) — os mesmos
// usados em Acompanhamento (faixaCls), pra manter a leitura de cor consistente
// em todo o app.
// ─────────────────────────────────────────────────────────────────────────────

export type ScoreVisual = {
  /** Número do score, ou "—" quando ausente. */
  label: string
  /** Faixa numérica do bucket (ex.: "600–799") ou "Sem score". */
  faixaLabel: string
  /** Classes para uma pílula/tag (bg + texto). */
  tagClass: string
  /** Classe de fundo para um dot indicador. */
  dotClass: string
}

/** Nível de cor a partir do score numérico. Limites alinhados ao dashboard
 *  (score < 600 é "abaixo" e < 400 dispara alerta). */
function tier(score: number): 'baixo' | 'medio' | 'alto' {
  if (score < 600) return 'baixo'
  if (score < 1000) return 'medio'
  return 'alto'
}

const TIER_TAG: Record<'baixo' | 'medio' | 'alto', string> = {
  baixo: 'bg-urg-highBg text-urg-highFg',
  medio: 'bg-urg-medBg text-urg-medFg',
  alto:  'bg-urg-lowBg text-urg-lowFg',
}

const TIER_DOT: Record<'baixo' | 'medio' | 'alto', string> = {
  baixo: 'bg-urg-highFg',
  medio: 'bg-urg-medFg',
  alto:  'bg-urg-lowFg',
}

export function scoreVisual(score: number | null | undefined): ScoreVisual {
  if (score == null) {
    return {
      label: '—',
      faixaLabel: 'Sem score',
      tagClass: 'bg-surface-subtle text-ink-muted',
      dotClass: 'bg-ink-subtle',
    }
  }
  const t = tier(score)
  return {
    label: String(Math.round(score)),
    faixaLabel: bucketFor(score)?.label ?? String(Math.round(score)),
    tagClass: TIER_TAG[t],
    dotClass: TIER_DOT[t],
  }
}
