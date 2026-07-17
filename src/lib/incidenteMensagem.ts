import { tiStatusLabel } from '@/lib/nexusLabels'
import { statusChamado, natureza as naturezaDe, abaDoIncidente, type Incidente } from '@/hooks/useIncidentes'

// ─────────────────────────────────────────────────────────────────────────────
// Texto de um incidente pronto para copiar e apresentar a uma equipe externa
// (fora do sistema). Formato profissional e completo: reúne todo o contexto do
// chamado, os links das imagens anexadas (bucket público → abrem no navegador)
// e a URL que abre o incidente específico dentro do sistema.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  aberto:       'Em aberto',
  em_andamento: 'Em andamento',
  concluido:    'Concluído',
}

const ABA_LABEL: Record<string, string> = {
  professor:  'Professor',
  geral:      'Geral',
  plataforma: 'Plataforma',
}

function dataFmt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** URL que abre este incidente específico no sistema (deep-link da lista). */
export function urlDoIncidente(id: string, origin: string = window.location.origin): string {
  return `${origin}/incidentes?incidente=${id}`
}

/** Texto completo e profissional do incidente, pronto para copiar/enviar. */
export function buildMensagemIncidente(i: Incidente, origin?: string): string {
  const status       = STATUS_LABEL[statusChamado(i)] ?? statusChamado(i)
  const aba          = ABA_LABEL[abaDoIncidente(i)] ?? ''
  const isInforme    = naturezaDe(i) === 'informe'
  const isPlataforma = abaDoIncidente(i) === 'plataforma'
  const ref          = i.id.slice(0, 8).toUpperCase()

  const linhas: string[] = []
  linhas.push(`INCIDENTE #${ref} — ${i.problem_type}`)
  linhas.push('──────────────────────────────')
  linhas.push(`Referência: ${i.teacher_name}`)
  if (i.aluno_nome) linhas.push(`Aluno: ${i.aluno_nome}`)
  linhas.push(`Categoria: ${i.problem_type}${aba ? ` (${aba})` : ''}`)
  linhas.push(`Urgência: ${i.urgency}`)
  linhas.push(`Status: ${status}${isInforme ? ' · Informe' : ''}`)
  if (isPlataforma && i.ti_status) {
    linhas.push(`Situação no TI: ${tiStatusLabel[i.ti_status] ?? i.ti_status}`)
  }
  linhas.push(`Registrado por: ${i.coordinator}`)
  if (i.responsavel_nome) linhas.push(`Responsável: ${i.responsavel_nome}`)
  linhas.push(`Aberto em: ${dataFmt(i.created_at)}`)
  if (!i.resolved && i.assumido_por_nome) {
    linhas.push(`Em atendimento por: ${i.assumido_por_nome}`)
  }

  linhas.push('')
  linhas.push('DESCRIÇÃO')
  linhas.push(i.description?.trim() || '(sem descrição registrada)')

  if (i.resolved && i.solution?.trim()) {
    linhas.push('')
    linhas.push('SOLUÇÃO / RESULTADO')
    linhas.push(i.solution.trim())
    if (i.resolved_at) {
      linhas.push(`Concluído em ${dataFmt(i.resolved_at)}${i.assumido_por_nome ? ` por ${i.assumido_por_nome}` : ''}`)
    }
  }

  if (i.image_urls.length > 0) {
    linhas.push('')
    linhas.push(`ANEXOS (${i.image_urls.length}) — abrem no navegador`)
    i.image_urls.forEach((url, idx) => linhas.push(`${idx + 1}. ${url}`))
  }

  linhas.push('')
  linhas.push(`Ver no sistema: ${urlDoIncidente(i.id, origin)}`)

  return linhas.join('\n')
}
