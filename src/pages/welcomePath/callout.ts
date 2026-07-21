import { Info, AlertTriangle, OctagonAlert } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Variantes do elemento "destaque" (callout), compartilhadas entre o portal do
// professor e o editor da coordenação.
//
// `info` e `warning` são as duas variantes da área de materiais da King (KMS),
// com as mesmas chaves. `danger` é nossa: o conteúdo herdado do app antigo usa
// caixas vermelhas de alerta que não têm equivalente lá.
//
// Fora de Blocos.tsx porque arquivo de componente que também exporta
// constantes quebra o Fast Refresh do Vite (react-refresh/only-export-components).
// ─────────────────────────────────────────────────────────────────────────────

export const CALLOUT_VARIANTES = {
  info:    { rotulo: 'Informação', icone: Info,          cls: 'border-accentBlue/25 bg-accentBlue-soft text-accentBlue' },
  warning: { rotulo: 'Atenção',    icone: AlertTriangle, cls: 'border-urg-medFg/25  bg-urg-medBg/60   text-urg-medFg'  },
  danger:  { rotulo: 'Alerta',     icone: OctagonAlert,  cls: 'border-urg-highFg/25 bg-urg-highBg/50  text-urg-highFg' },
} as const

export type CalloutVariante = keyof typeof CALLOUT_VARIANTES

export function varianteDoCallout(meta: Record<string, unknown> | null | undefined): CalloutVariante {
  const v = meta?.calloutVariant
  return typeof v === 'string' && v in CALLOUT_VARIANTES ? (v as CalloutVariante) : 'info'
}
