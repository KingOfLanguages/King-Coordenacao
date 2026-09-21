import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useAgora } from '@/hooks/useAgora'
import { useTarefas, type Tarefa, type TarefaTime } from '@/hooks/useTarefas'
import { useIncidentes, type Incidente } from '@/hooks/useIncidentes'
import { useMeusProjetos, useProjetos, useSouLideranca, type PedidoInfo, type Projeto } from '@/hooks/useProjetos'
import { useContatosHoje } from '@/hooks/useContatosDia'
import { estadoPrazo } from '@/lib/incidentePrioridade'

// ─────────────────────────────────────────────────────────────────────────────
// Para fazer — a lista única da Minha Área (2026-09). Junta o que estava em três
// telas: tarefas (as escritas à mão, as de fim de pausa e as de incidente
// assumido), perguntas da liderança sobre os meus projetos e, para quem é
// líder, os projetos esperando decisão. As Mensagens do dia ficam num bloco
// próprio acima da lista; aqui só entra a contagem delas.
//
// Tudo é agrupado pelo prazo (Atrasado / Hoje / Próximos dias / Sem prazo), que
// vem de onde já existe: o "para quando" da tarefa, a data de retorno da pausa,
// o relógio do incidente. O card da tela Hoje usa o mesmo hook, então os
// números batem.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoItem = 'tarefa' | 'pausa' | 'incidente' | 'pergunta' | 'aprovacao'
export type GrupoPrazo = 'atrasado' | 'hoje' | 'proximos' | 'sem_prazo'
/** Minhas = comigo · Que eu pedi = criei para outra pessoa · Todas = tudo que a RLS mostra. */
export type Escopo = 'minhas' | 'pedi' | 'todas'

export const GRUPOS: { id: GrupoPrazo; label: string }[] = [
  { id: 'atrasado',  label: 'Atrasado' },
  { id: 'hoje',      label: 'Hoje' },
  { id: 'proximos',  label: 'Próximos dias' },
  { id: 'sem_prazo', label: 'Sem prazo' },
]

export interface ItemParaFazer {
  chave: string
  tipo: TipoItem
  titulo: string
  /** Linha de apoio: quem pediu, de qual projeto, data de retorno… */
  contexto: string | null
  grupo: GrupoPrazo
  /** "venceu há 2 dias" · "hoje" · "sex, 26/09" · "sem 1ª ação há 3h". */
  prazoRotulo: string | null
  /** Ordem dentro do grupo (menor primeiro). */
  ordem: number
  tarefa?: Tarefa
  incidente?: Incidente
  /** Pausa cuja tarefa de fim é este item — dá o professor para encerrar. */
  pausa?: { id: string; professor_id: string }
  pedido?: PedidoInfo
  projeto?: Projeto
}

// ── Datas (sempre no fuso local; prazo de tarefa é DATE "YYYY-MM-DD") ────────

export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diasAte(iso: string, hojeIso: string): number {
  const [a, b] = [hojeIso, iso].map(s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) })
  return Math.round((b - a) / 86_400_000)
}

function grupoDaData(prazo: string | null, hojeIso: string): GrupoPrazo {
  if (!prazo) return 'sem_prazo'
  if (prazo < hojeIso) return 'atrasado'
  if (prazo === hojeIso) return 'hoje'
  return 'proximos'
}

/** "venceu ontem" · "venceu há 3 dias" · "hoje" · "amanhã" · "sex, 26/09". */
export function rotuloPrazo(prazo: string, hojeIso: string): string {
  const n = diasAte(prazo, hojeIso)
  if (n < -1) return `venceu há ${-n} dias`
  if (n === -1) return 'venceu ontem'
  if (n === 0) return 'hoje'
  if (n === 1) return 'amanhã'
  const [y, m, d] = prazo.split('-').map(Number)
  const semana = new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return `${semana}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

function dataCurta(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}`
}

function timeDoUsuario(role?: string): TarefaTime | null {
  if (role === 'coordenacao') return 'coordenacao'
  if (role === 'suporte' || role === 'suporte_aluno') return 'suporte'
  return null
}

/** Pausas cuja tarefa de fim está entre as abertas — o item vira "Encerrar pausa". */
function usePausasDasTarefas(ids: string[]) {
  return useQuery({
    queryKey: ['pausas', 'por-tarefa', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pausas')
        .select('id, professor_id, tarefa_fim_id')
        .in('tarefa_fim_id', ids)
      if (error) throw error
      return (data ?? []) as { id: string; professor_id: string; tarefa_fim_id: string }[]
    },
  })
}

interface Opcoes {
  /** Tarefas e mensagens do dia (chave de permissão 'convocacoes'). */
  tarefas: boolean
  /** Perguntas e aprovações de projeto (chave 'projetos'). */
  projetos: boolean
  /** Mensagens do dia — só quem tem a própria lista (coordenação/admin). */
  mensagens: boolean
  escopo?: Escopo
}

