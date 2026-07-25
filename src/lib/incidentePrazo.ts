// ─────────────────────────────────────────────────────────────────────────────
// Prazo (SLA) de resolução dos incidentes.
//
// Fonte única do mapa urgência → prazo padrão e do cálculo de atraso. Usado na
// sugestão ao criar/editar um incidente, no selo "vence em / vencido" da
// listagem e no calendário da aba Agenda de Tarefas.
// ─────────────────────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000

/** Dias padrão até o prazo, por urgência. Espelha o backfill da migration
 *  20260746_incidentes_prazo.sql — manter os dois em sincronia. */
export const PRAZO_PADRAO_DIAS: Record<string, number> = {
  Alta: 1,
  Crítico: 1,
  Crítica: 1,
  Média: 3,
  Baixa: 7,
}

const DIAS_FALLBACK = 3

/** Data-limite sugerida a partir da urgência, contada de `base` (agora por padrão). */
export function prazoSugerido(urgency: string, base: Date = new Date()): Date {
  const dias = PRAZO_PADRAO_DIAS[urgency] ?? DIAS_FALLBACK
  const d = new Date(base)
  d.setDate(d.getDate() + dias)
  return d
}

/** "YYYY-MM-DD" no fuso local (evita o −1 dia que toISOString() causaria em UTC). */
export function dataInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Valor pronto pro <input type="date"> com a sugestão da urgência. */
export function prazoSugeridoInput(urgency: string, base: Date = new Date()): string {
  return dataInputValue(prazoSugerido(urgency, base))
}

/** ISO de um incidente → "YYYY-MM-DD" pro <input type="date"> (vazio se sem prazo). */
export function isoParaPrazoInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : dataInputValue(d)
}

/** "YYYY-MM-DD" do input → ISO no fim do dia local (o dia inteiro conta como no prazo). */
export function prazoInputParaISO(dateStr: string): string | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 23, 59, 59).toISOString()
}

export interface StatusPrazo {
  /** Vencido e ainda não resolvido. */
  atrasado: boolean
  /** Dias até o prazo; negativo = vencido. Arredondado pra dia. */
  diasRestantes: number
  label: string
}

/** Estado do prazo em relação a agora. `resolved` desliga o atraso "ativo". */
export function statusPrazo(prazo: string | null | undefined, resolved: boolean): StatusPrazo | null {
  if (!prazo) return null
  const ms = new Date(prazo).getTime() - Date.now()

  if (resolved) {
    return { atrasado: false, diasRestantes: Math.floor(ms / DIA_MS), label: 'resolvido' }
  }
  if (ms < 0) {
    const dias = Math.max(1, Math.ceil(-ms / DIA_MS))
    return {
      atrasado: true,
      diasRestantes: -dias,
      label: dias === 1 ? 'vencido há 1 dia' : `vencido há ${dias} dias`,
    }
  }
  const dias = Math.floor(ms / DIA_MS)
  return {
    atrasado: false,
    diasRestantes: dias,
    label: dias === 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`,
  }
}
