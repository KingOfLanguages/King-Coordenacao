import { useMemo, useState, type ReactNode } from 'react'
import {
  Plus, Search, FolderKanban, Inbox, CircleHelp, CalendarClock,
  TriangleAlert, CheckCircle2, User2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useNomesPorPerfilId } from '@/hooks/usePerfisPublicos'
import {
  useProjetos, usePedidosInfo, useSouLideranca, type Projeto,
} from '@/hooks/useProjetos'
import { NovoProjetoDialog } from '@/components/projetos/NovoProjetoDialog'
import { ProjetoDetalheDialog } from '@/components/projetos/ProjetoDetalheDialog'
import {
  FASES_PROJETO, PRIORIDADE_META, STATUS_META, TIPO_LABEL,
  FAIXA_PRAZO_CLS, prazoProjeto, fmtData,
} from '@/lib/projetos'
import { cn } from '@/lib/utils'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

type Aba = 'aprovacao' | 'andamento' | 'encerrados'

/** Controle de projetos da King: da sugestão à entrega. Coordenação e Suporte
 *  sugerem, a liderança aprova e acompanha as fases. */
export function ProjetosPage() {
  const { data: projetos = [], isLoading } = useProjetos()
  const { data: pedidos = [] } = usePedidosInfo()
  const { mapa: nomes } = useNomesPorPerfilId()
  const souLideranca = useSouLideranca()

  const [aba, setAba]       = useState<Aba>('aprovacao')
  const [busca, setBusca]   = useState('')
  const [novo, setNovo]     = useState(false)
  const [detalhe, setDetalhe] = useState<Projeto | null>(null)

  // Perguntas ainda sem resposta, por projeto — vira o selo no cartão.
  const abertosPorProjeto = useMemo(() => {
    const m = new Map<string, number>()
    for (const q of pedidos) {
      if (!q.resposta) m.set(q.projeto_id, (m.get(q.projeto_id) ?? 0) + 1)
    }
    return m
  }, [pedidos])

  const filtrados = useMemo(() => {
    const q = norm(busca)
    if (!q) return projetos
    return projetos.filter(p =>
      norm(`${p.titulo} ${p.descricao} ${p.impacto ?? ''} ${nomes.get(p.criado_por ?? '') ?? ''}`).includes(q),
    )
  }, [projetos, busca, nomes])

  const propostas  = filtrados.filter(p => p.status === 'proposto')
  const emCurso    = filtrados.filter(p => p.status === 'aprovado' && p.fase !== 'concluido')
  const encerrados = filtrados.filter(
    p => p.status === 'recusado' || p.status === 'cancelado' || (p.status === 'aprovado' && p.fase === 'concluido'),
  )

  const atrasados = emCurso.filter(p => prazoProjeto(p.data_entrega, p.fase).faixa === 'atrasado').length
  const entregues = projetos.filter(p => p.status === 'aprovado' && p.fase === 'concluido').length

  const abas: { key: Aba; label: string; n: number }[] = [
    { key: 'aprovacao',  label: 'Aguardando aprovação', n: propostas.length },
    { key: 'andamento',  label: 'Em andamento',         n: emCurso.length },
    { key: 'encerrados', label: 'Encerrados',           n: encerrados.length },
  ]

  return (
    <div className="px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
            <FolderKanban className="h-5 w-5 text-accentBlue" />
            Projetos da King
          </h1>
          <p className="text-[13px] text-ink-muted">
            Sugestões de melhoria do time, aprovação da liderança e acompanhamento até a entrega.
          </p>
        </div>
        <Button onClick={() => setNovo(true)}>
          <Plus /> Sugerir projeto
        </Button>
      </header>

      {/* Faixa de números — sem card dentro de card, só divisórias. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        <Metrica icone={<Inbox className="h-3.5 w-3.5" />} label="Aguardando aprovação" valor={propostas.length} />
        <Metrica icone={<CalendarClock className="h-3.5 w-3.5" />} label="Em andamento" valor={emCurso.length} />
        <Metrica
          icone={<TriangleAlert className="h-3.5 w-3.5" />} label="Passaram do prazo" valor={atrasados}
          destaque={atrasados > 0 ? 'text-urg-highFg' : undefined}
        />
        <Metrica icone={<CheckCircle2 className="h-3.5 w-3.5" />} label="Entregues" valor={entregues} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-canvas p-1">
          {abas.map(a => (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={cn(
                'btn-press rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                aba === a.key ? 'bg-surface-subtle text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {a.label}
              <span className="ml-1.5 tabular-nums text-ink-subtle">{a.n}</span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
          <Input
            placeholder="Buscar projeto…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="h-9 border-line bg-surface-canvas pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-surface h-24 animate-pulse bg-surface-subtle/50 p-4" />
          ))}
        </div>
      ) : aba === 'andamento' ? (
        <QuadroFases
          projetos={emCurso}
          nomes={nomes}
          abertos={abertosPorProjeto}
          onAbrir={setDetalhe}
        />
      ) : (
        <Lista
          projetos={aba === 'aprovacao' ? propostas : encerrados}
          nomes={nomes}
          abertos={abertosPorProjeto}
          onAbrir={setDetalhe}
          vazio={
            aba === 'aprovacao'
              ? souLideranca
                ? 'Nenhuma proposta esperando decisão.'
                : 'Nenhuma sugestão em avaliação. Mande a sua.'
              : 'Nada encerrado por aqui ainda.'
          }
        />
      )}

      <NovoProjetoDialog open={novo} onOpenChange={setNovo} />
      <ProjetoDetalheDialog
        open={!!detalhe}
        onOpenChange={v => { if (!v) setDetalhe(null) }}
        /* Relê da lista pra o painel refletir a aprovação sem fechar e reabrir. */
        projeto={detalhe ? projetos.find(p => p.id === detalhe.id) ?? detalhe : null}
      />
    </div>
  )
}

// ─── Peças ───────────────────────────────────────────────────────────────────

function Metrica({ icone, label, valor, destaque }: {
  icone: ReactNode; label: string; valor: number; destaque?: string
}) {
  return (
    <div className="bg-surface-canvas px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {icone} {label}
      </p>
      <p className={cn('mt-0.5 text-[22px] font-semibold tabular-nums text-ink', destaque)}>{valor}</p>
    </div>
  )
}

interface ListaProps {
  projetos: Projeto[]
  nomes: Map<string, string>
  abertos: Map<string, number>
  onAbrir: (p: Projeto) => void
  vazio: string
}

function Lista({ projetos, nomes, abertos, onAbrir, vazio }: ListaProps) {
  if (projetos.length === 0) {
    return (
      <div className="card-surface flex flex-col items-center justify-center gap-2 py-16 text-center">
        <FolderKanban className="h-7 w-7 text-ink-subtle" />
        <p className="text-[13px] font-medium text-ink-secondary">{vazio}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2.5">
      {projetos.map(p => (
        <CartaoProjeto key={p.id} projeto={p} nomes={nomes} abertos={abertos.get(p.id) ?? 0} onAbrir={onAbrir} largo />
      ))}
    </div>
  )
}

function QuadroFases({ projetos, nomes, abertos, onAbrir }: Omit<ListaProps, 'vazio'>) {
  const emAndamento = FASES_PROJETO.filter(f => f.key !== 'concluido')
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {emAndamento.map(f => {
        const daFase = projetos.filter(p => p.fase === f.key)
        return (
          <div key={f.key} className="space-y-2.5">
            <div className="flex items-center gap-2 px-0.5">
              <span className={cn('h-1.5 w-1.5 rounded-full', f.dot)} />
              <h2 className={cn('text-[12px] font-semibold uppercase tracking-wide', f.head)}>{f.label}</h2>
              <span className="text-[11px] tabular-nums text-ink-subtle">{daFase.length}</span>
            </div>
            <div className="space-y-2.5">
              {daFase.length === 0 && (
                <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[11.5px] text-ink-subtle">
                  Nenhum projeto nesta fase.
                </div>
              )}
              {daFase.map(p => (
                <CartaoProjeto key={p.id} projeto={p} nomes={nomes} abertos={abertos.get(p.id) ?? 0} onAbrir={onAbrir} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CartaoProjeto({ projeto, nomes, abertos, onAbrir, largo }: {
  projeto: Projeto
  nomes: Map<string, string>
  abertos: number
  onAbrir: (p: Projeto) => void
  largo?: boolean
}) {
  const st = STATUS_META[projeto.status]
  const pr = PRIORIDADE_META[projeto.prioridade]
  const prazo = prazoProjeto(projeto.data_entrega, projeto.fase)
  const mostraPrazo = projeto.status === 'aprovado' && prazo.faixa !== 'no_prazo'

  return (
    <button
      onClick={() => onAbrir(projeto)}
      className="card-surface w-full space-y-2 p-3.5 text-left transition-colors hover:bg-surface-subtle/40"
    >
      <div className={cn('flex gap-2', largo ? 'items-start justify-between' : 'flex-col')}>
        <div className="min-w-0 space-y-1">
          <p className="truncate text-[13.5px] font-medium text-ink">{projeto.titulo}</p>
          <p className={cn('text-[12px] leading-relaxed text-ink-muted', largo ? 'line-clamp-2' : 'line-clamp-3')}>
            {projeto.descricao}
          </p>
        </div>
        {largo && (
          <span className={cn('flex-shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium', st.cls)}>
            {st.label}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10.5px] font-medium text-ink-secondary">
          {TIPO_LABEL[projeto.tipo]}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-medium', pr.cls)}>{pr.label}</span>
        {mostraPrazo && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium', FAIXA_PRAZO_CLS[prazo.faixa])}>
            <CalendarClock className="h-3 w-3" />{prazo.texto}
          </span>
        )}
        {abertos > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-aviso-warnBg px-2 py-0.5 text-[10.5px] font-medium text-aviso-warnFg">
            <CircleHelp className="h-3 w-3" />
            {abertos === 1 ? '1 pergunta aberta' : `${abertos} perguntas abertas`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-ink-muted">
        <span className="inline-flex items-center gap-1 truncate">
          <User2 className="h-3 w-3" />
          {nomes.get(projeto.criado_por ?? '') ?? '—'}
        </span>
        <span className="tabular-nums">{fmtData(projeto.created_at)}</span>
        {projeto.responsavel_id && (
          <span className="truncate">→ {nomes.get(projeto.responsavel_id) ?? '—'}</span>
        )}
      </div>
    </button>
  )
}
