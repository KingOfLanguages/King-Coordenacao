import { abaDoIncidente, type Aba, type Incidente } from '@/hooks/useIncidentes'

// ─────────────────────────────────────────────────────────────────────────────
// Identificação e relato de um incidente.
//
// Duas coisas que antes se perdiam e agora têm fonte única:
//
// 1. IDENTIFICAÇÃO — quem é o professor e quem é o aluno, pelo ID do King, não
//    só pelo nome. Nome de professor vem sujo do cadastro (ver semSufixoInicio)
//    e do aluno guardamos só o primeiro nome (LGPD), então "Ana" não identifica
//    ninguém. O ID identifica, e é com ele que dá pra abrir o caso no King.
//
// 2. RELATO — o que exatamente é o problema (description), como aconteceu
//    (passos) e quando aconteceu (ocorrido_em, ≠ created_at). Obrigatório na
//    aba Plataforma: bug sem passo a passo e sem hora chega no TI como
//    "não funciona" e volta pra gente pedindo o que já devia estar escrito.
//
// Usado pela UI (formulários e detalhe), pelo texto copiável e pelo payload
// que a extensão digita na plataforma de chamados do TI.
// ─────────────────────────────────────────────────────────────────────────────

/** Piso de caracteres da descrição quando o relato completo é exigido. Não é
 *  medida de qualidade — só barra o "deu erro" de duas palavras. */
export const MIN_DESCRICAO_RELATO = 40

/** Abas em que o relato estruturado (o quê + como + quando) é obrigatório. */
export function relatoCompletoObrigatorio(aba: Aba): boolean {
  return aba === 'plataforma'
}

/** O que ainda falta pra poder registrar. Lista vazia = pode salvar.
 *  Mesma régua no criar e no editar — por isso mora aqui, não no formulário. */
export function faltasDoRelato(input: {
  aba: Aba
  descricao: string
  passos: string
  ocorridoEm: string
}): string[] {
  const faltas: string[] = []
  const descricao = input.descricao.trim()
  if (!descricao) faltas.push('o que exatamente é o problema')

  if (!relatoCompletoObrigatorio(input.aba)) return faltas

  if (descricao && descricao.length < MIN_DESCRICAO_RELATO) faltas.push('uma descrição mais detalhada do problema')
  if (!input.passos.trim()) faltas.push('como aconteceu')
  if (!input.ocorridoEm.trim()) faltas.push('quando aconteceu')
  return faltas
}

// ─── ID do King ───────────────────────────────────────────────────────────────

/** "#1234" a partir de um ID do King, ou null quando não há ID. */
export function idKing(valor: string | number | null | undefined): string | null {
  const v = String(valor ?? '').trim()
  return v ? `#${v}` : null
}

/** "Fulano (King #1234)" — o nome sozinho quando o professor não tem ID. */
export function rotuloProfessor(i: Pick<Incidente, 'teacher_name' | 'professor_kms_id'>): string {
  const id = idKing(i.professor_kms_id)
  return id ? `${i.teacher_name} (King ${id})` : i.teacher_name
}

/** "Ana (King #98765)" — null quando o incidente não cita aluno nenhum. */
export function rotuloAluno(i: Pick<Incidente, 'aluno_nome' | 'aluno_id'>): string | null {
  const nome = i.aluno_nome?.trim()
  const id = idKing(i.aluno_id)
  if (!nome && !id) return null
  if (!nome) return `aluno King ${id}`
  return id ? `${nome} (King ${id})` : nome
}

// ─── Datas ────────────────────────────────────────────────────────────────────

export function dataHoraFmt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** ISO → "YYYY-MM-DDTHH:mm" pro <input type="datetime-local"> (fuso local — o
 *  toISOString() jogaria pra UTC e mostraria a hora errada). */
export function isoParaDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Valor do <input type="datetime-local"> → ISO. Vazio/inválido vira null. */
export function datetimeLocalParaISO(valor: string): string | null {
  if (!valor) return null
  const d = new Date(valor)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** Teto do campo "quando aconteceu": agora. O fato já aconteceu — data futura
 *  é sempre engano de digitação. */
export function agoraDatetimeLocal(): string {
  return isoParaDatetimeLocal(new Date().toISOString())
}

// ─── Bloco de identificação em texto (copiar / chamado do TI) ─────────────────

/** Linhas "Professor / Aluno / Quando aconteceu" prontas pra colar num texto.
 *  É o mínimo que qualquer equipe de fora precisa pra saber de quem se trata. */
export function linhasIdentificacao(i: Incidente): string[] {
  const linhas: string[] = []
  const rotulo = i.professor_id ? 'Professor' : 'Referência'
  linhas.push(`${rotulo}: ${rotuloProfessor(i)}`)

  const aluno = rotuloAluno(i)
  if (aluno) linhas.push(`Aluno: ${aluno}`)

  linhas.push(
    i.ocorrido_em
      ? `Quando aconteceu: ${dataHoraFmt(i.ocorrido_em)}`
      : `Quando aconteceu: não informado (registrado em ${dataHoraFmt(i.created_at)})`,
  )
  return linhas
}

/** Bloco "COMO ACONTECEU" — omitido quando ninguém preencheu. */
export function linhasPassos(i: Incidente): string[] {
  const passos = i.passos?.trim()
  if (!passos) return []
  return ['', 'COMO ACONTECEU', passos]
}

/** Conveniência pra UI: o incidente tem identificação suficiente pra alguém de
 *  fora agir? Usado pra avisar em incidente de plataforma sem professor/aluno. */
export function semIdentificacao(i: Incidente): boolean {
  return abaDoIncidente(i) === 'plataforma' && !i.professor_id && !rotuloAluno(i)
}
