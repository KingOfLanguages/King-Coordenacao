import { hojeLocal, parseISODate } from '@/lib/diasUteis'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário dos Projetos da King (migrations 20260776 e 20260777).
//
// Duas dimensões de propósito separadas:
//   • status → a proposta foi aprovada pela liderança? (rascunho/proposto/…)
//   • fase   → onde o projeto APROVADO está (planejamento → concluído)
// Misturar as duas numa coluna só faria "recusado" competir com "em andamento".
//
// A régua da ficha (o que o TI exige) está em `pendenciasFicha` — espelho fiel
// de projeto_pendencias_ficha() no banco, que é quem realmente barra o envio.
// ─────────────────────────────────────────────────────────────────────────────

export type ProjetoTipo       = 'sistema' | 'processo' | 'pessoas' | 'outro'
export type ProjetoUrgencia   = 'baixa' | 'media' | 'alta' | 'critica'
export type ProjetoStatus     = 'rascunho' | 'proposto' | 'aprovado' | 'recusado' | 'cancelado'
export type ProjetoFase       = 'planejamento' | 'em_andamento' | 'validacao' | 'concluido'
export type ProjetoOnde       = 'kms' | 'aluno' | 'gestao' | 'extensao' | 'portal' | 'processo' | 'outro'
export type ProjetoNatureza   = 'melhoria' | 'novo'

export const TIPO_PROJETO: { key: ProjetoTipo; label: string; descricao: string }[] = [
  { key: 'sistema',  label: 'Melhoria no sistema',  descricao: 'Mudança na plataforma, na extensão ou em algum automatismo.' },
  { key: 'processo', label: 'Melhoria de processo',  descricao: 'Como o time trabalha: régua, rotina, fluxo de atendimento.' },
  { key: 'pessoas',  label: 'Pessoas e treinamento', descricao: 'Capacitação, material de apoio, cultura do time.' },
  { key: 'outro',    label: 'Outro',                descricao: 'Não encaixou nas caixas acima.' },
]

export const TIPO_LABEL: Record<ProjetoTipo, string> =
  Object.fromEntries(TIPO_PROJETO.map(t => [t.key, t.label])) as Record<ProjetoTipo, string>

// Onde a mudança encosta. O TI usa isso pra saber quem toca antes de ler o resto.
//
// Atenção ao vocabulário: quando o time diz "a plataforma", fala do King
// Management System ou da plataforma do aluno — NÃO desta ferramenta interna,
// que aqui aparece como "Gestão dos Professores".
export const ONDE_APLICADO: { key: ProjetoOnde; label: string; descricao: string }[] = [
  { key: 'kms',      label: 'King Management System', descricao: 'A plataforma onde o professor dá aula e lança a turma.' },
  { key: 'aluno',    label: 'Plataforma do aluno',    descricao: 'O que o aluno vê e usa.' },
  { key: 'gestao',   label: 'Gestão dos Professores', descricao: 'Esta ferramenta — as telas internas da coordenação e do suporte.' },
  { key: 'extensao', label: 'Extensão do Meet',       descricao: 'O painel que abre durante a reunião.' },
  { key: 'portal',   label: 'Portais do professor',   descricao: 'Nossas páginas públicas: agendamento, pausa, transferência, welcome path.' },
  { key: 'processo', label: 'Processo do time',       descricao: 'Rotina de trabalho — não necessariamente vira software.' },
  { key: 'outro',    label: 'Outro',                  descricao: 'Fora dos anteriores; explique no caminho.' },
]

export const ONDE_LABEL: Record<ProjetoOnde, string> =
  Object.fromEntries(ONDE_APLICADO.map(o => [o.key, o.label])) as Record<ProjetoOnde, string>

export const NATUREZA_PROJETO: { key: ProjetoNatureza; label: string; descricao: string }[] = [
  { key: 'melhoria', label: 'Melhoria de algo que já existe', descricao: 'Vamos precisar saber como fica diferente de hoje.' },
  { key: 'novo',     label: 'Algo que não existe hoje',       descricao: 'Nada para comparar — descreva do zero.' },
]

/** Urgência com definição objetiva por nível: sem isso, tudo vira "alta". */
export const URGENCIA_META: Record<ProjetoUrgencia, { label: string; cls: string; descricao: string }> = {
  critica: { label: 'Crítica', cls: 'bg-urg-critBg text-urg-critFg', descricao: 'Tem gente parada ou perdendo dado agora. Não dá para esperar a próxima semana.' },
  alta:    { label: 'Alta',    cls: 'bg-urg-highBg text-urg-highFg', descricao: 'Dói toda semana e já tem gambiarra no lugar.' },
  media:   { label: 'Média',   cls: 'bg-urg-medBg text-urg-medFg',   descricao: 'Incomoda, mas o trabalho anda sem isso.' },
  baixa:   { label: 'Baixa',   cls: 'bg-surface-subtle text-ink-secondary', descricao: 'Melhoraria a vida; sem prazo nenhum.' },
}

