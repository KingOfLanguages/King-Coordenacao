// ─────────────────────────────────────────────────────────────────────────────
// Labels/tons compartilhados entre as telas que exibem dados do King Nexus
// (ProfessorDetalhePage e MesAnalisePage) — evita duplicar os mesmos mapas.
// ─────────────────────────────────────────────────────────────────────────────

export const urgenciaChip: Record<string, string> = {
  Baixa: 'bg-urg-lowBg text-urg-lowFg',
  Média: 'bg-urg-medBg text-urg-medFg',
  Alta:  'bg-urg-highBg text-urg-highFg',
  Crítico: 'bg-urg-critBg text-urg-critFg',
}

export const urgenciaBorda: Record<string, string> = {
  Baixa: 'border-urg-lowFg/40',
  Média: 'border-urg-medFg/40',
  Alta:  'border-urg-highFg/40',
  Crítico: 'border-urg-critFg/50',
}

/** Explicação curta de cada nível de urgência — usada no tooltip da badge. */
export const URGENCIA_EXPLICACAO: Record<string, string> = {
  Baixa: 'Pode aguardar — sem impacto imediato no professor ou aluno.',
  Média: 'Precisa de atenção nos próximos dias.',
  Alta: 'Impacta professor/aluno agora — priorizar o quanto antes.',
  Crítico: 'Risco grave ou urgente — tratar imediatamente.',
}

/** Rótulo do estado de atendimento do TI (aba Plataforma). */
export const tiStatusLabel: Record<string, string> = {
  chamado_aberto: 'Chamado aberto',
  em_analise_ti: 'Em análise pelo TI',
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
