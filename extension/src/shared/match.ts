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
