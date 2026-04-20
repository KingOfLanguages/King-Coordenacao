import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── XLSX ────────────────────────────────────────────────────────────────────

export function exportarXLSX(dados: Record<string, unknown>[], nomeArquivo: string) {
  const ws = XLSX.utils.json_to_sheet(dados)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Dados')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `${nomeArquivo}.xlsx`)
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export function exportarPDF(
  titulo: string,
  colunas: string[],
  linhas: (string | number)[][],
  nomeArquivo: string
) {
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.setTextColor(196, 18, 48) // king-red
  doc.text('King of Languages', 14, 16)

  doc.setFontSize(12)
  doc.setTextColor(40, 40, 40)
  doc.text(titulo, 14, 26)

  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 33)

  autoTable(doc, {
    head: [colunas],
    body: linhas,
    startY: 38,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [196, 18, 48], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
  })

  doc.save(`${nomeArquivo}.pdf`)
}

// ─── Formatadores por tipo ────────────────────────────────────────────────────

export function formatarIncidentesXLSX(dados: any[]) {
  return dados.map(i => ({
    Data:        new Date(i.created_at).toLocaleDateString('pt-BR'),
    Tipo:        i.tipo,
    Professor:   i.professores?.nome ?? '—',
    Descrição:   i.descricao,
    Status:      i.status,
    'Criado por': i.criador?.nome ?? '—',
  }))
}

export function formatarIncidentesPDF(dados: any[]): (string | number)[][] {
  return dados.map(i => [
    new Date(i.created_at).toLocaleDateString('pt-BR'),
    i.tipo,
    i.professores?.nome ?? '—',
    i.descricao.slice(0, 60) + (i.descricao.length > 60 ? '...' : ''),
    i.status,
  ])
}

export function formatarProfessoresXLSX(dados: any[]) {
  return dados.map(p => ({
    Nome:              p.nome,
    'Tempo na King':   p.tempo_na_king ?? '—',
    'Data Início':     p.data_inicio ? new Date(p.data_inicio).toLocaleDateString('pt-BR') : '—',
    Monitoramento:     p.monitoramento ? 'Sim' : 'Não',
    Pausa:             p.pausa ? 'Sim' : 'Não',
    'Total Reuniões':  p.reunioes?.length ?? 0,
    'Total Obs.':      p.observacoes?.length ?? 0,
  }))
}

export function formatarReunioesPDF(dados: any[]): (string | number)[][] {
  return dados.map(r => [
    new Date(r.data).toLocaleDateString('pt-BR'),
    r.professores?.nome ?? '—',
    r.profiles?.nome ?? '—',
    r.status,
    r.notas?.slice(0, 50) ?? '—',
  ])
}
