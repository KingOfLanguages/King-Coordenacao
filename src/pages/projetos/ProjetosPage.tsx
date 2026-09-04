import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, Search, FolderKanban, Inbox, CircleHelp, CalendarClock,
  TriangleAlert, CheckCircle2, User2, CircleAlert, MapPin, PencilLine,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useNomesPorPerfilId } from '@/hooks/usePerfisPublicos'
import {
  useProjetos, usePedidosInfo, useContagemEtapas, useSouLideranca, type Projeto,
} from '@/hooks/useProjetos'
import { FichaProjetoAssistente } from '@/components/projetos/FichaProjetoAssistente'
import { ProgressoEtapas } from '@/components/projetos/FluxogramaEtapas'
import {
  FASES_PROJETO, URGENCIA_META, STATUS_META, TIPO_LABEL, ONDE_LABEL,
  FAIXA_PRAZO_CLS, itensFicha, prazoProjeto, fmtData,
} from '@/lib/projetos'
import { cn } from '@/lib/utils'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

type Aba = 'aprovacao' | 'andamento' | 'encerrados' | 'rascunhos'

type Contagens = Map<string, { total: number; feitas: number }>

/** Controle de projetos da King: da sugestão à entrega. Coordenação e Suporte
 *  sugerem, a liderança aprova e acompanha as fases. */
export function ProjetosPage() {
  const { data: projetos = [], isLoading } = useProjetos()
  const { data: pedidos = [] } = usePedidosInfo()
  const { data: contagem = new Map() as Contagens } = useContagemEtapas()
  const { mapa: nomes } = useNomesPorPerfilId()
  const souLideranca = useSouLideranca()

  const [aba, setAba]   = useState<Aba>('aprovacao')
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)
  const [continuando, setContinuando] = useState<string | null>(null)

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
      norm([
        p.titulo, p.descricao, p.objetivo ?? '', p.resultado_esperado ?? '',
        nomes.get(p.criado_por ?? '') ?? '',
      ].join(' ')).includes(q),
    )
  }, [projetos, busca, nomes])

  // Rascunho é do autor: a RLS já só devolve os meus.
  const rascunhos  = filtrados.filter(p => p.status === 'rascunho')
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
    ...(rascunhos.length ? [{ key: 'rascunhos' as Aba, label: 'Meus rascunhos', n: rascunhos.length }] : []),
  ]

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
            <FolderKanban className="h-5 w-5 text-accentBlue" />
            Projetos da King
          </h1>
          <p className="max-w-2xl text-[13px] text-ink-muted">
            Sugestões do time, aprovação da liderança e acompanhamento até a entrega. A ficha vai
            completa — é o que o TI precisa para executar sem perguntar nada.
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
        <QuadroFases projetos={emCurso} nomes={nomes} abertos={abertosPorProjeto} contagem={contagem} />
      ) : aba === 'rascunhos' ? (
        <ListaRascunhos rascunhos={rascunhos} contagem={contagem} onContinuar={setContinuando} />
      ) : (
        <Lista
          projetos={aba === 'aprovacao' ? propostas : encerrados}
          nomes={nomes}
          abertos={abertosPorProjeto}
          contagem={contagem}
          vazio={
            aba === 'aprovacao'
              ? souLideranca
                ? 'Nenhuma proposta esperando decisão.'
                : 'Nenhuma sugestão em avaliação. Mande a sua.'
              : 'Nada encerrado por aqui ainda.'
          }
        />
      )}

      <FichaProjetoAssistente open={novo} onOpenChange={setNovo} />
      <FichaProjetoAssistente
        open={!!continuando}
        onOpenChange={v => { if (!v) setContinuando(null) }}
        rascunhoId={continuando}
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
  contagem: Contagens
  vazio: string
}

function Lista({ projetos, nomes, abertos, contagem, vazio }: ListaProps) {
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
        <CartaoProjeto
          key={p.id} projeto={p} nomes={nomes}
          abertos={abertos.get(p.id) ?? 0} etapas={contagem.get(p.id)} largo
        />
      ))}
    </div>
  )
}

