import { useState } from 'react'
import { FileDown, FileSpreadsheet, FileText, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import {
  exportarXLSX, exportarPDF,
  formatarIncidentesXLSX, formatarIncidentesPDF,
  formatarProfessoresXLSX, formatarReunioesPDF,
} from '@/lib/exportar'
import { toast } from 'sonner'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

type TipoRelatorio = 'incidentes' | 'professores' | 'reunioes'

interface ConfigRelatorio {
  tipo: TipoRelatorio
  mes?: number
  ano: number
}

const configs: Record<TipoRelatorio, {
  label: string
  descricao: string
  colsPDF: string[]
  temFiltroMes: boolean
}> = {
  incidentes: {
    label: 'Incidentes',
    descricao: 'Lista de incidentes com status, tipo e professor vinculado.',
    colsPDF: ['Data', 'Tipo', 'Professor', 'Descrição', 'Status'],
    temFiltroMes: true,
  },
  professores: {
    label: 'Professores',
    descricao: 'Visão geral dos professores com reuniões e observações.',
    colsPDF: ['Nome', 'Tempo na King', 'Início', 'Monitor.', 'Reuniões', 'Obs.'],
    temFiltroMes: false,
  },
  reunioes: {
    label: 'Reuniões',
    descricao: 'Histórico de reuniões por coordenador e professor.',
    colsPDF: ['Data', 'Professor', 'Coordenador', 'Status', 'Notas'],
    temFiltroMes: true,
  },
}

type ReuniaoExport = { data: string; professores: { nome: string } | null; profiles: { nome: string } | null; status: string; notas: string | null }
type ProfessorExport = { nome: string; tempo_na_king: string | null; data_inicio: string | null; monitoramento: boolean; reunioes?: unknown[]; observacoes?: unknown[] }

export function RelatoriosPage() {
  const hoje = new Date()
  const [config, setConfig] = useState<ConfigRelatorio>({
    tipo: 'incidentes',
    mes: hoje.getMonth() + 1,
    ano: hoje.getFullYear(),
  })
  const [loading, setLoading] = useState<'xlsx' | 'pdf' | null>(null)

  async function buscarDados() {
    const { tipo, mes, ano } = config
    const cfg = configs[tipo]

    if (tipo === 'incidentes') {
      let query = supabase
        .from('incidentes')
        .select('*, professores(nome), criador:profiles!incidentes_criado_por_fkey(nome)')
        .order('created_at', { ascending: false })
      if (cfg.temFiltroMes && mes) {
        const inicio = new Date(ano, mes - 1, 1).toISOString()
        const fim    = new Date(ano, mes, 0, 23, 59, 59).toISOString()
        query = query.gte('created_at', inicio).lte('created_at', fim)
      }
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    } else if (tipo === 'professores') {
      const { data, error } = await supabase
        .from('professores')
        .select('*, reunioes(id), observacoes(id)')
        .order('nome')
      if (error) throw error
      return data ?? []
    } else {
      let query = supabase
        .from('reunioes')
        .select('*, professores(nome), profiles(nome)')
        .order('data', { ascending: false })
      if (cfg.temFiltroMes && mes) {
        const inicio = new Date(ano, mes - 1, 1).toISOString()
        const fim    = new Date(ano, mes, 0, 23, 59, 59).toISOString()
        query = query.gte('data', inicio).lte('data', fim)
      }
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    }
  }

  function nomeArquivo() {
    const { tipo, mes, ano } = config
    const sufixo = configs[tipo].temFiltroMes && mes
      ? `_${MESES[mes - 1].toLowerCase()}_${ano}`
      : `_${ano}`
    return `king_${tipo}${sufixo}`
  }

  async function handleXLSX() {
    setLoading('xlsx')
    try {
      const dados = await buscarDados()
      if (dados.length === 0) { toast.warning('Nenhum dado encontrado.'); return }

      const formatado = config.tipo === 'incidentes'
        ? formatarIncidentesXLSX(dados)
        : config.tipo === 'professores'
          ? formatarProfessoresXLSX(dados)
          : (dados as ReuniaoExport[]).map(r => ({
              Data:        new Date(r.data).toLocaleDateString('pt-BR'),
              Professor:   r.professores?.nome ?? '—',
              Coordenador: r.profiles?.nome ?? '—',
              Status:      r.status,
              Notas:       r.notas ?? '—',
            }))

      exportarXLSX(formatado, nomeArquivo())
      toast.success('Planilha gerada.')
    } catch {
      toast.error('Erro ao gerar planilha.')
    } finally {
      setLoading(null)
    }
  }

  async function handlePDF() {
    setLoading('pdf')
    try {
      const dados = await buscarDados()
      if (dados.length === 0) { toast.warning('Nenhum dado encontrado.'); return }

      const cfg = configs[config.tipo]
      const linhas = config.tipo === 'incidentes'
        ? formatarIncidentesPDF(dados)
        : config.tipo === 'reunioes'
          ? formatarReunioesPDF(dados)
          : (dados as ProfessorExport[]).map(p => [
              p.nome,
              p.tempo_na_king ?? '—',
              p.data_inicio ? new Date(p.data_inicio).toLocaleDateString('pt-BR') : '—',
              p.monitoramento ? 'Sim' : 'Não',
              p.reunioes?.length ?? 0,
              p.observacoes?.length ?? 0,
            ])

      const titulo = `Relatório de ${cfg.label}${
        cfg.temFiltroMes && config.mes
          ? ` — ${MESES[config.mes - 1]} ${config.ano}`
          : ` — ${config.ano}`
      }`

      exportarPDF(titulo, cfg.colsPDF, linhas, nomeArquivo())
      toast.success('PDF gerado.')
    } catch {
      toast.error('Erro ao gerar PDF.')
    } finally {
      setLoading(null)
    }
  }

  const cfg = configs[config.tipo]

  return (
    <div className="px-6 py-6 max-w-2xl mx-auto space-y-5">
      <header className="space-y-0.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Relatórios</h1>
        <p className="text-[13px] text-ink-muted">Exporte dados em XLSX ou PDF.</p>
      </header>

      <section className="card-surface p-6 space-y-5">
        <div className="space-y-1.5">
          <Label className="label-micro">Tipo de relatório</Label>
          <Select
            value={config.tipo}
            onValueChange={v => setConfig(c => ({ ...c, tipo: v as TipoRelatorio }))}
          >
            <SelectTrigger className="bg-surface-canvas border-line text-ink">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-surface-canvas border-line text-ink">
              {Object.entries(configs).map(([key, val]) => (
                <SelectItem key={key} value={key}>{val.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[12px] text-ink-muted pt-0.5">{cfg.descricao}</p>
        </div>

        {cfg.temFiltroMes && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="label-micro">Mês</Label>
              <Select
                value={String(config.mes ?? '')}
                onValueChange={v => setConfig(c => ({ ...c, mes: Number(v) }))}
              >
                <SelectTrigger className="bg-surface-canvas border-line text-ink">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="bg-surface-canvas border-line text-ink">
                  {MESES.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="label-micro">Ano</Label>
              <Select
                value={String(config.ano)}
                onValueChange={v => setConfig(c => ({ ...c, ano: Number(v) }))}
              >
                <SelectTrigger className="bg-surface-canvas border-line text-ink">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-canvas border-line text-ink">
                  {[2024, 2025, 2026].map(a => (
                    <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button
            onClick={handleXLSX}
            disabled={!!loading}
            className="btn-press flex-1 h-10 bg-urg-lowFg hover:bg-urg-lowFg/90 text-white gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {loading === 'xlsx' ? 'Gerando…' : 'Exportar XLSX'}
          </Button>
          <Button
            onClick={handlePDF}
            disabled={!!loading}
            variant="outline"
            className="btn-press flex-1 h-10 border-line text-ink-secondary hover:bg-surface-subtle gap-2"
          >
            <FileText className="h-4 w-4" />
            {loading === 'pdf' ? 'Gerando…' : 'Exportar PDF'}
          </Button>
        </div>
      </section>

      <aside className="flex items-start gap-3 rounded-xl border border-accentBlue/20 bg-accentBlue-soft/40 p-4">
        <span className="h-7 w-7 rounded-md bg-accentBlue-soft text-accentBlue flex items-center justify-center flex-shrink-0">
          <Info className="h-3.5 w-3.5" />
        </span>
        <div className="space-y-1 text-[13px] text-ink-secondary leading-relaxed">
          <p>Os arquivos são gerados e baixados diretamente no navegador.</p>
          <p className="inline-flex items-center gap-1.5 text-ink-muted">
            <FileDown className="h-3 w-3" />
            XLSX abre no Excel ou Google Sheets. PDF inclui cabeçalho King of Languages.
          </p>
        </div>
      </aside>
    </div>
  )
}
