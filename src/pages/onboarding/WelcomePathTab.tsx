import { useMemo, useState } from 'react'
import {
  Search, Download, MessageCircle, Hourglass, Lock, CheckCircle2, Timer, UserX, Unlock,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { dataBR, fmtDuracao } from '@/lib/formato'
import { useAgora } from '@/hooks/useAgora'
import {
  ULTIMAS_HORAS_MS, dataHoraBR, fmtHaQuanto, fmtRestanteCurto, situacaoTrilha,
  type SituacaoTrilha,
} from '@/lib/prazoTrilha'
import { LinkTrilha } from './LinkTrilha'
import {
  useAcompanhamentoTrilha, useEtapasAdmin, useProgressoTodos,
  type AcompanhamentoTrilha, type ProgressoAdmin,
} from '@/hooks/useWelcomePathAdmin'
import { ProfessorTrilhaDialog } from './ProfessorTrilhaDialog'

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Welcome Path": onde cada professor novo está na trilha, com o prazo de
// 120h desde o 1º acesso (regra de 2026-10-07, migration 20260794).
//
// Automática, sem semear nada: entra todo professor ATIVO que chegou à King a
// partir de 07/10/2026 (aparece como "não acessou" até abrir o link) e quem já
// abriu a trilha. A lista vem pronta de `wp_acompanhamento()`; só a SITUAÇÃO é
// decidida aqui, porque depende do relógio — e o relógio anda com a tela aberta.
// ─────────────────────────────────────────────────────────────────────────────

export type LinhaTrilha = AcompanhamentoTrilha & {
  situacao: SituacaoTrilha
  porEtapa: Map<string, ProgressoAdmin>
}

type Filtro = 'abertos' | SituacaoTrilha | 'todos'

const SITUACAO: Record<SituacaoTrilha, { label: string; cls: string; peso: number }> = {
  bloqueado:     { label: 'Bloqueado',        cls: 'bg-aviso-warnBg text-aviso-warnFg',   peso: 0 },
  acabando:      { label: 'Menos de 24h',     cls: 'bg-urg-medBg text-urg-medFg',         peso: 1 },
  falta_reuniao: { label: 'Falta 1ª reunião', cls: 'bg-aviso-infoBg text-aviso-infoFg',   peso: 2 },
  nao_acessou:   { label: 'Não acessou',      cls: 'bg-surface-subtle text-ink-muted',    peso: 3 },
  andamento:     { label: 'Em andamento',     cls: 'bg-accentBlue-soft text-accentBlue',  peso: 4 },
  finalizado:    { label: 'Finalizado',       cls: 'bg-aviso-okBg text-aviso-okFg',       peso: 5 },
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

function mediana(v: number[]): number | null {
  if (!v.length) return null
  const o = [...v].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/** Dias inteiros desde uma data ISO (YYYY-MM-DD) até `agora`; negativo = futuro. */
function diasDesde(iso: string, agora: number): number {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const hoje = new Date(agora)
  return Math.round((Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) - Date.UTC(a, m - 1, d)) / 86_400_000)
}

export function ChipSituacao({ situacao }: { situacao: SituacaoTrilha }) {
  const cfg = SITUACAO[situacao]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

/** A coluna "Prazo": o que importa sobre o relógio em cada situação. */
function TextoPrazo({ l, agora }: { l: LinhaTrilha; agora: number }) {
  if (l.situacao === 'nao_acessou') {
    // Mexeu na trilha antes de 07/10/2026, quando ainda não havia relógio.
    if (l.tempo_segundos > 0 || l.etapas_concluidas > 0) {
      return <span className="text-ink-muted">abriu antes do prazo existir · o relógio começa no próximo acesso</span>
    }
    if (!l.data_inicio) return <span className="text-ink-subtle">não abriu o link</span>
    const dias = diasDesde(l.data_inicio, agora)
    return (
      <span className="text-ink-muted">
        não abriu · {dias < 0 ? `entra em ${dataBR(l.data_inicio)}` : dias === 0 ? 'entrou hoje' : `entrou há ${dias} ${dias === 1 ? 'dia' : 'dias'}`}
      </span>
    )
  }
  if (l.concluida_em && l.primeiro_acesso_em) {
    const levou = new Date(l.concluida_em).getTime() - new Date(l.primeiro_acesso_em).getTime()
    return <span className="text-ink-secondary" title={`Concluiu ${dataHoraBR(l.concluida_em)}`}>concluiu em {fmtRestanteCurto(levou)}</span>
  }
  if (!l.prazo_em) return <span className="text-ink-subtle">—</span>
  const restante = new Date(l.prazo_em).getTime() - agora
  if (restante <= 0) {
    return (
      <span className={l.situacao === 'bloqueado' ? 'font-medium text-aviso-warnFg' : 'text-ink-muted'} title={`Prazo: ${dataHoraBR(l.prazo_em)}`}>
        esgotou {fmtHaQuanto(-restante)}{l.so_falta_revisao && ' · em revisão'}
      </span>
    )
  }
  return (
    <span
      className={cn('tabular-nums', restante <= ULTIMAS_HORAS_MS ? 'font-medium text-urg-medFg' : 'text-ink-secondary')}
      title={`Prazo: ${dataHoraBR(l.prazo_em)}`}
    >
      faltam {fmtRestanteCurto(restante)}
    </span>
  )
}

/** A coluna "1ª reunião". */
function TextoReuniao({ l }: { l: LinhaTrilha }) {
  if (l.primeira_reuniao_em) {
    return <span className="text-aviso-okFg">feita em {dataBR(l.primeira_reuniao_em)}</span>
  }
  if (l.reuniao_marcada_em) {
    return <span className="text-ink-secondary">marcada · {dataHoraBR(l.reuniao_marcada_em)}</span>
  }
  if (l.concluida_em) return <span className="font-medium text-aviso-infoFg">não agendou</span>
  return <span className="text-ink-subtle">—</span>
}

function BarraEtapas({ l }: { l: LinhaTrilha }) {
  const total = l.etapas_obrigatorias
  const pct = total ? Math.round((l.etapas_concluidas / total) * 100) : 0
  return (
    <div className="min-w-[150px] space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="truncate text-ink-secondary" title={l.etapa_atual_titulo ?? undefined}>
          {l.concluida_em
            ? 'Todas concluídas'
            : l.etapa_atual_numero
              ? `Etapa ${l.etapa_atual_numero} · ${l.etapa_atual_titulo}`
              : '—'}
        </span>
        <span className="flex-shrink-0 tabular-nums text-ink-muted">{l.etapas_concluidas}/{total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-subtle">
        <div
          className={cn('h-full rounded-full', l.concluida_em ? 'bg-urg-lowFg' : 'bg-ink')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function WelcomePathTab() {
  const { data: base = [], isLoading: carregando } = useAcompanhamentoTrilha()
  const { data: etapas = [] } = useEtapasAdmin()
  const { data: progresso = [] } = useProgressoTodos()
  const agora = useAgora(30_000)

  const [filtro, setFiltro] = useState<Filtro>('abertos')
  const [grupo, setGrupo] = useState<string>('todos')
  const [busca, setBusca] = useState('')
  const [comTeste, setComTeste] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)

  const ativas = useMemo(() => etapas.filter(e => e.ativa), [etapas])

  const linhas = useMemo<LinhaTrilha[]>(() => {
    const porProfessor = new Map<string, Map<string, ProgressoAdmin>>()
    for (const p of progresso) {
      if (!porProfessor.has(p.professor_id)) porProfessor.set(p.professor_id, new Map())
      porProfessor.get(p.professor_id)!.set(p.etapa_id, p)
    }
    return base.map(l => ({
      ...l,
      situacao: situacaoTrilha(l, agora),
      porEtapa: porProfessor.get(l.professor_id) ?? new Map(),
    }))
  }, [base, progresso, agora])

  // Contas de teste ficam de fora por padrão — mesma regra do Painel da trilha.
  const nTeste = linhas.filter(l => norm(l.nome).includes('teste')).length
  const grupos = useMemo(
    () => [...new Set(linhas.map(l => l.grupo).filter((g): g is string => !!g))].sort(),
    [linhas],
  )

  /** Recorte de coordenação e contas de teste: base dos números e dos filtros. */
  const escopo = useMemo(
    () => linhas
      .filter(l => comTeste || !norm(l.nome).includes('teste'))
      .filter(l => grupo === 'todos' || l.grupo === grupo),
    [linhas, comTeste, grupo],
  )

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = {
      abertos: 0, todos: escopo.length,
      bloqueado: 0, acabando: 0, falta_reuniao: 0, nao_acessou: 0, andamento: 0, finalizado: 0,
    }
    for (const l of escopo) {
      c[l.situacao]++
      if (l.situacao !== 'finalizado') c.abertos++
    }
    return c
  }, [escopo])

  const numeros = useMemo(() => {
    const abriram = escopo.filter(l => l.primeiro_acesso_em)
    const concluiram = abriram.filter(l => l.concluida_em)
    const tempos = concluiram.map(l => new Date(l.concluida_em!).getTime() - new Date(l.primeiro_acesso_em!).getTime())
    return {
      abriram: abriram.length,
      fazendo: contagem.andamento + contagem.acabando,
      acabando: contagem.acabando,
      bloqueados: contagem.bloqueado,
      concluiram: concluiram.length,
      semReuniao: contagem.falta_reuniao,
      naoAcessaram: contagem.nao_acessou,
      medianaMs: mediana(tempos),
    }
  }, [escopo, contagem])

  const visiveis = useMemo(() => {
    const q = norm(busca)
    return escopo
      .filter(l => filtro === 'todos' || (filtro === 'abertos' ? l.situacao !== 'finalizado' : l.situacao === filtro))
      .filter(l => q.length === 0 || norm(l.nome).includes(q))
      .sort((a, b) => {
        const pa = SITUACAO[a.situacao].peso, pb = SITUACAO[b.situacao].peso
        if (pa !== pb) return pa - pb
        // Dentro da situação: quem tem menos prazo (ou entrou antes) primeiro.
        const ka = a.prazo_em ?? a.data_inicio ?? ''
        const kb = b.prazo_em ?? b.data_inicio ?? ''
        return ka.localeCompare(kb)
      })
  }, [escopo, filtro, busca])

  const chips: { id: Filtro; label: string }[] = [
    { id: 'abertos',       label: 'Em aberto' },
    { id: 'bloqueado',     label: 'Bloqueados' },
    { id: 'acabando',      label: 'Menos de 24h' },
    { id: 'andamento',     label: 'Em andamento' },
    { id: 'nao_acessou',   label: 'Não acessaram' },
    { id: 'falta_reuniao', label: 'Falta 1ª reunião' },
    { id: 'finalizado',    label: 'Finalizados' },
    { id: 'todos',         label: 'Todos' },
  ]

  async function exportar() {
    const XLSX = await import('xlsx')
    const dados = visiveis.map(l => ({
      Professor: l.nome,
      Coordenação: [l.grupo, l.coordenador].filter(Boolean).join(' · '),
      Situação: SITUACAO[l.situacao].label,
      'Entrou na King': l.data_inicio ? dataBR(l.data_inicio) : '',
      '1º acesso': l.primeiro_acesso_em ? dataHoraBR(l.primeiro_acesso_em) : '',
      Prazo: l.prazo_em ? dataHoraBR(l.prazo_em) : '',
      Desbloqueios: l.desbloqueios,
      Etapas: `${l.etapas_concluidas}/${l.etapas_obrigatorias}`,
      'Etapa atual': l.concluida_em ? 'Concluiu' : l.etapa_atual_numero ? `${l.etapa_atual_numero} · ${l.etapa_atual_titulo}` : '',
      'Concluiu em': l.concluida_em ? dataHoraBR(l.concluida_em) : '',
      '1ª reunião': l.primeira_reuniao_em ? `feita ${dataBR(l.primeira_reuniao_em)}` : l.reuniao_marcada_em ? `marcada ${dataHoraBR(l.reuniao_marcada_em)}` : '',
      'Tempo de estudo': fmtDuracao(l.tempo_segundos),
      Telefone: l.telefone ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(dados)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Welcome Path')
    XLSX.writeFile(wb, `welcome-path-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const linhaAberta = aberto ? linhas.find(l => l.professor_id === aberto) ?? null : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-ink-muted">
          Cada professor novo tem 5 dias, contados do primeiro acesso, para concluir a trilha. Quando o prazo
          acaba, a trilha trava e ele pede o desbloqueio pelo WhatsApp. Quem entrou na King desde 07/10/2026
          aparece aqui sozinho.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <LinkTrilha />
          <Button size="sm" variant="outline" className="btn-press h-9 gap-1.5 border-line" onClick={exportar}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
        </div>
      </div>

      {/* Números — cada um diz o que conta. Base: o recorte de coordenação escolhido. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line-soft bg-line-soft md:grid-cols-5">
        <Numero
          icone={Timer}
          rotulo="Fazendo a trilha"
          valor={numeros.fazendo}
          regra="abriram e o prazo ainda corre"
          detalhe={numeros.acabando ? `${numeros.acabando} com menos de 24h` : undefined}
          tom={numeros.acabando ? 'atencao' : undefined}
        />
        <Numero
          icone={Lock}
          rotulo="Bloqueados"
          valor={numeros.bloqueados}
          regra="o prazo acabou sem concluir"
          detalhe={numeros.abriram ? `de ${numeros.abriram} que abriram a trilha` : undefined}
          tom={numeros.bloqueados ? 'alerta' : undefined}
        />
        <Numero
          icone={CheckCircle2}
          rotulo="Concluíram"
          valor={numeros.abriram ? `${numeros.concluiram} de ${numeros.abriram}` : '0'}
          regra="aprovados em todas as etapas, dos que abriram"
          detalhe={numeros.semReuniao ? `${numeros.semReuniao} ainda sem a 1ª reunião` : undefined}
        />
        <Numero
          icone={Hourglass}
          rotulo="Tempo até concluir"
          valor={numeros.medianaMs != null ? fmtRestanteCurto(numeros.medianaMs) : '—'}
          regra={numeros.concluiram
            ? `mediana do 1º acesso à última etapa, ${numeros.concluiram} ${numeros.concluiram === 1 ? 'professor' : 'professores'}`
            : 'ninguém concluiu ainda'}
        />
        <Numero
          icone={UserX}
          rotulo="Não acessaram"
          valor={numeros.naoAcessaram}
          regra="entraram na King e o relógio não começou"
          // Em 2 colunas, o 5º número ocupa a linha inteira em vez de deixar buraco.
          className="col-span-2 md:col-span-1"
        />
      </div>

      <div className="space-y-3">
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
                    : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink',
                )}
              >
                {c.label}
                <span className={cn(
                  'inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] tabular-nums',
                  filtro === c.id ? 'bg-accentBlue-soft text-accentBlue' : 'bg-surface-subtle text-ink-muted',
                )}>
                  {contagem[c.id]}
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

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1 rounded-full border border-line-soft p-0.5" role="group" aria-label="Coordenação">
            {['todos', ...grupos].map(g => (
              <button
                key={g}
                onClick={() => setGrupo(g)}
                className={cn(
                  'btn-press rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors',
                  grupo === g ? 'bg-ink text-ink-inverse' : 'text-ink-secondary hover:text-ink',
                )}
              >
                {g === 'todos' ? 'Todas as coordenações' : g}
              </button>
            ))}
          </div>
          {nTeste > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-secondary">
              <input
                type="checkbox"
                checked={comTeste}
                onChange={e => setComTeste(e.target.checked)}
                className="h-3.5 w-3.5 accent-current"
              />
              Incluir contas de teste ({nTeste})
            </label>
          )}
        </div>
      </div>

      {carregando ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">Carregando…</div>
      ) : ativas.length === 0 && etapas.length > 0 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          Nenhuma etapa ativa na trilha. Publique o conteúdo na aba "Conteúdo".
        </div>
      ) : visiveis.length === 0 ? (
        <div className="card-surface p-10 text-center text-[13px] text-ink-muted">
          {escopo.length === 0
            ? 'Nenhum professor novo por enquanto. Quem entrar na King aparece aqui sozinho.'
            : busca ? `Nenhum professor encontrado para "${busca}".` : 'Ninguém nesta situação agora.'}
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <div className="relative max-h-[calc(100vh-360px)] min-h-[260px] w-full overflow-auto overscroll-contain">
            <table className="w-full caption-bottom">
              <thead className="sticky top-0 z-10 bg-surface-canvas shadow-[0_1px_0_0_var(--border-soft)]">
                <tr>
                  <Th>Professor</Th>
                  <Th>Prazo</Th>
                  <Th>Progresso</Th>
                  <Th>Última atividade</Th>
                  <Th>1ª reunião</Th>
                  <th className="h-10 px-3" />
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => (
                  <tr
                    key={l.professor_id}
                    className={cn(
                      'cursor-pointer border-b border-line-soft transition-colors hover:bg-surface-subtle',
                      l.situacao === 'bloqueado' && 'shadow-[inset_2px_0_0_0_var(--aviso-warn-fg)]',
                      l.situacao === 'acabando' && 'shadow-[inset_2px_0_0_0_var(--urg-med-fg)]',
                    )}
                    onClick={() => setAberto(l.professor_id)}
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <p className="whitespace-nowrap text-[13px] font-medium text-ink">{l.nome}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <ChipSituacao situacao={l.situacao} />
                        {(l.grupo || l.coordenador) && (
                          <span className="whitespace-nowrap text-[11px] text-ink-muted">
                            {[l.grupo, l.coordenador?.split(' ')[0]].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {l.desbloqueios > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-muted" title="Desbloqueios de prazo">
                            <Unlock className="h-3 w-3" /> {l.desbloqueios}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-middle text-[12px]">
                      <TextoPrazo l={l} agora={agora} />
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      {l.primeiro_acesso_em ? <BarraEtapas l={l} /> : <span className="text-[12px] text-ink-subtle">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-middle text-[12px] text-ink-secondary">
                      {l.ultima_atividade_em
                        ? <span title={dataHoraBR(l.ultima_atividade_em)}>{fmtHaQuanto(agora - new Date(l.ultima_atividade_em).getTime())}</span>
                        : <span className="text-ink-subtle">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-middle text-[12px]">
                      <TextoReuniao l={l} />
                    </td>
                    <td className="px-3 py-2.5 text-right align-middle">
                      <div className="flex items-center justify-end gap-1">
                        {l.situacao === 'bloqueado' && (
                          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-aviso-warnBg px-2.5 text-[11.5px] font-medium text-aviso-warnFg">
                            <Unlock className="h-3 w-3" /> Desbloquear
                          </span>
                        )}
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11.5px] text-ink-muted">
        Clique no professor para ver as etapas e as respostas, liberar ou zerar uma etapa e desbloquear o prazo.
      </p>

      {linhaAberta && (
        <ProfessorTrilhaDialog
          linha={linhaAberta}
          etapas={ativas}
          agora={agora}
          onFechar={() => setAberto(null)}
        />
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="h-10 whitespace-nowrap px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
      {children}
    </th>
  )
}

function Numero({
  icone: Icone, rotulo, valor, regra, detalhe, tom, className,
}: {
  icone: typeof Timer
  rotulo: string
  valor: number | string
  /** A regra de contagem — número sem definição não serve (ktm-kpi-sempre-com-definicao). */
  regra: string
  detalhe?: string
  tom?: 'alerta' | 'atencao'
  className?: string
}) {
  return (
    <div className={cn('space-y-1 bg-surface-canvas px-5 py-4', className)}>
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-muted">
        <Icone className="h-3.5 w-3.5" /> {rotulo}
      </p>
      <p className={cn(
        'text-[1.6rem] font-semibold leading-none tracking-tight tabular-nums',
        tom === 'alerta' ? 'text-aviso-warnFg' : 'text-ink',
      )}>
        {valor}
      </p>
      <p className="text-[11.5px] leading-snug text-ink-muted">{regra}</p>
      {detalhe && (
        <p className={cn('text-[11.5px] font-medium', tom === 'atencao' ? 'text-urg-medFg' : 'text-ink-secondary')}>{detalhe}</p>
      )}
    </div>
  )
}
