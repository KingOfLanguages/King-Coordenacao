import { hojeLocal, parseISODate } from '@/lib/diasUteis'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário dos Projetos da King (ver migration 20260776_projetos_king.sql).
//
// Duas dimensões de propósito separadas:
//   • status → a proposta foi aprovada pela liderança? (proposto/aprovado/…)
//   • fase   → onde o projeto APROVADO está (planejamento → concluído)
// Misturar as duas numa coluna só faria "recusado" competir com "em andamento".
// ─────────────────────────────────────────────────────────────────────────────

export type ProjetoTipo       = 'sistema' | 'processo' | 'pessoas' | 'outro'
export type ProjetoPrioridade = 'baixa' | 'media' | 'alta'
export type ProjetoStatus     = 'proposto' | 'aprovado' | 'recusado' | 'cancelado'
export type ProjetoFase       = 'planejamento' | 'em_andamento' | 'validacao' | 'concluido'

export const TIPO_PROJETO: { key: ProjetoTipo; label: string; descricao: string }[] = [
  { key: 'sistema',  label: 'Melhoria no sistema',  descricao: 'Mudança na plataforma, na extensão ou em algum automatismo.' },
  { key: 'processo', label: 'Melhoria de processo',  descricao: 'Como o time trabalha: régua, rotina, fluxo de atendimento.' },
  { key: 'pessoas',  label: 'Pessoas e treinamento', descricao: 'Capacitação, material de apoio, cultura do time.' },
  { key: 'outro',    label: 'Outro',                descricao: 'Não encaixou nas caixas acima.' },
]

export const TIPO_LABEL: Record<ProjetoTipo, string> =
  Object.fromEntries(TIPO_PROJETO.map(t => [t.key, t.label])) as Record<ProjetoTipo, string>

export const PRIORIDADE_META: Record<ProjetoPrioridade, { label: string; cls: string }> = {
  alta:  { label: 'Alta',  cls: 'bg-urg-highBg text-urg-highFg' },
  media: { label: 'Média', cls: 'bg-urg-medBg text-urg-medFg' },
  baixa: { label: 'Baixa', cls: 'bg-surface-subtle text-ink-secondary' },
}

export const STATUS_META: Record<ProjetoStatus, { label: string; cls: string }> = {
  proposto:  { label: 'Aguardando aprovação', cls: 'bg-aviso-warnBg text-aviso-warnFg' },
  aprovado:  { label: 'Aprovado',             cls: 'bg-aviso-okBg text-aviso-okFg' },
  recusado:  { label: 'Recusado',             cls: 'bg-urg-highBg text-urg-highFg' },
  cancelado: { label: 'Cancelado',            cls: 'bg-surface-subtle text-ink-muted' },
}

export const FASES_PROJETO: { key: ProjetoFase; label: string; dot: string; head: string }[] = [
  { key: 'planejamento', label: 'Planejamento', dot: 'bg-urg-medFg',    head: 'text-urg-medFg' },
  { key: 'em_andamento', label: 'Em andamento', dot: 'bg-accentBlue',   head: 'text-accentBlue' },
  { key: 'validacao',    label: 'Validação',    dot: 'bg-aviso-infoFg', head: 'text-aviso-infoFg' },
  { key: 'concluido',    label: 'Concluído',    dot: 'bg-urg-lowFg',    head: 'text-urg-lowFg' },
]

export const FASE_LABEL: Record<ProjetoFase, string> =
  Object.fromEntries(FASES_PROJETO.map(f => [f.key, f.label])) as Record<ProjetoFase, string>

/** Próxima fase na régua — null quando já está na última. */
export function proximaFase(fase: ProjetoFase): ProjetoFase | null {
  const i = FASES_PROJETO.findIndex(f => f.key === fase)
  return i >= 0 && i < FASES_PROJETO.length - 1 ? FASES_PROJETO[i + 1].key : null
}

// ─── Prazo de entrega ────────────────────────────────────────────────────────
// Dias de calendário, não dias úteis: prazo de projeto é combinado em data
// cheia ("entrega dia 30"), diferente do SLA de transferência.

export type FaixaPrazo = 'atrasado' | 'vence_hoje' | 'proximo' | 'no_prazo' | 'sem_prazo'

export interface PrazoProjeto {
  faixa: FaixaPrazo
  /** Dias até a entrega. Negativo = dias de atraso. null quando não há prazo. */
  dias: number | null
  texto: string
}

export function prazoProjeto(dataEntrega: string | null, fase: ProjetoFase): PrazoProjeto {
  if (fase === 'concluido') return { faixa: 'no_prazo', dias: null, texto: 'Entregue' }
  const alvo = parseISODate(dataEntrega)
  if (!alvo) return { faixa: 'sem_prazo', dias: null, texto: 'Sem prazo definido' }

  const dias = Math.round((alvo.getTime() - hojeLocal().getTime()) / 86_400_000)
  if (dias < 0)  return { faixa: 'atrasado',   dias, texto: `${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'} de atraso` }
  if (dias === 0) return { faixa: 'vence_hoje', dias, texto: 'Entrega hoje' }
  if (dias <= 7) return { faixa: 'proximo',    dias, texto: `Faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}` }
  return { faixa: 'no_prazo', dias, texto: `Faltam ${dias} dias` }
}

export const FAIXA_PRAZO_CLS: Record<FaixaPrazo, string> = {
  atrasado:   'bg-urg-highBg text-urg-highFg',
  vence_hoje: 'bg-aviso-warnBg text-aviso-warnFg',
  proximo:    'bg-aviso-infoBg text-aviso-infoFg',
  no_prazo:   'bg-surface-subtle text-ink-secondary',
  sem_prazo:  'bg-surface-subtle text-ink-muted',
}

// ─── Formatação ──────────────────────────────────────────────────────────────

export function fmtData(iso: string | null): string {
  if (!iso) return '—'
  const d = iso.length <= 10 ? parseISODate(iso) : new Date(iso)
  return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
}

export function fmtDataHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function iniciais(nome: string | null | undefined): string {
  return (nome ?? '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—'
}
