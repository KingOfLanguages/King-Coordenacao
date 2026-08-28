// ─────────────────────────────────────────────────────────────────────────────
// Permanência do aluno com o professor — "quanto tempo um aluno fica com ele".
//
// Duas populações, que respondem coisas diferentes e NÃO podem ser somadas:
//
//   • concluídas — alunos que já saíram (professor_ciclo_vida_alunos). É a
//     permanência de verdade, com as duas pontas fechadas. É também um número
//     enviesado para baixo: quem está com o professor há três anos e continua
//     lá nunca entra nesta conta.
//   • em curso — carteira de hoje (professor_alunos_kms.data_adicao). Mede há
//     quanto tempo cada vínculo vivo dura ATÉ AGORA; sempre menor do que a
//     permanência final desses alunos.
//
// Data de entrada das concluídas (ver migration 20260774):
//   1. data_entrada_professor — exata, capturada do roster antes de o vínculo
//      sumir. Só existe em saídas registradas a partir de 2026-08-28.
//   2. data_inicio_aulas — primeira aula do aluno NA ESCOLA. Coincide com a
//      entrada de quem nunca trocou de professor; para quem trocou, INFLA a
//      permanência. Entra como aproximação e é contada em `aproximadas`.
//   3. sem nenhuma das duas → a saída fica de fora da média (`semData`).
//
// A base do King tem data corrompida em quantidade não-trivial ('0001-01-01',
// 1979, 2060…). Tudo passa por `diaValido` antes de virar conta.
// ─────────────────────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000

/** Descarta a data-lixo do King (sentinelas e anos impossíveis). */
function diaValido(d: string | null | undefined): string | null {
  if (!d) return null
  const s = String(d).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const ano = Number(s.slice(0, 4))
  if (ano < 2015 || ano > new Date().getFullYear() + 1) return null
  return s
}

function emDias(inicio: string, fim: string): number | null {
  const a = new Date(`${inicio}T00:00:00`).getTime()
  const b = new Date(`${fim}T00:00:00`).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null
  return Math.floor((b - a) / DIA_MS)
}

const media = (v: number[]): number | null =>
  v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null

