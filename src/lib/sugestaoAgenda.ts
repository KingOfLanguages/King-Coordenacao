// ─────────────────────────────────────────────────────────────────────────────
// Sugestão de dia/horário para a reunião em grupo de um coordenador.
//
// Pergunta: "em que dia e hora uma reunião em grupo junta mais professores, sem
// bater com a reunião em grupo de outro coordenador?"
//
// Regra de contagem:
//   - Ocorrência = um horário de agenda que já passou (últimos N dias), de
//     QUALQUER coordenador, inclusive os que ficaram com zero inscritos.
//   - Presente   = professor com status 'realizada' na reunião daquele horário.
//   - Medida     = presentes por reunião (presentes ÷ ocorrências).
//
// Estimativa de um (dia, hora): quase nenhum par dia×hora tem histórico
// suficiente sozinho, então a média do próprio par é puxada para uma base que
// combina a média do DIA e a média da HORA (efeito de cada um sobre a média
// geral). Com K reuniões de "peso" para a base: par com poucas reuniões fica
// perto da base; par com muitas reuniões fica perto da própria média.
//
// Conflito = outro coordenador tem horário recorrente ATIVO que se sobrepõe
// (mesmo dia, intervalos de DURACAO_GRUPO_MIN se cruzando). Encostar (um acaba
// às 12h, outro começa às 12h) não é conflito.
// ─────────────────────────────────────────────────────────────────────────────

/** A duração não é cadastrada na agenda — toda reunião em grupo é tratada como 1h. */
export const DURACAO_GRUPO_MIN = 60

/** Peso (em reuniões) da base dia×hora na estimativa de um par. */
const PESO_BASE = 3

/** Mínimo de reuniões numa hora para ela virar candidata ("hora já testada"). */
const MIN_REUNIOES_HORA = 3

/** Dias candidatos: segunda a sexta. */
const DIAS_UTEIS = [1, 2, 3, 4, 5]

export const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const DIAS_NOME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export type Ocorrencia = {
  dia: number            // 0 = domingo
  hora: number           // hora cheia, horário de Brasília
  recorrenciaId: string | null
  coordenadorId: string | null
  inscritos: number
  presentes: number
}

export type HorarioFixo = {
  recorrenciaId: string
  dia: number
  minutos: number        // minutos desde 00:00
  coordenadorId: string | null
  coordenadorNome: string
  ativo: boolean
}

export type Acumulado = { reunioes: number; presentes: number; inscritos: number }

export type Sugestao = {
  dia: number
  hora: number
  /** Presentes por reunião estimados para o par dia×hora. */
  estimativa: number
  par: Acumulado
  doDia: Acumulado
  daHora: Acumulado
  /** Horários ativos de outros coordenadores no mesmo dia (não conflitam). */
  mesmoDia: HorarioFixo[]
}

export type ResultadoSugestao = {
  sugestoes: Sugestao[]
  geral: Acumulado
}

const vazio = (): Acumulado => ({ reunioes: 0, presentes: 0, inscritos: 0 })

function somar(acc: Acumulado, o: Ocorrencia) {
  acc.reunioes += 1
  acc.presentes += o.presentes
  acc.inscritos += o.inscritos
}

export function mediaPresentes(a: Acumulado): number {
  return a.reunioes ? a.presentes / a.reunioes : 0
}

export function sobrepoe(aMin: number, bMin: number, duracao = DURACAO_GRUPO_MIN): boolean {
  return aMin < bMin + duracao && bMin < aMin + duracao
}

export function sugerirHorarios({ ocorrencias, fixos, meuId, quantos = 3 }: {
  ocorrencias: Ocorrencia[]
  fixos: HorarioFixo[]
  /** Coordenador para quem a sugestão é feita — os horários dele não contam como conflito. */
  meuId: string | null
  quantos?: number
}): ResultadoSugestao {
  const geral = vazio()
  const porDia = new Map<number, Acumulado>()
  const porHora = new Map<number, Acumulado>()
  const porPar = new Map<string, Acumulado>()

  for (const o of ocorrencias) {
    somar(geral, o)
    if (!porDia.has(o.dia)) porDia.set(o.dia, vazio())
    somar(porDia.get(o.dia)!, o)
    if (!porHora.has(o.hora)) porHora.set(o.hora, vazio())
    somar(porHora.get(o.hora)!, o)
    const k = `${o.dia}-${o.hora}`
    if (!porPar.has(k)) porPar.set(k, vazio())
    somar(porPar.get(k)!, o)
  }

  const mediaGeral = mediaPresentes(geral)
  if (!geral.reunioes || mediaGeral === 0) return { sugestoes: [], geral }

  const horas = [...porHora.entries()]
    .filter(([, a]) => a.reunioes >= MIN_REUNIOES_HORA)
    .map(([h]) => h)
    .sort((a, b) => a - b)

  const outrosAtivos = fixos.filter(f => f.ativo && f.coordenadorId !== meuId)

  const melhorPorDia: Sugestao[] = []
  for (const dia of DIAS_UTEIS) {
    const doDia = porDia.get(dia) ?? vazio()
    // Dia sem histórico não puxa a estimativa nem para cima nem para baixo.
    const fatorDia = doDia.reunioes ? mediaPresentes(doDia) / mediaGeral : 1
    const mesmoDia = outrosAtivos
      .filter(f => f.dia === dia)
      .sort((a, b) => a.minutos - b.minutos)

    let melhor: Sugestao | null = null
    for (const hora of horas) {
      if (mesmoDia.some(f => sobrepoe(f.minutos, hora * 60))) continue
      const daHora = porHora.get(hora)!
      const base = mediaGeral * fatorDia * (mediaPresentes(daHora) / mediaGeral)
      const par = porPar.get(`${dia}-${hora}`) ?? vazio()
      const estimativa = (par.presentes + PESO_BASE * base) / (par.reunioes + PESO_BASE)
      if (!melhor || estimativa > melhor.estimativa) {
        melhor = { dia, hora, estimativa, par, doDia, daHora, mesmoDia }
      }
    }
    if (melhor) melhorPorDia.push(melhor)
  }

  melhorPorDia.sort((a, b) => b.estimativa - a.estimativa)
  return { sugestoes: melhorPorDia.slice(0, quantos), geral }
}

/** "3,6" — uma casa decimal, vírgula. */
export function umaCasa(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function horaLabel(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
