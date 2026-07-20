import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  calcularPrioridade, nivelPrioridade, INFORME_JANELA, REINCIDENCIA_MIN,
  type NivelPrioridade,
} from '@/lib/prioridade'
import type { SilencioStatus } from '@/hooks/useSilencio'

// ─────────────────────────────────────────────────────────────────────────────
// Painel unificado de Acompanhamento — junta, por professor ATIVO:
//   • score + pendências + elegibilidade   → professor_acompanhamento
//   • estágio da régua de pendência         → acompanhamento_silencio
//   • último contato registrado             → silencio_mensagem_log
//   • informes recentes (sinal)             → nexus_incidents (natureza='informe')
// e calcula o Índice de Prioridade (src/lib/prioridade.ts).
//
// Substitui as duas telas antigas (Acompanhamento + Controle de Pendências),
// que consultavam essas mesmas fontes separadamente. Todas as consultas são
// SELECT já liberado a autenticados via RLS.
// ─────────────────────────────────────────────────────────────────────────────

export interface PainelProfessor {
  professor_id: string
  nome: string
  grupo_id: string | null
  grupo_nome: string | null
  coordenador_nome: string | null

  score_atual: number | null
  score_faixa: string | null
  elegivel_alocacao: boolean | null   // false ⇒ bloqueado p/ receber novos alunos
  reuniao_status: string | null

  aulas_pendentes_qtd: number
  dias_pendente: number               // 0 quando não há pendência

  // Episódio de pendência (régua), quando houver.
  silencio_status: SilencioStatus | null
  precisa_mes_analise: boolean
  contatado: boolean                  // mensagem do estágio atual já marcada
  qtd_alunos: number | null

  // Último acompanhamento = última mensagem de pendência registrada.
  ultimo_acompanhamento_em: string | null
  ultimo_acompanhamento_estagio: SilencioStatus | null

  // Informes como sinal (últimos INFORME_JANELA dias).
  informes_recentes: number
  informe_reincidente: boolean   // REINCIDENCIA_MIN+ informes da MESMA categoria

  // Índice de Prioridade.
  prioridade: number
  nivel: NivelPrioridade
}

interface SilencioLinha {
  professor_id: string
  status: SilencioStatus
  precisa_mes_analise: boolean | null
  qtd_alunos: number | null
  aulas_pendentes: number
  msg_resolucao: boolean
  msg_saida_alunos: boolean
  reuniao_solicitada: boolean
}

/** A mensagem do estágio atual já foi marcada como enviada? */
function contatadoDe(s: SilencioLinha): boolean {
  switch (s.status) {
    case 'alerta':      return s.msg_resolucao
    case 'aviso_saida': return s.msg_saida_alunos
    case 'reuniao':     return s.reuniao_solicitada
    default:            return false
  }
}

