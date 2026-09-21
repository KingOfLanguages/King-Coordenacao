import { Link } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ClipboardList, Hourglass, Inbox, Lock,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCanView } from '@/hooks/usePagePermissions'
import { useAgora } from '@/hooks/useAgora'
import { useIncidentes, natureza as naturezaDe } from '@/hooks/useIncidentes'
import { usePendenciasFila } from '@/hooks/usePendencias'
import { usePausasFila } from '@/hooks/usePausas'
import { useTransferenciasFila, prazoAtendimento } from '@/hooks/useTransferencias'
import { useParaFazer } from '@/hooks/useParaFazer'
import { useReunioesPeriodo, useReunioesPendentes, isReuniaoGrupo } from '@/hooks/useReunioesDia'
import { compararPorPrioridade, estaAtrasado, estadoPrazo, normalizarPrioridade } from '@/lib/incidentePrioridade'
import { ESTAGIO } from '@/lib/centralPendencias'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Hoje — a tela de entrada. Junta, num lugar só, o que pede ação no dia:
// incidentes urgentes/atrasados, as reuniões, a régua de pendências do King, os
// pedidos de pausa e transferência e o resumo da Minha Área (tarefas e
// Mensagens do dia). Antes,
// ver isso tudo exigia abrir quatro ou cinco telas toda manhã.
//
// Não é um painel de números: cada card mostra os poucos itens que precisam de
// alguém agora e leva direto ao lugar de agir. Cada card só aparece (e só
// consulta o banco) para quem enxerga a tela de origem.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ITENS = 4

interface Item {
  chave: string
  texto: string
  detalhe?: string
  alerta?: boolean
  to?: string
}

function Cartao({
  titulo, icone: Icone, numero, legenda, alerta, itens, vazio, link, rotuloLink, carregando, extra,
}: {
  titulo: string
  icone: LucideIcon
  numero: number
  legenda: string
  alerta?: boolean
  itens: Item[]
  vazio: string
  link: string
  rotuloLink: string
  carregando?: boolean
  extra?: React.ReactNode
}) {
  return (
    <section className="card-surface flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="label-micro flex items-center gap-1.5"><Icone className="h-3.5 w-3.5" />{titulo}</h2>
        <Link to={link} className="btn-press inline-flex items-center gap-1 text-[11.5px] font-medium text-accentBlue hover:underline">
          {rotuloLink} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {carregando ? (
        <div className="space-y-2">
          <div className="h-7 w-16 animate-pulse rounded bg-surface-subtle" />
          <div className="h-4 w-full animate-pulse rounded bg-surface-subtle" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-surface-subtle" />
        </div>
      ) : numero === 0 ? (
        <div className="flex flex-1 items-center gap-2 py-3 text-[13px] text-ink-muted">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-urg-lowFg" />{vazio}
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className={cn('text-3xl font-semibold tabular-nums leading-none', alerta ? 'text-urg-critFg' : 'text-ink')}>{numero}</span>
            <span className="text-[12.5px] text-ink-secondary">{legenda}</span>
          </div>
          <ul className="divide-y divide-line-soft">
            {itens.slice(0, MAX_ITENS).map(it => {
              const corpo = (
                <>
                  <span className={cn('min-w-0 truncate text-[12.5px]', it.alerta ? 'font-medium text-ink' : 'text-ink-secondary')}>{it.texto}</span>
                  {it.detalhe && (
                    <span className={cn('flex-shrink-0 text-[11px] tabular-nums', it.alerta ? 'font-medium text-urg-critFg' : 'text-ink-muted')}>
                      {it.detalhe}
                    </span>
                  )}
                </>
              )
              return (
                <li key={it.chave}>
                  {it.to ? (
                    <Link to={it.to} className="flex items-center justify-between gap-3 py-1.5 hover:text-accentBlue">{corpo}</Link>
                  ) : (
                    <div className="flex items-center justify-between gap-3 py-1.5">{corpo}</div>
                  )}
                </li>
              )
            })}
          </ul>
          {itens.length > MAX_ITENS && (
            <p className="text-[11px] text-ink-muted">e mais {itens.length - MAX_ITENS}</p>
          )}
        </>
      )}
      {extra}
    </section>
  )
}

