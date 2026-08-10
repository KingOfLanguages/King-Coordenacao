// ─────────────────────────────────────────────────────────────────────────────
// Dias úteis (segunda a sexta).
//
// O onboarding do professor corre em dias de trabalho: quem começa numa
// sexta-feira está no "Dia 2" na segunda seguinte, não no "Dia 4". Contar fim de
// semana inflava o contador e marcava como atrasado quem estava em dia.
//
// Sem feriados — não existe calendário de feriados no sistema; o desvio de um
// feriado isolado é aceitável, o de todo sábado e domingo não era.
// ─────────────────────────────────────────────────────────────────────────────

const DIA_MS = 864e5

/** Segunda a sexta. */
export function ehDiaUtil(d: Date): boolean {
  const dow = d.getDay()
  return dow !== 0 && dow !== 6
}

/** Meia-noite local de uma data ISO (YYYY-MM-DD). null se vazia/inválida. */
export function parseISODate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Hoje à meia-noite local (nunca UTC — a data do usuário é a que vale). */
export function hojeLocal(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

/**
 * Quantidade de dias úteis entre duas datas, contando as duas pontas.
 * `diasUteisEntre(seg, seg)` = 1; `diasUteisEntre(sex, seg)` = 2. 0 se `ate` < `de`.
 */
export function diasUteisEntre(de: Date, ate: Date): number {
  const d0 = new Date(de.getFullYear(), de.getMonth(), de.getDate())
  const d1 = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate())
  if (d1 < d0) return 0

  const total = Math.round((d1.getTime() - d0.getTime()) / DIA_MS) + 1
  const semanas = Math.floor(total / 7)
  let uteis = semanas * 5

  // Sobra menos de uma semana: caminha dia a dia a partir do dia da semana inicial.
  let resto = total - semanas * 7
  let dow = d0.getDay()
  while (resto-- > 0) {
    if (dow !== 0 && dow !== 6) uteis++
    dow = (dow + 1) % 7
  }
  return uteis
}

/**
 * Data ISO do N-ésimo dia útil a partir de `inicioISO` (inclusive).
 * N = 1 → o próprio início, se for dia útil; senão a segunda-feira seguinte.
 */
export function somarDiasUteis(inicioISO: string, n: number): string {
  const cur = parseISODate(inicioISO)
  if (!cur) return inicioISO.slice(0, 10)

  let restantes = Math.max(1, Math.round(n))
  for (;;) {
    if (ehDiaUtil(cur)) {
      restantes--
      if (restantes === 0) break
    }
    cur.setDate(cur.getDate() + 1)
  }
  const mm = String(cur.getMonth() + 1).padStart(2, '0')
  const dd = String(cur.getDate()).padStart(2, '0')
  return `${cur.getFullYear()}-${mm}-${dd}`
}

/**
 * Nº do dia de onboarding contando só dias úteis — Dia 1 = primeiro dia útil
 * a partir do início. Retorna:
 *   ≥ 1  já começou (o número do dia útil de casa),
 *   ≤ 0  ainda não começou — faltam `1 - n` dias de calendário para o primeiro dia,
 *   null sem data de início.
 */
export function diaUtilDeOnboarding(iso: string | null): number | null {
  const inicio = parseISODate(iso)
  if (!inicio) return null

  const hoje = hojeLocal()
  if (hoje < inicio) {
    // Contagem regressiva até a data de início: aí o calendário é o que importa.
    return 1 - Math.round((inicio.getTime() - hoje.getTime()) / DIA_MS)
  }
  // Início em fim de semana e ainda é fim de semana → já é "Dia 1" (nada vencido).
  return Math.max(1, diasUteisEntre(inicio, hoje))
}