/** Dias corridos desde a aula pendente mais antiga (compat. com CURRENT_DATE − data). */
function diasDesde(dataISO: string | null | undefined): number {
  if (!dataISO) return 0
  const d = new Date(dataISO + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return 0
  const ms = Date.now() - d.getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
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

export function usePainelProfessores() {
  return useQuery({
    queryKey: ['painel-professores'],
    queryFn: async (): Promise<PainelProfessor[]> => {
      const desdeInformes = new Date(Date.now() - INFORME_JANELA * 86_400_000).toISOString()
      const [profRes, silRes, logRes, infRes] = await Promise.all([
        supabase
          .from('professores')
          .select(`
            id, nome,
            grupo:grupos!grupo_id (id, nome),
            coordenador:profiles!coordenador_id (nome),
            professor_acompanhamento (
              score_atual, score_faixa, elegivel_alocacao, reuniao_status,
              aulas_pendentes_qtd, aulas_pendentes_data_mais_antiga
            )
          `)
          .eq('status', 'ativo')
          .order('nome'),
        supabase
          .from('acompanhamento_silencio')
          .select(`
            professor_id, status, precisa_mes_analise, qtd_alunos, aulas_pendentes,
            msg_resolucao, msg_saida_alunos, reuniao_solicitada
          `),
        supabase
          .from('silencio_mensagem_log')
          .select('professor_id, estagio, enviado_em')
          .order('enviado_em', { ascending: false }),
        supabase
          .from('nexus_incidents')
          .select('professor_id, problem_type')
          .eq('natureza', 'informe')
          .not('professor_id', 'is', null)
          .gte('created_at', desdeInformes),
      ])
      if (profRes.error) throw profRes.error
      if (silRes.error) throw silRes.error
      if (logRes.error) throw logRes.error
      if (infRes.error) throw infRes.error

      const silencioPor = new Map<string, SilencioLinha>()
      for (const s of (silRes.data ?? []) as SilencioLinha[]) silencioPor.set(s.professor_id, s)

      // log já vem desc por enviado_em ⇒ o primeiro visto por professor é o mais recente.
      const ultimoLog = new Map<string, { estagio: SilencioStatus; enviado_em: string }>()
      for (const row of logRes.data ?? []) {
        if (!ultimoLog.has(row.professor_id)) {
          ultimoLog.set(row.professor_id, { estagio: row.estagio as SilencioStatus, enviado_em: row.enviado_em })
        }
      }

      const informesPor = new Map<string, InformeAgg>()
      for (const row of (infRes.data ?? []) as { professor_id: string; problem_type: string }[]) {
        let agg = informesPor.get(row.professor_id)
        if (!agg) { agg = { total: 0, porCategoria: new Map() }; informesPor.set(row.professor_id, agg) }
        agg.total++
        agg.porCategoria.set(row.problem_type, (agg.porCategoria.get(row.problem_type) ?? 0) + 1)
      }

      return (profRes.data ?? []).map((p): PainelProfessor => {
        const acomp = Array.isArray(p.professor_acompanhamento)
          ? p.professor_acompanhamento[0]
          : p.professor_acompanhamento
        const grupo = Array.isArray(p.grupo) ? p.grupo[0] : p.grupo
        const coord = Array.isArray(p.coordenador) ? p.coordenador[0] : p.coordenador

        const sil = silencioPor.get(p.id)
        const log = ultimoLog.get(p.id)

        const qtd  = acomp?.aulas_pendentes_qtd ?? 0
        const dias = diasDesde(acomp?.aulas_pendentes_data_mais_antiga as string | null | undefined)
        const score = acomp?.score_atual ?? null

        const inf = informesPor.get(p.id)
        const informesRecentes = inf?.total ?? 0
        const informeReincidente = inf ? ehReincidente(inf) : false

        const prioridade = calcularPrioridade(score, qtd, dias, informesRecentes, informeReincidente)

        return {
          professor_id: p.id,
          nome: p.nome,
          grupo_id: grupo?.id ?? null,
          grupo_nome: grupo?.nome ?? null,
          coordenador_nome: coord?.nome ?? null,
          score_atual: score,
          score_faixa: acomp?.score_faixa ?? null,
          elegivel_alocacao: acomp?.elegivel_alocacao ?? null,
          reuniao_status: acomp?.reuniao_status ?? null,
          aulas_pendentes_qtd: qtd,
          dias_pendente: dias,
          silencio_status: sil?.status ?? null,
          precisa_mes_analise: sil?.precisa_mes_analise ?? false,
          contatado: sil ? contatadoDe(sil) : false,
          qtd_alunos: sil?.qtd_alunos ?? null,
          ultimo_acompanhamento_em: log?.enviado_em ?? null,
          ultimo_acompanhamento_estagio: log?.estagio ?? null,
          informes_recentes: informesRecentes,
          informe_reincidente: informeReincidente,
          prioridade,
          nivel: nivelPrioridade(prioridade),
        }
      })
    },
  })
}
