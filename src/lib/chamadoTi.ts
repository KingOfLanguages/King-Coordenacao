import { tiStatusLabel } from '@/lib/nexusLabels'
import { statusChamado, natureza as naturezaDe, abaDoIncidente, type Incidente } from '@/hooks/useIncidentes'
import { urlDoIncidente } from '@/lib/incidenteMensagem'

// ─────────────────────────────────────────────────────────────────────────────
// Ponte KTM → plataforma de chamados do TI (chamadostikingoflanguages).
//
// Aqui mora TODA a tradução do vocabulário: o incidente do KTM (categoria,
// urgência "Crítico", natureza, aba) vira exatamente os quatro campos que o
// formulário do TI aceita. A extensão de navegador é só um cano — ela lê este
// payload de um atributo `data-ktm-chamado` no card e digita no outro site.
//
// Consequência prática: categoria nova no KTM não exige atualizar a extensão.
// ─────────────────────────────────────────────────────────────────────────────

/** Urgências aceitas pelo formulário do TI. Atenção: lá é "Crítica", aqui "Crítico". */
export type UrgenciaTi = 'Baixa' | 'Média' | 'Alta' | 'Crítica'

/** Tipos aceitos pelo formulário do TI (valores dos radios). */
export type TipoTi = 'bug' | 'melhoria' | 'duvida' | 'solicitacao_diversa'

/** Limites do formulário do TI — truncamos aqui para nunca sermos rejeitados lá. */
const MAX_TITULO = 120
const MAX_DESCRICAO = 5000

export interface ChamadoTiPayload {
  /** Versão do contrato — a extensão recusa o que não souber ler. */
  v: 1
  /** id do incidente no KTM (evita mandar o mesmo chamado duas vezes). */
  id: string
  /** Referência curta e legível, a mesma usada na mensagem copiável. */
  ref: string
  titulo: string
  descricao: string
  urgencia: UrgenciaTi
  tipo: TipoTi
  /** URLs públicas das imagens do incidente — viram anexos do chamado. */
  anexos: string[]
  /** Deep-link que reabre o incidente no KTM. */
  link: string
}

const URGENCIA_TI: Record<string, UrgenciaTi> = {
  Baixa: 'Baixa',
  Média: 'Média',
  Alta: 'Alta',
  Crítico: 'Crítica',
}

/** Categoria do KTM → tipo do chamado. Só a aba Plataforma tem correspondência
 *  direta (Bugs/Melhorias); qualquer outro incidente chega ao TI como solicitação. */
const TIPO_TI: Record<string, TipoTi> = {
  Bugs: 'bug',
  Melhorias: 'melhoria',
}

const STATUS_LABEL: Record<string, string> = {
  aberto: 'Em aberto',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
}

function dataFmt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Corta no limite sem deixar palavra pela metade nem estourar com o "…". */
function truncar(texto: string, max: number): string {
  const t = texto.trim()
  if (t.length <= max) return t
  const corte = t.slice(0, max - 1)
  const espaco = corte.lastIndexOf(' ')
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).trimEnd()}…`
}

/** Título do chamado: para incidentes sem professor o `teacher_name` já é o
 *  rótulo livre que a pessoa escreveu; com professor, qualificamos a categoria. */
export function tituloChamadoTi(i: Incidente): string {
  const base = i.professor_id
    ? `${i.problem_type} — ${i.teacher_name}`
    : i.teacher_name?.trim() || i.problem_type
  return truncar(base, MAX_TITULO)
}

/** Descrição do chamado: a descrição do incidente primeiro (é o que o TI lê),
 *  seguida do contexto que ele não tem como adivinhar e do link de volta. */
export function descricaoChamadoTi(i: Incidente, origin?: string): string {
  const linhas: string[] = []

  linhas.push(i.description?.trim() || '(sem descrição registrada)')
  linhas.push('')
  linhas.push('──────────────────────────────')
  linhas.push(`Origem: incidente #${i.id.slice(0, 8).toUpperCase()} no KTM (${i.problem_type})`)
  linhas.push(`Referência: ${i.teacher_name}`)
  if (i.aluno_nome) linhas.push(`Aluno: ${i.aluno_nome}`)
  linhas.push(`Registrado por: ${i.coordinator} em ${dataFmt(i.created_at)}`)
  if (i.responsavel_nome) linhas.push(`Responsável no KTM: ${i.responsavel_nome}`)
  linhas.push(
    `Situação no KTM: ${STATUS_LABEL[statusChamado(i)] ?? statusChamado(i)}` +
    `${naturezaDe(i) === 'informe' ? ' · Informe' : ''}` +
    `${abaDoIncidente(i) === 'plataforma' && i.ti_status ? ` · ${tiStatusLabel[i.ti_status] ?? i.ti_status}` : ''}`,
  )

  if (i.image_urls.length > 0) {
    linhas.push('')
    linhas.push(`Anexos (${i.image_urls.length}):`)
    i.image_urls.forEach((url, idx) => linhas.push(`${idx + 1}. ${url}`))
  }

  linhas.push('')
  linhas.push(`Ver no KTM: ${urlDoIncidente(i.id, origin)}`)

  return truncar(linhas.join('\n'), MAX_DESCRICAO)
}

/** Payload completo que a extensão lê do DOM e digita na plataforma do TI. */
export function payloadChamadoTi(i: Incidente, origin?: string): ChamadoTiPayload {
  return {
    v: 1,
    id: i.id,
    ref: i.id.slice(0, 8).toUpperCase(),
    titulo: tituloChamadoTi(i),
    descricao: descricaoChamadoTi(i, origin),
    urgencia: URGENCIA_TI[i.urgency] ?? 'Média',
    tipo: TIPO_TI[i.problem_type] ?? 'solicitacao_diversa',
    anexos: i.image_urls ?? [],
    link: urlDoIncidente(i.id, origin),
  }
}

/** Atributos que marcam um elemento como "fonte de chamado" para a extensão.
 *  Espalhado no card da lista e no painel de detalhe — os dois lugares onde a
 *  pessoa decide mandar o incidente para o TI. */
export function atributosChamadoTi(i: Incidente): Record<string, string> {
  return {
    'data-ktm-incidente': i.id,
    'data-ktm-chamado': JSON.stringify(payloadChamadoTi(i)),
  }
}