export function useParaFazer({ tarefas: veTarefas, projetos: veProjetos, mensagens: veMensagens, escopo = 'minhas' }: Opcoes) {
  const { profile } = useAuth()
  const meuId = profile?.id ?? null
  const meuTime = timeDoUsuario(profile?.role)
  const souLideranca = useSouLideranca()
  const agora = useAgora()

  const tarefasQ = useTarefas(veTarefas)
  const todasTarefas = useMemo(() => (veTarefas ? tarefasQ.data ?? [] : []), [veTarefas, tarefasQ.data])
  const abertas = useMemo(() => todasTarefas.filter(t => t.status !== 'concluido'), [todasTarefas])
  const temIncidente = abertas.some(t => t.incidente_id)

  const incidentesQ = useIncidentes(veTarefas && temIncidente)
  const pausasQ = usePausasDasTarefas(useMemo(() => abertas.map(t => t.id), [abertas]))
  const meusProjetos = useMeusProjetos(veProjetos)
  const projetosQ = useProjetos(veProjetos)
  const contatosQ = useContatosHoje(veMensagens ? meuId : null)

  const resultado = useMemo(() => {
    const hojeIso = isoLocal(new Date(agora))
    const fimDoDia = new Date(agora); fimDoDia.setHours(23, 59, 59, 999)

    const paraMim = (t: Tarefa) => t.atribuido_a === meuId || (!!t.atribuido_time && t.atribuido_time === meuTime)
    const noEscopo = (t: Tarefa) =>
      escopo === 'minhas' ? paraMim(t)
        : escopo === 'pedi' ? t.criado_por === meuId && !paraMim(t)
          : true

    const incidentePorId = new Map((incidentesQ.data ?? []).map(i => [i.id, i]))
    const pausaPorTarefa = new Map((pausasQ.data ?? []).map(p => [p.tarefa_fim_id, p]))

    const itens: ItemParaFazer[] = []

    for (const t of abertas) {
      if (!noEscopo(t)) continue
      const para = escopo === 'minhas' ? null : (t.responsavel?.nome ?? (t.atribuido_time ? 'Time' : null))
      const de = t.criador?.nome && t.criado_por !== meuId ? `de ${t.criador.nome}` : null

      const inc = t.incidente_id ? incidentePorId.get(t.incidente_id) : undefined
      if (t.incidente_id) {
        const e = inc ? estadoPrazo(inc, agora) : null
        const quando = e ? agora + e.restanteMs : null
        itens.push({
          chave: `t-${t.id}`, tipo: 'incidente', tarefa: t, incidente: inc,
          titulo: t.titulo,
          contexto: [inc?.teacher_name, inc?.problem_type, para && `com ${para}`].filter(Boolean).join(' · ') || null,
          grupo: !e ? grupoDaData(t.prazo, hojeIso) : e.vencido ? 'atrasado' : quando! <= fimDoDia.getTime() ? 'hoje' : 'proximos',
          prazoRotulo: e?.rotulo ?? (t.prazo ? rotuloPrazo(t.prazo, hojeIso) : null),
          ordem: quando ?? new Date(t.created_at).getTime(),
        })
        continue
      }

      const pausa = pausaPorTarefa.get(t.id)
      itens.push({
        chave: `t-${t.id}`, tipo: pausa ? 'pausa' : 'tarefa', tarefa: t,
        pausa: pausa ? { id: pausa.id, professor_id: pausa.professor_id } : undefined,
        titulo: t.titulo,
        contexto: [
          pausa && t.prazo ? `retorno previsto para ${dataCurta(t.prazo)}` : de,
          para && `com ${para}`,
        ].filter(Boolean).join(' · ') || null,
        grupo: grupoDaData(t.prazo, hojeIso),
        prazoRotulo: t.prazo ? rotuloPrazo(t.prazo, hojeIso) : null,
        ordem: t.prazo ? new Date(`${t.prazo}T12:00:00`).getTime() : new Date(t.created_at).getTime(),
      })
    }

    // Projetos: só na visão "Minhas" — são pedidos feitos a mim.
    if (veProjetos && escopo === 'minhas') {
      const tituloDe = new Map((projetosQ.data ?? []).map(p => [p.id, p.titulo]))
      for (const q of meusProjetos.pedidosAbertos) {
        itens.push({
          chave: `q-${q.id}`, tipo: 'pergunta', pedido: q,
          titulo: q.pergunta,
          contexto: tituloDe.get(q.projeto_id) ?? null,
          grupo: 'hoje', prazoRotulo: `desde ${dataCurta(q.created_at)}`,
          ordem: new Date(q.created_at).getTime(),
        })
      }
      if (souLideranca) {
        for (const p of projetosQ.data ?? []) {
          if (p.status !== 'proposto') continue
          itens.push({
            chave: `p-${p.id}`, tipo: 'aprovacao', projeto: p,
            titulo: p.titulo,
            contexto: 'aguardando a decisão da liderança',
            grupo: 'sem_prazo', prazoRotulo: `desde ${dataCurta(p.created_at)}`,
            ordem: new Date(p.created_at).getTime(),
          })
        }
      }
    }

    // Atrasado → Hoje → Próximos → Sem prazo; dentro do grupo, pela ordem.
    const posGrupo = new Map(GRUPOS.map((g, i) => [g.id, i]))
    itens.sort((a, b) => (posGrupo.get(a.grupo)! - posGrupo.get(b.grupo)!) || a.ordem - b.ordem)

    const concluidasHoje = todasTarefas.filter(t =>
      t.status === 'concluido' && t.concluido_em && isoLocal(new Date(t.concluido_em)) === hojeIso && noEscopo(t),
    )

    const contatos = contatosQ.data ?? []
    return {
      itens,
      concluidasHoje,
      atrasados: itens.filter(i => i.grupo === 'atrasado').length,
      mensagens: { total: contatos.length, pendentes: contatos.filter(c => !c.enviado).length },
    }
  }, [agora, abertas, todasTarefas, escopo, meuId, meuTime, incidentesQ.data, pausasQ.data,
      veProjetos, souLideranca, meusProjetos.pedidosAbertos, projetosQ.data, contatosQ.data])

  return {
    ...resultado,
    /** Itens abertos + mensagens ainda por enviar. */
    total: resultado.itens.length + resultado.mensagens.pendentes,
    isLoading: (veTarefas && tarefasQ.isLoading) || (veProjetos && meusProjetos.isLoading) || (veMensagens && contatosQ.isLoading),
    souLideranca,
  }
}