export const URGENCIAS: ProjetoUrgencia[] = ['critica', 'alta', 'media', 'baixa']

export const STATUS_META: Record<ProjetoStatus, { label: string; cls: string }> = {
  rascunho:  { label: 'Rascunho',              cls: 'bg-surface-subtle text-ink-muted' },
  proposto:  { label: 'Aguardando aprovação',  cls: 'bg-aviso-warnBg text-aviso-warnFg' },
  aprovado:  { label: 'Aprovado',              cls: 'bg-aviso-okBg text-aviso-okFg' },
  recusado:  { label: 'Recusado',              cls: 'bg-urg-highBg text-urg-highFg' },
  cancelado: { label: 'Cancelado',             cls: 'bg-surface-subtle text-ink-muted' },
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

// ─── A régua do TI ───────────────────────────────────────────────────────────
// "O projeto precisa estar muito bem explicado, de forma que uma criança
// entenda." Traduzido em itens verificáveis. Espelha projeto_pendencias_ficha()
// no banco — se mudar aqui, mude lá: quem barra o envio de verdade é o trigger.

/** Campos que a régua olha. Aceita o projeto salvo ou o rascunho em edição. */
export interface FichaVerificavel {
  titulo?: string | null
  onde_aplicado?: string | null
  caminho?: string | null
  objetivo?: string | null
  descricao?: string | null
  natureza?: string | null
  diferenca_hoje?: string | null
  passo_a_passo?: string | null
  resultado_esperado?: string | null
}

export interface ItemFicha {
  /** Passo do assistente onde o item é preenchido — leva a pessoa até lá. */
  passo: number
  label: string
  /** Por que o TI exige — aparece no checklist, não é enfeite. */
  porque: string
  ok: boolean
}

const tam = (v: string | null | undefined) => (v ?? '').trim().length

/** Checklist "Pronto para o TI". `ok` em todos = pode enviar. */
export function itensFicha(f: FichaVerificavel, totalEtapas: number): ItemFicha[] {
  const itens: ItemFicha[] = [
    {
      passo: 1, label: 'Um título que diga do que se trata', ok: tam(f.titulo) >= 4,
      porque: 'É o que a liderança lê primeiro na fila.',
    },
    {
      passo: 1, label: 'Onde será aplicado', ok: !!f.onde_aplicado,
      porque: 'Define quem toca o projeto antes mesmo de ler o resto.',
    },
    {
      passo: 2, label: 'O caminho até onde o problema aparece', ok: tam(f.caminho) >= 15,
      porque: 'Sem a trilha, quem for executar precisa adivinhar a tela.',
    },
    {
      passo: 2, label: 'O objetivo da melhoria', ok: tam(f.objetivo) >= 15,
      porque: 'Separa o que você quer resolver da solução que imaginou.',
    },
    {
      passo: 3, label: 'A descrição clara do projeto', ok: tam(f.descricao) >= 40,
      porque: 'É a explicação que precisa fazer sentido para quem nunca viu o problema.',
    },
  ]

  if (f.natureza !== 'novo') {
    itens.push({
      passo: 3, label: 'Como isso é diferente do que temos hoje', ok: tam(f.diferenca_hoje) >= 15,
      porque: 'Melhoria sem o "antes" não dá para avaliar nem testar depois.',
    })
  }

  itens.push(
    {
      passo: 4, label: 'Pelo menos duas etapas', ok: totalEtapas >= 2,
      porque: 'São elas que viram o fluxograma do funcionamento.',
    },
    {
      passo: 4, label: 'O passo a passo para funcionar', ok: tam(f.passo_a_passo) >= 20,
      porque: 'Como se usa depois de pronto — o TI entrega, o time precisa saber operar.',
    },
    {
      passo: 5, label: 'O resultado esperado', ok: tam(f.resultado_esperado) >= 15,
      porque: 'É contra isso que a gente confere se deu certo.',
    },
  )

  return itens
}

/** Só o que falta — mesma frase que o banco devolve na exceção de envio. */
export function pendenciasFicha(f: FichaVerificavel, totalEtapas: number): string[] {
  return itensFicha(f, totalEtapas).filter(i => !i.ok).map(i => i.label)
}

export function fichaCompleta(f: FichaVerificavel, totalEtapas: number): boolean {
  return pendenciasFicha(f, totalEtapas).length === 0
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

export function fmtTamanho(bytes: number | null): string {
  if (!bytes) return ''
  const mb = bytes / 1_048_576
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
