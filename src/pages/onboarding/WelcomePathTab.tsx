import { useMemo, useState } from 'react'
import { Search, Download, MessageCircle, Check, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { dataBR, fmtDuracao, diasAte } from '@/lib/formato'
import { LinkTrilha } from './LinkTrilha'
import { useProfessores } from '@/hooks/useProfessores'
import { useOnboarding } from '@/hooks/useOnboarding'
import {
  useEtapasAdmin, useProgressoTodos,
  type EtapaAdmin, type ProgressoAdmin,
} from '@/hooks/useWelcomePathAdmin'
import { ProfessorTrilhaDialog } from './ProfessorTrilhaDialog'

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Welcome Path": onde cada professor está na trilha.
//
// Quem entra na lista: quem está no acompanhamento de onboarding (os
// recém-chegados) MAIS qualquer professor que já tenha tocado a trilha — assim
// ninguém some da tela por ter passado dos 7 dias sem terminar.
// ─────────────────────────────────────────────────────────────────────────────

export type LinhaTrilha = {
  professorId: string
  nome: string
  telefone: string | null
  dataInicio: string | null
  concluidas: number
  totalObrigatorias: number
  etapaAtual: EtapaAdmin | null
  notaMedia: number | null
  tempoTotal: number
  revisaoPendente: boolean
  atrasada: EtapaAdmin | null
  iniciou: boolean
  porEtapa: Map<string, ProgressoAdmin>
}

type Filtro = 'atrasados' | 'andamento' | 'nao_iniciaram' | 'concluidos' | 'todos'

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/** Situação da etapa para o professor, na visão da coordenação. */
type EstadoCelula = 'concluida' | 'andamento' | 'atrasada' | 'revisao' | 'vazia'

const CELULA: Record<EstadoCelula, { cls: string; label: string }> = {
  concluida: { cls: 'bg-urg-lowBg text-urg-lowFg border-transparent',         label: 'OK' },
  andamento: { cls: 'bg-accentBlue-soft text-accentBlue border-transparent',  label: '···' },
  atrasada:  { cls: 'bg-urg-highBg text-urg-highFg border-transparent',       label: '!' },
  revisao:   { cls: 'bg-urg-medBg text-urg-medFg border-transparent',         label: 'rev' },
  vazia:     { cls: 'bg-surface-subtle text-ink-subtle border-line',          label: '—' },
}

function estadoCelula(p: ProgressoAdmin | undefined, etapa: EtapaAdmin, dataInicio: string | null): EstadoCelula {
  if (p?.revisao_pendente) return 'revisao'
  if (p?.concluida_em) return 'concluida'
  const vencida = etapa.prazo_dias != null && dataInicio != null
    && diasAte(dataBRparaISO(dataInicio, etapa.prazo_dias)) < 0
  if (vencida) return 'atrasada'
  if (p?.iniciada_em || (p?.tentativas ?? 0) > 0) return 'andamento'
  return 'vazia'
}

/** data_inicio + (prazo_dias - 1) em ISO — o dia limite da etapa. */
function dataBRparaISO(dataInicio: string, prazoDias: number): string {
  const [a, m, d] = dataInicio.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + prazoDias - 1)).toISOString().slice(0, 10)
}

function ChipSituacao({ linha }: { linha: LinhaTrilha }) {
  const { concluidas, totalObrigatorias } = linha
  let cls: string, label: string

  if (totalObrigatorias > 0 && concluidas >= totalObrigatorias) {
    cls = 'bg-urg-lowBg text-urg-lowFg'; label = 'Concluído'
  } else if (linha.revisaoPendente) {
    cls = 'bg-urg-medBg text-urg-medFg'; label = `${concluidas}/${totalObrigatorias} · revisar`
  } else if (linha.atrasada) {
    cls = 'bg-urg-highBg text-urg-highFg'; label = `${concluidas}/${totalObrigatorias} · atrasado`
  } else if (!linha.iniciou) {
    cls = 'bg-surface-subtle text-ink-muted'; label = 'Não iniciou'
  } else {
    cls = 'bg-accentBlue-soft text-accentBlue'
    label = linha.etapaAtual ? `${concluidas}/${totalObrigatorias} · Etapa ${linha.etapaAtual.ordem}` : `${concluidas}/${totalObrigatorias}`
  }

  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', cls)}>
      {label}
    </span>
  )
}

