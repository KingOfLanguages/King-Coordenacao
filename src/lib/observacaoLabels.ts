// ─────────────────────────────────────────────────────────────────────────────
// Labels/tons compartilhados entre as telas que exibem observações de professor
// (ProfessorDetalhePage e ObservacaoDetalhePage) — evita duplicar os mesmos mapas.
// ─────────────────────────────────────────────────────────────────────────────

export const labelTipo: Record<string, string> = {
  reuniao:           'Reunião',
  ocorrencia:        'Ocorrência',
  feedback_positivo: 'Positivo',
  feedback_negativo: 'Negativo',
  feedback_neutro:   'Neutro',
}

export const dotTipo: Record<string, string> = {
  reuniao:           'bg-accentBlue',
  ocorrencia:        'bg-urg-medFg',
  feedback_positivo: 'bg-urg-lowFg',
  feedback_negativo: 'bg-urg-highFg',
  feedback_neutro:   'bg-ink-subtle',
}

export const borderTipo: Record<string, string> = {
  reuniao:           'border-accentBlue/40',
  ocorrencia:        'border-urg-medFg/40',
  feedback_positivo: 'border-urg-lowFg/40',
  feedback_negativo: 'border-urg-highFg/40',
  feedback_neutro:   'border-line',
}

export const chipTipo: Record<string, string> = {
  reuniao:           'bg-accentBlue-soft text-accentBlue',
  ocorrencia:        'bg-urg-medBg text-urg-medFg',
  feedback_positivo: 'bg-urg-lowBg text-urg-lowFg',
  feedback_negativo: 'bg-urg-highBg text-urg-highFg',
  feedback_neutro:   'bg-surface-subtle text-ink-secondary',
}
