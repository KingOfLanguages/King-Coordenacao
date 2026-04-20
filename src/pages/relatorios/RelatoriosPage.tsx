import { useState } from 'react'
import { FileDown, FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
          : dados.map((r: any) => ({
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
          : dados.map((p: any) => [
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
    <div className="space-y-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Relatórios</h1>
        <p className="text-sm text-white/40 mt-0.5">Exporte dados em XLSX ou PDF</p>
      </div>

      <Card className="bg-king-card border-king-border p-6 space-y-5">
        <div className="space-y-1">
          <Label>Tipo de relatório</Label>
          <Select
            value={config.tipo}
            onValueChange={v => setConfig(c => ({ ...c, tipo: v as TipoRelatorio }))}
          >
            <SelectTrigger className="bg-king-dark border-king-border text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-king-card border-king-border text-white">
              {Object.entries(configs).map(([key, val]) => (
                <SelectItem key={key} value={key}>{val.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-white/40 pt-1">{cfg.descricao}</p>
        </div>

        {cfg.temFiltroMes && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Mês</Label>
              <Select
                value={String(config.mes ?? '')}
                onValueChange={v => setConfig(c => ({ ...c, mes: Number(v) }))}
              >
                <SelectTrigger className="bg-king-dark border-king-border text-white">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="bg-king-card border-king-border text-white">
                  {MESES.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ano</Label>
              <Select
                value={String(config.ano)}
                onValueChange={v => setConfig(c => ({ ...c, ano: Number(v) }))}
              >
                <SelectTrigger className="bg-king-dark border-king-border text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-king-card border-king-border text-white">
                  {[2024, 2025, 2026].map(a => (
                    <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleXLSX}
            disabled={!!loading}
            className="flex-1 bg-emerald-700 hover:bg-emerald-600 gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {loading === 'xlsx' ? 'Gerando...' : 'Exportar XLSX'}
          </Button>
          <Button
            onClick={handlePDF}
            disabled={!!loading}
            variant="outline"
            className="flex-1 border-king-border text-white/70 hover:text-white gap-2"
          >
            <FileText className="h-4 w-4" />
            {loading === 'pdf' ? 'Gerando...' : 'Exportar PDF'}
          </Button>
        </div>
      </Card>

      <Card className="bg-king-card border-king-border p-4">
        <div className="flex items-start gap-3">
          <FileDown className="h-5 w-5 text-white/30 mt-0.5 flex-shrink-0" />
          <div className="space-y-1 text-sm text-white/40">
            <p>Os arquivos são gerados e baixados diretamente no seu navegador.</p>
            <p>XLSX pode ser aberto no Excel ou Google Sheets. PDF inclui cabeçalho King of Languages.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