export function WelcomePathTab() {
  const { data: etapas = [], isLoading: carregandoEtapas } = useEtapasAdmin()
  const { data: progresso = [], isLoading: carregandoProgresso } = useProgressoTodos()
  const { data: professores = [] } = useProfessores()
  const { data: onboarding = [] } = useOnboarding()

  const [filtro, setFiltro] = useState<Filtro>('andamento')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<LinhaTrilha | null>(null)

  const ativas = useMemo(() => etapas.filter(e => e.ativa), [etapas])

  const linhas = useMemo<LinhaTrilha[]>(() => {
    const porProfessor = new Map<string, ProgressoAdmin[]>()
    for (const p of progresso) {
      porProfessor.set(p.professor_id, [...(porProfessor.get(p.professor_id) ?? []), p])
    }

    const ids = new Set<string>([
      ...onboarding.map(o => o.professor_id),
      ...porProfessor.keys(),
    ])

    const porId = new Map(professores.map(p => [p.id, p]))
    const obrigatorias = ativas.filter(e => e.obrigatoria)

    return [...ids].flatMap((id): LinhaTrilha[] => {
      const prof = porId.get(id)
      if (!prof || prof.status === 'desligado') return []

      const porEtapa = new Map((porProfessor.get(id) ?? []).map(p => [p.etapa_id, p]))
      const concluidas = obrigatorias.filter(e => porEtapa.get(e.id)?.concluida_em).length

      const notas = [...porEtapa.values()].map(p => p.nota).filter((n): n is number => n != null)
      const tempoTotal = [...porEtapa.values()].reduce((s, p) => s + p.tempo_segundos, 0)

      // Primeira etapa ativa ainda não concluída = onde ele está parado.
      const etapaAtual = ativas.find(e => !porEtapa.get(e.id)?.concluida_em) ?? null

      // Atrasada = a primeira etapa não concluída cujo prazo já venceu.
      const atrasada = prof.data_inicio
        ? ativas.find(e =>
            e.prazo_dias != null
            && !porEtapa.get(e.id)?.concluida_em
            && diasAte(dataBRparaISO(prof.data_inicio!, e.prazo_dias)) < 0) ?? null
        : null

      return [{
        professorId: id,
        nome: prof.nome,
        telefone: prof.telefone,
        dataInicio: prof.data_inicio,
        concluidas,
        totalObrigatorias: obrigatorias.length,
        etapaAtual,
        notaMedia: notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null,
        tempoTotal,
        revisaoPendente: [...porEtapa.values()].some(p => p.revisao_pendente),
        atrasada,
        iniciou: porEtapa.size > 0,
        porEtapa,
      }]
    })
  }, [progresso, professores, onboarding, ativas])

  function bucketDe(l: LinhaTrilha): Exclude<Filtro, 'todos'> {
    if (l.totalObrigatorias > 0 && l.concluidas >= l.totalObrigatorias) return 'concluidos'
    if (l.atrasada) return 'atrasados'
    if (!l.iniciou) return 'nao_iniciaram'
    return 'andamento'
  }

  const contagem = useMemo(() => {
    const c = { atrasados: 0, andamento: 0, nao_iniciaram: 0, concluidos: 0, todos: linhas.length }
    for (const l of linhas) c[bucketDe(l)]++
    return c
  }, [linhas])

  const visiveis = useMemo(() => {
    const q = norm(busca)
    const peso: Record<Exclude<Filtro, 'todos'>, number> =
      { atrasados: 0, andamento: 1, nao_iniciaram: 2, concluidos: 3 }
    return linhas
      .filter(l => filtro === 'todos' || bucketDe(l) === filtro)
      .filter(l => q.length === 0 || norm(l.nome).includes(q))
      .sort((a, b) => {
        const pa = peso[bucketDe(a)], pb = peso[bucketDe(b)]
        if (pa !== pb) return pa - pb
        return (a.dataInicio ?? '').localeCompare(b.dataInicio ?? '')
      })
  }, [linhas, filtro, busca])

  const chips: { id: Filtro; label: string; count: number }[] = [
    { id: 'atrasados',     label: 'Atrasados',    count: contagem.atrasados },
    { id: 'andamento',     label: 'Em andamento', count: contagem.andamento },
    { id: 'nao_iniciaram', label: 'Não iniciaram', count: contagem.nao_iniciaram },
    { id: 'concluidos',    label: 'Concluídos',   count: contagem.concluidos },
    { id: 'todos',         label: 'Todos',        count: contagem.todos },
  ]

  async function exportar() {
    const XLSX = await import('xlsx')
    const dados = visiveis.map(l => {
      const base: Record<string, string | number> = {
        Professor: l.nome,
        Telefone: l.telefone ?? '',
        Início: l.dataInicio ? dataBR(l.dataInicio) : '',
        Progresso: `${l.concluidas}/${l.totalObrigatorias}`,
        'Etapa atual': l.etapaAtual ? `Etapa ${l.etapaAtual.ordem}` : 'Concluiu',
        'Nota média': l.notaMedia != null ? Math.round(l.notaMedia) : '',
        'Tempo total': fmtDuracao(l.tempoTotal),
      }
      for (const e of ativas) {
        const p = l.porEtapa.get(e.id)
        base[`E${e.ordem}`] = p?.concluida_em ? dataBR(p.concluida_em.slice(0, 10)) : ''
      }
      return base
    })
    const ws = XLSX.utils.json_to_sheet(dados)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Welcome Path')
    XLSX.writeFile(wb, `welcome-path-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const carregando = carregandoEtapas || carregandoProgresso

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-ink-muted">
          Onde cada professor está na trilha de boas-vindas. O professor acessa pelo link público,
          se identifica pelo e-mail e a trilha destrava etapa por etapa.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <LinkTrilha />
          <Button size="sm" variant="outline" className="btn-press h-9 gap-1.5 border-line" onClick={exportar}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map(c => (
            <button
              key={c.id}
              onClick={() => setFiltro(c.id)}
              className={cn(
                'btn-press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                filtro === c.id
                  ? 'bg-surface-subtle text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                  : 'text-ink-secondary hover:bg-surface-subtle/60 hover:text-ink',
              )}
            >
              {c.label}
              <span className={cn(
                'inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] tabular-nums',
                filtro === c.id ? 'bg-accentBlue-soft text-accentBlue' : 'bg-surface-subtle text-ink-muted',
              )}>
                {c.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar professor…"
            className="h-9 w-[240px] rounded-xl border-line bg-surface-canvas pl-9 text-[13px]"
          />
        </div>
      </div>

      {carregando ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">Carregando…</div>
      ) : ativas.length === 0 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          Nenhuma etapa ativa na trilha. Publique o conteúdo na aba "Conteúdo".
        </div>
      ) : visiveis.length === 0 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          {linhas.length === 0
            ? 'Nenhum professor na trilha ainda. Assim que alguém abrir o link, aparece aqui.'
            : busca ? `Nenhum professor encontrado para "${busca}".` : 'Nada neste filtro.'}
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <div className="relative w-full overflow-x-auto">
            <table className="w-full caption-bottom">
              <thead>
                <tr className="border-b border-line-soft">
                  <th className="h-10 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Professor</th>
                  <th className="h-10 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Início</th>
                  {ativas.map(e => (
                    <th key={e.id} title={e.titulo} className="h-10 px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      E{e.ordem}
                    </th>
                  ))}
                  <th className="h-10 px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Nota</th>
                  <th className="h-10 px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Tempo</th>
                  <th className="h-10 px-2" />
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => (
                  <tr
                    key={l.professorId}
                    className={cn(
                      'cursor-pointer border-b border-line-soft transition-colors',
                      l.atrasada
                        ? 'border-l-2 border-l-urg-highFg/60 bg-urg-highBg/10 hover:bg-urg-highBg/20'
                        : l.revisaoPendente
                          ? 'border-l-2 border-l-urg-medFg/50 bg-urg-medBg/10 hover:bg-urg-medBg/20'
                          : 'hover:bg-surface-subtle/40',
                    )}
                    onClick={() => setAberto(l)}
                  >
                    <td className="p-2 align-middle">
                      <p className="whitespace-nowrap text-[13px] font-medium text-ink">{l.nome}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <ChipSituacao linha={l} />
                        {l.revisaoPendente && (
                          <span className="inline-flex items-center gap-1 text-[10.5px] text-urg-medFg">
                            <AlertTriangle className="h-3 w-3" /> revisar resposta
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap p-2 align-middle text-[12px] tabular-nums text-ink-secondary">
                      {l.dataInicio ? dataBR(l.dataInicio) : '—'}
                    </td>
                    {ativas.map(e => {
                      const estado = estadoCelula(l.porEtapa.get(e.id), e, l.dataInicio)
                      const cfg = CELULA[estado]
                      return (
                        <td key={e.id} className="p-2 text-center align-middle">
                          <span
                            title={`${e.titulo}${l.porEtapa.get(e.id)?.nota != null ? ` — ${Math.round(l.porEtapa.get(e.id)!.nota!)}%` : ''}`}
                            className={cn('inline-flex h-6 w-9 items-center justify-center rounded-md border text-[10.5px] font-medium', cfg.cls)}
                          >
                            {cfg.label}
                          </span>
                        </td>
                      )
                    })}
                    <td className="p-2 text-center align-middle text-[12px] tabular-nums text-ink-secondary">
                      {l.notaMedia != null ? `${Math.round(l.notaMedia)}%` : '—'}
                    </td>
                    <td className="whitespace-nowrap p-2 text-center align-middle text-[12px] text-ink-secondary">
                      {fmtDuracao(l.tempoTotal)}
                    </td>
                    <td className="p-2 text-right align-middle">
                      {l.telefone && (
                        <a
                          href={`https://wa.me/${l.telefone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={ev => ev.stopPropagation()}
                          title="Falar no WhatsApp"
                          className="btn-press inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-subtle hover:text-ink"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-urg-lowBg" /> Etapa concluída</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-accentBlue-soft" /> Em andamento</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-urg-medBg" /> Aguardando revisão</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-urg-highBg" /> Prazo vencido</span>
        <span className="text-line-soft">·</span>
        <span className="flex items-center gap-1.5"><Check className="h-3 w-3" /> Clique na linha para ver as respostas e liberar/resetar etapas</span>
      </div>

      {aberto && (
        <ProfessorTrilhaDialog
          linha={aberto}
          etapas={ativas}
          onFechar={() => setAberto(null)}
        />
      )}
    </div>
  )
}