function ListaRascunhos({ rascunhos, contagem, onContinuar }: {
  rascunhos: Projeto[]; contagem: Contagens; onContinuar: (id: string) => void
}) {
  return (
    <div className="space-y-2.5">
      {rascunhos.map(p => {
        const faltam = itensFicha(p, contagem.get(p.id)?.total ?? 0).filter(i => !i.ok).length
        return (
          <div key={p.id} className="card-surface flex flex-wrap items-center justify-between gap-2 p-3.5">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium text-ink">{p.titulo || 'Rascunho sem título'}</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-ink-muted">
                {faltam > 0
                  ? <><CircleAlert className="h-3 w-3" />Faltam {faltam} {faltam === 1 ? 'item' : 'itens'} para enviar</>
                  : 'Ficha completa — pronta para enviar'}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/projetos/${p.id}`}>Abrir</Link>
              </Button>
              <Button size="sm" onClick={() => onContinuar(p.id)}>
                <PencilLine /> Continuar
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function QuadroFases({ projetos, nomes, abertos, contagem }: Omit<ListaProps, 'vazio'>) {
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
                <CartaoProjeto
                  key={p.id} projeto={p} nomes={nomes}
                  abertos={abertos.get(p.id) ?? 0} etapas={contagem.get(p.id)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CartaoProjeto({ projeto, nomes, abertos, etapas, largo }: {
  projeto: Projeto
  nomes: Map<string, string>
  abertos: number
  etapas?: { total: number; feitas: number }
  largo?: boolean
}) {
  const st = STATUS_META[projeto.status]
  const urg = URGENCIA_META[projeto.prioridade]
  const prazo = prazoProjeto(projeto.data_entrega, projeto.fase)
  const mostraPrazo = projeto.status === 'aprovado' && prazo.faixa !== 'no_prazo'
  // Ficha que chegou incompleta: a liderança precisa ver isso antes de decidir.
  const faltam = itensFicha(projeto, etapas?.total ?? 0).filter(i => !i.ok).length

  return (
    <Link
      to={`/projetos/${projeto.id}`}
      className="card-surface block w-full space-y-2 p-3.5 text-left transition-colors hover:bg-surface-subtle/40"
    >
      <div className={cn('flex gap-2', largo ? 'items-start justify-between' : 'flex-col')}>
        <div className="min-w-0 space-y-1">
          <p className="truncate text-[13.5px] font-medium text-ink">{projeto.titulo}</p>
          <p className={cn('text-[12px] leading-relaxed text-ink-muted', largo ? 'line-clamp-2' : 'line-clamp-3')}>
            {projeto.objetivo || projeto.descricao}
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
        {projeto.onde_aplicado && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-[10.5px] font-medium text-ink-secondary">
            <MapPin className="h-3 w-3" />{ONDE_LABEL[projeto.onde_aplicado]}
          </span>
        )}
        <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-medium', urg.cls)}>{urg.label}</span>
        {mostraPrazo && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium', FAIXA_PRAZO_CLS[prazo.faixa])}>
            <CalendarClock className="h-3 w-3" />{prazo.texto}
          </span>
        )}
        {faltam > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-aviso-warnBg px-2 py-0.5 text-[10.5px] font-medium text-aviso-warnFg">
            <CircleAlert className="h-3 w-3" />Ficha incompleta
          </span>
        )}
        {abertos > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-aviso-warnBg px-2 py-0.5 text-[10.5px] font-medium text-aviso-warnFg">
            <CircleHelp className="h-3 w-3" />
            {abertos === 1 ? '1 pergunta aberta' : `${abertos} perguntas abertas`}
          </span>
        )}
      </div>

      {projeto.status === 'aprovado' && etapas && etapas.total > 0 && (
        <ProgressoEtapas total={etapas.total} feitas={etapas.feitas} />
      )}

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
    </Link>
  )
}
