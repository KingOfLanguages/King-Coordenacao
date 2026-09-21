import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  calcularPrioridade, nivelPrioridade, INFORME_JANELA, REINCIDENCIA_MIN,
  type NivelPrioridade,
} from '@/lib/prioridade'
import { usePendenciasFila, type EstagioNum, type PendenciaFila } from '@/hooks/usePendencias'

// ─────────────────────────────────────────────────────────────────────────────
// Painel do Índice de atenção — junta, por professor ATIVO:
//   • score + elegibilidade                 → professor_acompanhamento
//   • pendências de lançamento e o estágio  → fila do King (/api/PendenciaLancamento),
//                                             a MESMA da aba Pendências do King
//   • última reunião realizada              → professores.data_ultima_reuniao
//   • informes recentes (sinal)             → nexus_incidents (natureza='informe')
// e calcula o Índice (src/lib/prioridade.ts).
//
// Uma régua só (2026-09): até aqui o Índice usava a régua local 6/9/12 dias
// (acompanhamento_silencio) e a aba Pendências a do King (2/3/5 dias) — o mesmo
// professor aparecia em estágios diferentes nas duas abas. A local foi aposentada.
//
// A parte local e a fila do King são duas consultas separadas de propósito: se a
// API do King cair, o Índice continua de pé com a última contagem do sync
// (professor_acompanhamento) e avisa que a régua está indisponível.
// ─────────────────────────────────────────────────────────────────────────────

export interface PainelProfessor {
  professor_id: string
  /** ID do professor no King — é por ele que a fila de pendências casa. */
  kms_id: number | null
  nome: string
  email: string | null
  grupo_id: string | null
  grupo_nome: string | null
  coordenador_nome: string | null

  score_atual: number | null
  score_faixa: string | null
  elegivel_alocacao: boolean | null   // false ⇒ bloqueado p/ receber novos alunos
  reuniao_status: string | null

  // Último acompanhamento = última reunião com a coordenação marcada como
  // REALIZADA (professores.data_ultima_reuniao, com fallback para
  // professor_acompanhamento.reuniao_ultima da API King) e o intervalo em dias.
  data_ultima_reuniao: string | null
  dias_sem_reuniao: number | null     // null ⇒ nunca teve reunião registrada

  aulas_pendentes_qtd: number
  dias_pendente: number               // dias sem lançar; 0 quando não há pendência

  // Régua de pendência do King, quando o professor está na fila.
  estagio: EstagioNum | null          // 1 Lembrete · 2 Bloqueio · 3 Reunião
  agenda_bloqueada: boolean           // bloqueio aplicado pelo motor do King
  regularizado: boolean               // lançou o que devia; sai da fila no próximo ciclo
  contatado: boolean                  // mensagem do estágio atual já registrada
  qtd_alunos: number | null

  // Informes como sinal (últimos INFORME_JANELA dias).
  informes_recentes: number
  informe_reincidente: boolean   // REINCIDENCIA_MIN+ informes da MESMA categoria

  // Pausa cujo contato de encerramento venceu. Só os pausados NESSA situação
  // entram no painel — ver a query.
  pausa_vencida_dias: number | null
  pausa_data_fim: string | null

  // Índice de Prioridade.
  prioridade: number
  nivel: NivelPrioridade
}