// ── Incidentes ──────────────────────────────────────────────────────────────

export function CardIncidentes({ meuId }: { meuId: string | null }) {
  const { data: incidentes = [], isLoading } = useIncidentes()
  const agora = useAgora()
  const fila = incidentes.filter(i => naturezaDe(i) === 'desafio' && !i.resolved)
  const pedemAcao = fila
    .filter(i => estaAtrasado(i, agora) || normalizarPrioridade(i.urgency) === 'Urgente')
    .sort((a, b) => compararPorPrioridade(a, b, agora))
  const meus = pedemAcao.filter(i => i.responsavel_id === meuId || i.assumido_por === meuId).length
  const informesNovos = incidentes.filter(i => naturezaDe(i) === 'informe' && !i.ciente_em).length

  return (
    <Cartao
      titulo="Incidentes" icone={AlertTriangle} carregando={isLoading}
      numero={pedemAcao.length}
      legenda={`urgentes ou atrasados${meus ? ` · ${meus} com você` : ''}`}
      alerta
      vazio="Nenhum chamado urgente ou atrasado."
      link="/incidentes" rotuloLink="Abrir a fila"
      itens={pedemAcao.map(i => ({
        chave: i.id,
        texto: `${normalizarPrioridade(i.urgency) === 'Urgente' ? 'Urgente · ' : ''}${i.teacher_name} — ${i.problem_type}`,
        detalhe: estadoPrazo(i, agora)?.rotulo,
        alerta: estaAtrasado(i, agora),
        to: `/incidentes?incidente=${i.id}`,
      }))}
      extra={informesNovos > 0 ? (
        <Link to="/incidentes?status=informes" className="text-[11.5px] text-ink-secondary hover:text-accentBlue">
          <Inbox className="mr-1 inline h-3.5 w-3.5 -mt-0.5" />{informesNovos} informe{informesNovos > 1 ? 's' : ''} novo{informesNovos > 1 ? 's' : ''} para ler
        </Link>
      ) : undefined}
    />
  )
}

// ── Reuniões de hoje ────────────────────────────────────────────────────────

