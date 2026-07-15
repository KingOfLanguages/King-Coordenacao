// Mesma lógica de normalização/match por nome usada no daily-import
// (supabase/functions/daily-import/index.ts), adaptada para uma lista de
// strings candidatas (nomes de participantes do Meet) em vez de um CalEvent.

export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

const CONECTIVOS = new Set(['de', 'da', 'do', 'dos', 'das', 'e'])

export function matchProfessorPorNome<T extends { id: string; nome: string }>(
  candidatos: string[],
  professores: T[],
): T | null {
  const candidatosNorm = candidatos.map(norm).filter(Boolean)
  if (!professores.length || !candidatosNorm.length) return null

  const scores: Array<{ prof: T; score: number }> = []

  for (const prof of professores) {
    const nomeNorm  = norm(prof.nome)
    const nameParts = nomeNorm.split(' ').filter(p => p.length > 1 && !CONECTIVOS.has(p))
    if (!nameParts.length) continue

    if (candidatosNorm.some(c => c === nomeNorm || c.includes(nomeNorm))) return prof

    if (nameParts.length < 2) {
      if (candidatosNorm.some(c => c.includes(nameParts[0]))) scores.push({ prof, score: 1 })
      continue
    }

    const first = nameParts[0], second = nameParts[1], last = nameParts[nameParts.length - 1]
    if (candidatosNorm.some(c => c.includes(first) && c.includes(second))) return prof
    if (candidatosNorm.some(c => c.includes(first) && c.includes(last)))   return prof

    const bestScore = candidatosNorm.reduce((b, c) => Math.max(b, nameParts.filter(p => c.includes(p)).length), 0)
    const hasFirst  = candidatosNorm.some(c => c.includes(first))
    if (hasFirst && bestScore >= 2) scores.push({ prof, score: bestScore })
  }

  if (!scores.length) return null
  return scores.sort((a, b) => b.score - a.score)[0].prof
}

export function matchProfessorPorEmail(
  emails: string[],
  emailRows: { professor_id: string; email: string }[],
): string | null {
  const lower = emails.map(e => e.toLowerCase().trim())
  const hit = emailRows.find(r => lower.includes(r.email.toLowerCase().trim()))
  return hit?.professor_id ?? null
}

// ── Sugestão de "nomes próximos" para a busca manual ─────────────────────────
// Quando a busca por texto não resolve num único professor, oferece os nomes
// mais parecidos pra o coordenador escolher (mesma ideia do portal /agendar).
// Ferramenta interna e autenticada, então o limiar é mais generoso.

function toks(s: string): string[] {
  return norm(s).split(' ').filter(p => p.length > 1 && !CONECTIVOS.has(p))
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  const dp = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[n]
}

function simToken(a: string, b: string): number {
  if (a === b) return 1
  if (b.startsWith(a) || a.startsWith(b)) return 0.9
  const maxLen = Math.max(a.length, b.length)
  return maxLen ? 1 - levenshtein(a, b) / maxLen : 0
}

function scoreNome(ti: string[], tr: string[]): number {
  if (!ti.length || !tr.length) return 0
  let total = 0
  for (const x of ti) {
    let best = 0
    for (const y of tr) best = Math.max(best, simToken(x, y))
    total += best
  }
  return total / ti.length
}

export function sugerirProfessores<T extends { id: string; nome: string }>(
  texto: string, professores: T[], max = 6, minScore = 0.45,
): (T & { score: number })[] {
  const ti = toks(texto)
  if (!ti.length) return []
  return professores
    .map(p => ({ ...p, score: scoreNome(ti, toks(p.nome)) }))
    .filter(x => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
}

/** Confiança (0..1) do match automático: melhor similaridade entre os nomes
 *  candidatos (participantes do Meet) e o nome do professor identificado. */
export function confiancaMatch(candidatos: string[], nome: string): number {
  const tr = toks(nome)
  let best = 0
  for (const c of candidatos) best = Math.max(best, scoreNome(toks(c), tr))
  return best
}