/** Dias corridos desde a aula pendente mais antiga (compat. com CURRENT_DATE − data). */
function diasDesde(dataISO: string | null | undefined): number {
  if (!dataISO) return 0
  const d = new Date(dataISO + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return 0
  const ms = Date.now() - d.getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/** Dias corridos desde uma data/timestamp ISO qualquer. null quando ausente ou
 *  inválida — usado para "tempo sem reunião", que aceita tanto date quanto
 *  timestamptz (data_ultima_reuniao é timestamptz; reuniao_ultima é date). */
function diasDesdeISO(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

/** Informes de um professor na janela, agrupados por categoria. */
interface InformeAgg {
  total: number
  porCategoria: Map<string, number>
}

/** Reincidência = alguma categoria repetida REINCIDENCIA_MIN+ vezes na janela. */
function ehReincidente(agg: InformeAgg): boolean {
  for (const n of agg.porCategoria.values()) if (n >= REINCIDENCIA_MIN) return true
  return false
}

/** Linha local, antes de juntar a régua do King. */
type PainelBase = Omit<PainelProfessor,
  'estagio' | 'agenda_bloqueada' | 'regularizado' | 'contatado' | 'qtd_alunos' | 'prioridade' | 'nivel'>

/** Mescla a régua do King na linha local e calcula o Índice. `fila` null = API
 *  indisponível: pendências ficam com a contagem do sync (professor_acompanhamento). */
function mesclar(base: PainelBase, porKms: Map<number, PendenciaFila> | null): PainelProfessor {
  const pend = porKms && base.kms_id != null ? porKms.get(base.kms_id) ?? null : null
  const qtd  = porKms ? (pend?.aulasPendentes ?? 0) : base.aulas_pendentes_qtd
  const dias = porKms ? (pend?.dias ?? 0) : base.dias_pendente
  const prioridade = calcularPrioridade(
    base.score_atual, qtd, dias, base.informes_recentes, base.informe_reincidente, base.pausa_vencida_dias,
  )
  return {
    ...base,
    aulas_pendentes_qtd: qtd,
    dias_pendente: dias,
    estagio: pend?.estagio ?? null,
    agenda_bloqueada: pend?.agendaBloqueada ?? false,
    regularizado: pend?.regularizado ?? false,
    contatado: !!pend && pend.ultimaMensagemEm != null && pend.ultimaMensagemEstagio === pend.estagio,
    qtd_alunos: pend?.qtdAlunos ?? null,
    prioridade,
    nivel: nivelPrioridade(prioridade),
  }
}

/**
 * Linhas do Índice de atenção. Devolve o formato de um useQuery (`data`,
 * `isLoading`) mais `reguaIndisponivel`, para a tela avisar quando a fila do
 * King não respondeu.
 */
export function usePainelProfessores() {
  const base = usePainelBase()
  const fila = usePendenciasFila()
  const reguaIndisponivel = fila.isError

  const data = useMemo(() => {
    if (!base.data) return undefined
    if (!fila.data && !reguaIndisponivel) return undefined
    const porKms = fila.data ? new Map(fila.data.map(p => [p.id_Professor, p])) : null
    return base.data.map(b => mesclar(b, porKms))
  }, [base.data, fila.data, reguaIndisponivel])

  return {
    data,
    isLoading: base.isLoading || (fila.isLoading && !reguaIndisponivel),
    reguaIndisponivel,
  }
}

function usePainelBase() {
  return useQuery({
    queryKey: ['painel-professores'],
    queryFn: async (): Promise<PainelBase[]> => {
      const desdeInformes = new Date(Date.now() - INFORME_JANELA * 86_400_000).toISOString()
      const [profRes, infRes] = await Promise.all([
        supabase
          .from('professores')
          .select(`
            id, kms_id, nome, email, data_ultima_reuniao,
            grupo:grupos!grupo_id (id, nome),
            coordenador:profiles!coordenador_id (nome),
            status,
            professor_acompanhamento (
              score_atual, score_faixa, elegivel_alocacao, reuniao_status, reuniao_ultima,
              aulas_pendentes_qtd, aulas_pendentes_data_mais_antiga
            ),
            pausas (data_fim, ativada_em, encerrada_em)
          `)
          // Pausados entram junto, mas só ficam os que estão com o contato de
          // encerramento vencido (filtro logo abaixo) — para o resto, score e
          // pendências não querem dizer nada enquanto o professor está parado.
          .in('status', ['ativo', 'pausa'])
          .order('nome'),
        supabase
          .from('nexus_incidents')
          .select('professor_id, problem_type')
          .eq('natureza', 'informe')
          .not('professor_id', 'is', null)
          .gte('created_at', desdeInformes),
      ])
      if (profRes.error) throw profRes.error
      if (infRes.error) throw infRes.error

      const informesPor = new Map<string, InformeAgg>()
      for (const row of (infRes.data ?? []) as { professor_id: string; problem_type: string }[]) {
        let agg = informesPor.get(row.professor_id)
        if (!agg) { agg = { total: 0, porCategoria: new Map() }; informesPor.set(row.professor_id, agg) }
        agg.total++
        agg.porCategoria.set(row.problem_type, (agg.porCategoria.get(row.problem_type) ?? 0) + 1)
      }

      type PausaEmbutida = { data_fim: string; ativada_em: string | null; encerrada_em: string | null }

      /** Dias desde a data de fim da pausa vigente. null = sem pausa vigente ou
       *  contato ainda no prazo. */
      function pausaVencidaDe(pausas: PausaEmbutida[] | null | undefined): { dias: number; dataFim: string } | null {
        const vigente = (pausas ?? []).find(x => x.ativada_em && !x.encerrada_em)
        if (!vigente) return null
        const dias = diasDesde(vigente.data_fim)
        // diasDesde satura em 0 para datas futuras — só conta se já venceu.
        const venceu = new Date(vigente.data_fim + 'T00:00:00').getTime() <= Date.now()
        return venceu ? { dias, dataFim: vigente.data_fim } : null
      }

      return (profRes.data ?? []).flatMap((p): PainelBase[] => {
        const pausaVencida = pausaVencidaDe(p.pausas as PausaEmbutida[] | null)

        // Pausado só entra no painel quando o contato de encerramento venceu.
        if (p.status === 'pausa' && !pausaVencida) return []

        const acomp = Array.isArray(p.professor_acompanhamento)
          ? p.professor_acompanhamento[0]
          : p.professor_acompanhamento
        const grupo = Array.isArray(p.grupo) ? p.grupo[0] : p.grupo
        const coord = Array.isArray(p.coordenador) ? p.coordenador[0] : p.coordenador

        const qtd  = acomp?.aulas_pendentes_qtd ?? 0
        const dias = diasDesde(acomp?.aulas_pendentes_data_mais_antiga as string | null | undefined)
        const score = acomp?.score_atual ?? null

        // "Último acompanhamento" / "tempo sem reunião": prioriza a data que a
        // plataforma grava ao marcar a reunião como REALIZADA (individual, em
        // grupo ou pela extensão → professores.data_ultima_reuniao); cai pro dado
        // da API King (reuniao_ultima) quando o professor nunca foi confirmado aqui.
        const ultimaReuniao =
          (p as { data_ultima_reuniao?: string | null }).data_ultima_reuniao
          ?? (acomp as { reuniao_ultima?: string | null } | null | undefined)?.reuniao_ultima
          ?? null
        const diasSemReuniao = diasDesdeISO(ultimaReuniao)

        const inf = informesPor.get(p.id)
        const informesRecentes = inf?.total ?? 0
        const informeReincidente = inf ? ehReincidente(inf) : false

        const kms = Number((p as { kms_id?: string | null }).kms_id)

        return [{
          professor_id: p.id,
          kms_id: Number.isFinite(kms) && kms > 0 ? kms : null,
          nome: p.nome,
          email: (p as { email?: string | null }).email ?? null,
          grupo_id: grupo?.id ?? null,
          grupo_nome: grupo?.nome ?? null,
          coordenador_nome: coord?.nome ?? null,
          score_atual: score,
          score_faixa: acomp?.score_faixa ?? null,
          elegivel_alocacao: acomp?.elegivel_alocacao ?? null,
          reuniao_status: acomp?.reuniao_status ?? null,
          data_ultima_reuniao: ultimaReuniao,
          dias_sem_reuniao: diasSemReuniao,
          // Contagem do sync: só vale se a fila do King não responder (ver mesclar).
          aulas_pendentes_qtd: qtd,
          dias_pendente: dias,
          informes_recentes: informesRecentes,
          informe_reincidente: informeReincidente,
          pausa_vencida_dias: pausaVencida?.dias ?? null,
          pausa_data_fim: pausaVencida?.dataFim ?? null,
        }]
      })
    },
  })
}