function inicioDoDia(): Date { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
function fimDoDia(): Date { const d = new Date(); d.setHours(23, 59, 59, 999); return d }

export function CardReunioes({ meuId }: { meuId: string }) {
  const agora = useAgora()
  const { data: hoje = [], isLoading } = useReunioesPeriodo(meuId, inicioDoDia(), fimDoDia())
  const { data: pendentes = [] } = useReunioesPendentes(meuId)
  const proximas = [...hoje]
    .sort((a, b) => a.data.localeCompare(b.data))
  const aindaVao = proximas.filter(r => new Date(r.data).getTime() >= agora).length
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const nomeDa = (r: (typeof hoje)[number]) => isReuniaoGrupo(r)
    ? `Grupo · ${r.participantes.length} professores`
    : r.participantes[0]?.professor?.nome ?? r.titulo ?? 'Reunião'

  return (
    <Cartao
      titulo="Reuniões de hoje" icone={CalendarDays} carregando={isLoading}
      numero={proximas.length + pendentes.length}
      legenda={`${proximas.length} hoje (${aindaVao} ainda ${aindaVao === 1 ? 'vai' : 'vão'} acontecer)${pendentes.length ? ` · ${pendentes.length} para lançar` : ''}`}
      alerta={pendentes.length > 0}
      vazio="Nenhuma reunião hoje e nada para lançar."
      link="/reunioes" rotuloLink="Abrir a agenda"
      itens={[
        ...pendentes.slice(0, 2).map(r => ({
          chave: `p-${r.id}`, texto: `Lançar: ${nomeDa(r)}`,
          detalhe: new Date(r.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), alerta: true,
        })),
        ...proximas.map(r => ({ chave: r.id, texto: nomeDa(r), detalhe: hora(r.data) })),
      ]}
    />
  )
}

// ── Pendências do King ──────────────────────────────────────────────────────

export function CardPendencias() {
  const { data: fila = [], isLoading, isError } = usePendenciasFila()
  const abertas = fila.filter(p => !p.regularizado)
  const semMensagem = abertas.filter(p => !(p.ultimaMensagemEm != null && p.ultimaMensagemEstagio === p.estagio))
  const bloqueadas = abertas.filter(p => p.agendaBloqueada).length
  const ordenadas = [...semMensagem].sort((a, b) => b.estagio - a.estagio || b.dias - a.dias)

  if (isError) {
    return (
      <Cartao
        titulo="Pendências do King" icone={Hourglass} numero={0} legenda="" itens={[]}
        vazio="A régua do King não respondeu agora." link="/acompanhamento?aba=pendencias" rotuloLink="Abrir"
      />
    )
  }
  return (
    <Cartao
      titulo="Pendências do King" icone={Hourglass} carregando={isLoading}
      numero={semMensagem.length}
      legenda={`sem a mensagem do estágio${bloqueadas ? ` · ${bloqueadas} com agenda bloqueada` : ''}`}
      alerta={ordenadas.some(p => p.estagio === 3)}
      vazio="Todo mundo na régua já recebeu a mensagem do estágio."
      link="/acompanhamento?aba=pendencias" rotuloLink="Abrir pendências"
      itens={ordenadas.map(p => ({
        chave: String(p.id_Professor),
        texto: p.nome,
        detalhe: `${p.estagio}. ${ESTAGIO[p.estagio].titulo} · ${p.dias}d`,
        alerta: p.estagio === 3,
        to: p.professor_uuid ? `/professores/${p.professor_uuid}` : undefined,
      }))}
      extra={bloqueadas > 0 ? (
        <p className="text-[11.5px] text-ink-muted"><Lock className="mr-1 inline h-3 w-3 -mt-0.5" />Agendas bloqueadas são liberadas na aba Pendências.</p>
      ) : undefined}
    />
  )
}

// ── Solicitações ────────────────────────────────────────────────────────────

export function CardSolicitacoes({ vePausas, veTransf }: { vePausas: boolean; veTransf: boolean }) {
  const { data: pausas = [], isLoading: l1 } = usePausasFila()
  const { data: transf = [], isLoading: l2 } = useTransferenciasFila()
  const pausasVis = vePausas ? pausas : []
  const transfVis = veTransf ? transf : []
  const transfItens = transfVis
    .map(t => ({ t, prazo: prazoAtendimento(t) }))
    .sort((a, b) => (a.prazo.faixa === 'atrasada' ? 0 : a.prazo.faixa === 'vence_hoje' ? 1 : 2)
      - (b.prazo.faixa === 'atrasada' ? 0 : b.prazo.faixa === 'vence_hoje' ? 1 : 2))
  const atrasadas = transfItens.filter(x => x.prazo.faixa === 'atrasada').length
  const pausasNovas = pausasVis.filter(p => p.status === 'pendente')

  return (
    <Cartao
      titulo="Solicitações" icone={Inbox} carregando={l1 || l2}
      numero={pausasVis.length + transfVis.length}
      legenda={[
        vePausas && `${pausasVis.length} pausa${pausasVis.length === 1 ? '' : 's'}`,
        veTransf && `${transfVis.length} transferência${transfVis.length === 1 ? '' : 's'}${atrasadas ? ` (${atrasadas} atrasada${atrasadas > 1 ? 's' : ''})` : ''}`,
      ].filter(Boolean).join(' · ')}
      alerta={atrasadas > 0}
      vazio="Nenhum pedido esperando."
      link="/solicitacoes" rotuloLink="Abrir solicitações"
      itens={[
        ...transfItens.map(({ t, prazo }) => ({
          chave: `t-${t.id}`,
          texto: `Transferência · ${t.aluno_nome}`,
          detalhe: prazo.faixa === 'atrasada' ? 'atrasada' : prazo.faixa === 'vence_hoje' ? 'vence hoje' : undefined,
          alerta: prazo.faixa !== 'no_prazo',
          to: `/solicitacoes?aba=transferencias&pedido=${t.id}`,
        })),
        ...pausasNovas.map(p => ({
          chave: `p-${p.id}`,
          texto: `Pausa · ${p.professor?.nome ?? '—'}`,
          detalhe: 'nova',
          to: '/solicitacoes?aba=pausas',
        })),
      ]}
    />
  )
}

// ── Minha Área ──────────────────────────────────────────────────────────────
// Um cartão só para o que é da pessoa (tarefas, fim de pausa, desafio
// assumido, perguntas de projeto, Mensagens do dia) — mesmo hook da lista
// Para fazer, então o número bate com o da Minha Área.

export function CardMinhaArea({ veTarefas, veProjetos, veMensagens }: { veTarefas: boolean; veProjetos: boolean; veMensagens: boolean }) {
  const d = useParaFazer({ tarefas: veTarefas, projetos: veProjetos, mensagens: veMensagens })
  const { pendentes, total } = d.mensagens
  return (
    <Cartao
      titulo="Minha Área" icone={ClipboardList} carregando={d.isLoading}
      numero={d.total}
      alerta={d.atrasados > 0}
      legenda={d.atrasados > 0 ? `para fazer · ${d.atrasados} atrasado${d.atrasados === 1 ? '' : 's'}` : 'para fazer'}
      vazio="Nada pendente com você."
      link="/minha-area" rotuloLink="Abrir"
      itens={[
        ...(pendentes > 0 ? [{
          chave: 'mensagens', texto: 'Mensagens do dia', detalhe: `${total - pendentes} de ${total} enviadas`, to: '/minha-area',
        }] : []),
        ...d.itens.map(i => ({
          chave: i.chave, texto: i.titulo, detalhe: i.prazoRotulo ?? undefined, alerta: i.grupo === 'atrasado', to: '/minha-area',
        })),
      ]}
    />
  )
}

// ── Página ──────────────────────────────────────────────────────────────────

function saudacao(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export function HojePage() {
  const { profile } = useAuth()
  const { canView } = useCanView()
  const meuId = profile?.id ?? null
  // Mensagens do dia e agenda são pessoais: só quem tem a própria lista/agenda.
  const temAgendaPropria = profile?.role === 'coordenacao' || profile?.role === 'admin'
  const primeiroNome = (profile?.nome ?? '').split(' ')[0]
  // Maiúscula só na primeira letra: o `capitalize` do CSS faria "21 De Setembro".
  const dataBruta = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const dataHoje = dataBruta.charAt(0).toUpperCase() + dataBruta.slice(1)

  const vePausas = canView('retorno-pausa')
  const veTransf = canView('transferencias')

  return (
    <div className="px-6 py-6 max-w-[1320px] mx-auto space-y-6">
      <header className="space-y-1">
        <p className="text-[12px] font-medium text-ink-muted">{dataHoje}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{saudacao()}{primeiroNome ? `, ${primeiroNome}` : ''}</h1>
        <p className="text-[13px] text-ink-muted">O que pede ação hoje. Cada item leva direto ao lugar de resolver.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {canView('incidentes') && <CardIncidentes meuId={meuId} />}
        {temAgendaPropria && meuId && canView('reunioes-dia') && <CardReunioes meuId={meuId} />}
        {canView('pendencias') && <CardPendencias />}
        {(vePausas || veTransf) && <CardSolicitacoes vePausas={vePausas} veTransf={veTransf} />}
        {(canView('convocacoes') || canView('projetos')) && (
          <CardMinhaArea
            veTarefas={canView('convocacoes')}
            veProjetos={canView('projetos')}
            veMensagens={temAgendaPropria && canView('convocacoes')}
          />
        )}
      </div>
    </div>
  )
}