const mediana = (v: number[]): number | null => {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

// ─── Entradas ────────────────────────────────────────────────────────────────

export interface VinculoAtivo {
  data_adicao: string | null
}

export interface VinculoEncerrado {
  data_saida: string
  data_entrada_professor?: string | null
  data_inicio_aulas?: string | null
  saiu_da_escola?: boolean | null
}

export interface Coorte {
  n: number
  mediaDias: number | null
  medianaDias: number | null
}

export interface Permanencia {
  /** Alunos que já saíram — permanência fechada. */
  concluidas: Coorte & {
    /** Quantas usaram data_inicio_aulas no lugar da entrada exata. */
    aproximadas: number
    /** Saídas sem data de entrada utilizável (ficaram fora da média). */
    semData: number
  }
  /** Recorte das concluídas: saiu da escola (churn) × trocou de professor. */
  churn: Coorte
  troca: Coorte
  /** Carteira de hoje — tempo decorrido, ainda em curso. */
  emCurso: Coorte & { maisAntigoDias: number | null }
  /** Faixas de tempo, para ver a forma da distribuição e não só a média. */
  faixas: { label: string; concluidas: number; emCurso: number }[]
  /** Falso quando não há nenhuma saída medível — a UI some com o número. */
  temConcluidas: boolean
}

const FAIXAS: { label: string; ate: number }[] = [
  { label: 'até 3 meses',  ate: 90 },
  { label: '3 a 6 meses',  ate: 180 },
  { label: '6 a 12 meses', ate: 365 },
  { label: '1 ano ou +',   ate: Infinity },
]

function faixaDe(dias: number): number {
  return FAIXAS.findIndex(f => dias < f.ate)
}

/** Data de entrada usável de uma saída + se ela é a aproximação por 1ª aula. */
function entradaDaSaida(s: VinculoEncerrado): { dia: string; aproximada: boolean } | null {
  const exata = diaValido(s.data_entrada_professor)
  if (exata) return { dia: exata, aproximada: false }
  const aprox = diaValido(s.data_inicio_aulas)
  if (aprox) return { dia: aprox, aproximada: true }
  return null
}

export function calcularPermanencia(
  ativos: VinculoAtivo[],
  saidas: VinculoEncerrado[],
  hoje: Date = new Date(),
): Permanencia {
  const hojeISO = hoje.toLocaleDateString('en-CA')

  const diasConcluidas: number[] = []
  const diasChurn: number[] = []
  const diasTroca: number[] = []
  const contConcluidas = FAIXAS.map(() => 0)
  let aproximadas = 0
  let semData = 0

  for (const s of saidas) {
    const saida = diaValido(s.data_saida)
    const entrada = saida ? entradaDaSaida(s) : null
    const dias = saida && entrada ? emDias(entrada.dia, saida) : null
    if (dias === null) { semData++; continue }

    diasConcluidas.push(dias)
    if (entrada!.aproximada) aproximadas++
    contConcluidas[faixaDe(dias)]++
    if (s.saiu_da_escola === true)  diasChurn.push(dias)
    if (s.saiu_da_escola === false) diasTroca.push(dias)
  }

  const diasEmCurso: number[] = []
  const contEmCurso = FAIXAS.map(() => 0)
  for (const a of ativos) {
    const inicio = diaValido(a.data_adicao)
    const dias = inicio ? emDias(inicio, hojeISO) : null
    if (dias === null) continue
    diasEmCurso.push(dias)
    contEmCurso[faixaDe(dias)]++
  }

  const coorte = (v: number[]): Coorte => ({
    n: v.length, mediaDias: media(v), medianaDias: mediana(v),
  })

  return {
    concluidas: { ...coorte(diasConcluidas), aproximadas, semData },
    churn: coorte(diasChurn),
    troca: coorte(diasTroca),
    emCurso: {
      ...coorte(diasEmCurso),
      maisAntigoDias: diasEmCurso.length ? Math.max(...diasEmCurso) : null,
    },
    faixas: FAIXAS.map((f, i) => ({
      label: f.label, concluidas: contConcluidas[i], emCurso: contEmCurso[i],
    })),
    temConcluidas: diasConcluidas.length > 0,
  }
}

// ─── Rótulos ─────────────────────────────────────────────────────────────────

/** "23 dias" · "4 meses" · "1 ano e 2 meses". Meses de 30,44 dias (média real do
 *  ano); a alternativa — contar mês a mês — não faz sentido numa média de dias. */
export function duracaoLabel(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return '—'
  if (dias < 45) return `${dias} ${dias === 1 ? 'dia' : 'dias'}`
  const meses = Math.round(dias / 30.44)
  if (meses < 12) return `${meses} meses`
  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  const parteAnos = `${anos} ${anos === 1 ? 'ano' : 'anos'}`
  return resto === 0 ? parteAnos : `${parteAnos} e ${resto} ${resto === 1 ? 'mês' : 'meses'}`
}

/** Versão curta para caber em chip/tooltip: "8m", "1a 2m", "23d". */
export function duracaoCurta(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return '—'
  if (dias < 45) return `${dias}d`
  const meses = Math.round(dias / 30.44)
  if (meses < 12) return `${meses}m`
  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  return resto === 0 ? `${anos}a` : `${anos}a ${resto}m`
}

/** Dias entre uma data e hoje (ou entre duas datas), já filtrando data-lixo. */
export function diasEntre(inicio: string | null | undefined, fim?: string | null): number | null {
  const a = diaValido(inicio)
  if (!a) return null
  const b = fim ? diaValido(fim) : new Date().toLocaleDateString('en-CA')
  if (!b) return null
  return emDias(a, b)
}
