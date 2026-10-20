// ─────────────────────────────────────────────────────────────────────────────
// Exportar uma lista da tela para Excel (.xlsx). A biblioteca só carrega no
// clique, como no export do Welcome Path — ninguém precisa dela até pedir.
//
// Datas saem como data de verdade (ordena e filtra no Excel), não como texto.
// Não entregamos Date direto ao xlsx: a conversão dele usa o fuso de 1899 de
// São Paulo (−3h06) e meia-noite cai no dia anterior. O serial é calculado
// aqui, com a data e a hora locais.
//
// Toda planilha leva uma aba "Sobre": quando foi gerada, quantas linhas de
// quantas, os filtros e o que cada coluna conta — o número não sai da tela
// sem a regra junto.
// ─────────────────────────────────────────────────────────────────────────────

export type ValorXlsx = string | number | boolean | Date | null | undefined
export type LinhaXlsx = Record<string, ValorXlsx>

const EPOCA_EXCEL = Date.UTC(1899, 11, 30)
const LARGURA_MAX = 60
const FMT_DIA = 'dd/mm/yyyy'
const FMT_DIA_HORA = 'dd/mm/yyyy hh:mm'

function serialExcel(d: Date): number {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds())
  return (utc - EPOCA_EXCEL) / 86_400_000
}

/** ISO (date ou timestamptz) → Date local, com a hora. 'AAAA-MM-DD' é o dia, não meia-noite UTC. */
export function dataHoraXlsx(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Só o dia, sem a hora. */
export function diaXlsx(iso: string | null | undefined): Date | null {
  const d = dataHoraXlsx(iso)
  d?.setHours(0, 0, 0, 0)
  return d
}

function hojeArquivo(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Baixa `<arquivo>-AAAA-MM-DD.xlsx` com a aba `aba` (as linhas, cabeçalho com
 * filtro do Excel) e a aba "Sobre". As colunas são as chaves da primeira linha;
 * booleano vira Sim/Não, null fica em branco.
 */
export async function baixarXlsx({ arquivo, aba, linhas, sobre }: {
  arquivo: string
  aba: string
  linhas: LinhaXlsx[]
  sobre: [string, string | number][]
}): Promise<void> {
  const XLSX = await import('xlsx')
  const colunas = Object.keys(linhas[0] ?? {})
  const larguras = colunas.map(c => c.length)
  const formatos = new Map<string, string>()   // célula → formato de data

  const corpo = linhas.map((l, i) => colunas.map((c, j): string | number | null => {
    const v = l[c]
    if (v == null || v === '') return null
    if (v instanceof Date) {
      const comHora = v.getHours() + v.getMinutes() + v.getSeconds() > 0
      formatos.set(XLSX.utils.encode_cell({ r: i + 1, c: j }), comHora ? FMT_DIA_HORA : FMT_DIA)
      larguras[j] = Math.max(larguras[j], comHora ? 16 : 10)
      return serialExcel(v)
    }
    const s = typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : v
    larguras[j] = Math.max(larguras[j], String(s).length)
    return s
  }))

  const ws = XLSX.utils.aoa_to_sheet([colunas, ...corpo])
  for (const [ref, z] of formatos) ws[ref].z = z
  ws['!cols'] = larguras.map(w => ({ wch: Math.min(w, LARGURA_MAX) + 2 }))
  if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] }

  const agora = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', '')
  const wsSobre = XLSX.utils.aoa_to_sheet([['Gerado em', agora], ...sobre])
  wsSobre['!cols'] = [{ wch: 26 }, { wch: 100 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, aba.slice(0, 31))
  XLSX.utils.book_append_sheet(wb, wsSobre, 'Sobre')
  XLSX.writeFile(wb, `${arquivo}-${hojeArquivo()}.xlsx`)
}
