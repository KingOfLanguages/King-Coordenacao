// ─────────────────────────────────────────────────────────────────────────────
// Labels/tons compartilhados entre as telas que exibem dados do King Nexus
// (ProfessorDetalhePage e MesAnalisePage) — evita duplicar os mesmos mapas.
// ─────────────────────────────────────────────────────────────────────────────

export const urgenciaChip: Record<string, string> = {
  Baixa: 'bg-urg-lowBg text-urg-lowFg',
  Média: 'bg-urg-medBg text-urg-medFg',
  Alta:  'bg-urg-highBg text-urg-highFg',
}

export const urgenciaBorda: Record<string, string> = {
  Baixa: 'border-urg-lowFg/40',
  Média: 'border-urg-medFg/40',
  Alta:  'border-urg-highFg/40',
}

export const nivelLabel: Record<string, string> = {
  observacao: 'Observação',
  alerta:     'Alerta',
  critico:    'Crítico',
}

export const nivelChip: Record<string, string> = {
  observacao: 'bg-surface-subtle text-ink-secondary',
  alerta:     'bg-urg-medBg text-urg-medFg',
  critico:    'bg-urg-highBg text-urg-highFg',
}

export function statusEscalonamento(t: { problem_resolved: boolean; forwarded_to_coordination: boolean }): { label: string; cls: string } {
  if (t.problem_resolved) return { label: 'Resolvido', cls: 'bg-urg-lowBg text-urg-lowFg' }
  if (t.forwarded_to_coordination) return { label: 'Encaminhado à coordenação', cls: 'bg-urg-highBg text-urg-highFg' }
  return { label: 'Em acompanhamento', cls: 'bg-urg-medBg text-urg-medFg' }
}
