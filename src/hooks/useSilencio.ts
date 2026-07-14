import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Controle de Pendências — fila de ação (gradativa) + gráficos + log.
//
// Fonte: acompanhamento_silencio (episódio ativo), silencio_snapshot_semanal
// (série dos gráficos), silencio_incidente (histórico) e silencio_mensagem_log
// (informe de cada mensagem enviada). Tudo alimentado pelo job diário
// rodar_deteccao_silencio() — ver 20260730_deteccao_silencio.sql. A UI lê e,
// via RPC registrar_mensagem_pendencia, marca a mensagem como enviada.
//
// Cobre professores ATIVOS e EM PAUSA (desligados ficam de fora).
// Processo GRADATIVO: cada professor está em UM estágio (status) — o filtro só
// mostra quem está naquele estágio e ainda não teve a mensagem marcada.
// ─────────────────────────────────────────────────────────────────────────────

export const SILENCIO_LIMIARES = { alerta: 6, aviso_saida: 9, reuniao: 12 } as const

export type SilencioStatus = 'alerta' | 'aviso_saida' | 'reuniao'

export const statusLabel: Record<SilencioStatus, string> = {
  alerta:      'Alerta inicial',
  aviso_saida: 'Reforço',
  reuniao:     'Aplicação da medida',
}

export const statusChip: Record<SilencioStatus, string> = {
  alerta:      'bg-urg-medBg text-urg-medFg',
  aviso_saida: 'bg-urg-highBg text-urg-highFg',
  reuniao:     'bg-urg-highBg text-urg-highFg',
}

/** Flag de "mensagem enviada" correspondente a cada estágio. */
export const flagPorStatus: Record<SilencioStatus, keyof Pick<SilencioEpisodio,
  'msg_resolucao' | 'msg_saida_alunos' | 'reuniao_solicitada'>> = {
  alerta:      'msg_resolucao',
  aviso_saida: 'msg_saida_alunos',
  reuniao:     'reuniao_solicitada',
}

export interface SilencioEpisodio {
  professor_id: string
  nome: string
  professor_status: string
  grupo_id: string | null
  grupo_nome: string | null
  coordenador_nome: string | null
  status: SilencioStatus
  dias_pendente: number
  dias_pico: number
  aulas_pendentes: number
  qtd_alunos: number | null
  severidade_nx: number | null
  data_mais_antiga: string | null
  msg_resolucao: boolean
  msg_saida_alunos: boolean
  reuniao_solicitada: boolean
  aberto_em: string
}

export function useSilencioFila() {
  return useQuery({
    queryKey: ['silencio-fila'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acompanhamento_silencio')
        .select(`
          professor_id, status, dias_pendente, dias_pico, aulas_pendentes, qtd_alunos, severidade_nx,
          data_mais_antiga, msg_resolucao, msg_saida_alunos, reuniao_solicitada, aberto_em,
          professor:professores!professor_id (
            nome, status,
            grupo:grupos!grupo_id (id, nome),
            coordenador:profiles!coordenador_id (nome)
          )
        `)
        .order('dias_pendente', { ascending: false })
      if (error) throw error

      return (data ?? []).map((r): SilencioEpisodio => {
        const prof  = Array.isArray(r.professor) ? r.professor[0] : r.professor
        const grupo = prof && (Array.isArray(prof.grupo) ? prof.grupo[0] : prof.grupo)
        const coord = prof && (Array.isArray(prof.coordenador) ? prof.coordenador[0] : prof.coordenador)
        return {
          professor_id: r.professor_id,
          nome: prof?.nome ?? '—',
          professor_status: prof?.status ?? 'ativo',
          grupo_id: grupo?.id ?? null,
          grupo_nome: grupo?.nome ?? null,
          coordenador_nome: coord?.nome ?? null,
          status: r.status as SilencioStatus,
          dias_pendente: r.dias_pendente,
          dias_pico: r.dias_pico,
          aulas_pendentes: r.aulas_pendentes,
          qtd_alunos: r.qtd_alunos,
          severidade_nx: r.severidade_nx,
          data_mais_antiga: r.data_mais_antiga,
          msg_resolucao: r.msg_resolucao,
          msg_saida_alunos: r.msg_saida_alunos,
          reuniao_solicitada: r.reuniao_solicitada,
          aberto_em: r.aberto_em,
        }
      })
    },
  })
}

// Marca a mensagem do estágio como enviada E grava o informe (silencio_mensagem_log),
// de forma atômica, via RPC.
export function useRegistrarMensagemPendencia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ professorId, estagio, texto }: {
      professorId: string; estagio: SilencioStatus; texto: string
    }) => {
      const { error } = await supabase.rpc('registrar_mensagem_pendencia', {
        p_professor_id: professorId,
        p_estagio: estagio,
        p_texto: texto,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['silencio-fila'] })
      qc.invalidateQueries({ queryKey: ['silencio-professor', v.professorId] })
    },
  })
}

// ─── Gráfico geral (soma semanal de pendências de todos os professores) ────────

export interface SilencioSemanaGeral {
  semana: string
  total_pendencias: number
  professores: number
}

export function useSilencioSnapshotGeral() {
  return useQuery({
    queryKey: ['silencio-snapshot-geral'],
    queryFn: async (): Promise<SilencioSemanaGeral[]> => {
      const { data, error } = await supabase
        .from('silencio_snapshot_semanal')
        .select('semana, qtd_pendencias')
        .order('semana')
      if (error) throw error
      const m = new Map<string, { total: number; n: number }>()
      for (const row of data ?? []) {
        const e = m.get(row.semana) ?? { total: 0, n: 0 }
        e.total += row.qtd_pendencias
        e.n += 1
        m.set(row.semana, e)
      }
      return [...m.entries()].map(([semana, v]) => ({
        semana,
        total_pendencias: v.total,
        professores: v.n,
      }))
    },
  })
}

// ─── Série + incidentes + log de um professor (página dele) ───────────────────

export interface SilencioSemanaProfessor {
  semana: string
  qtd_pendencias: number
  dias_max: number | null
}
export interface SilencioIncidente {
  id: string
  aberto_em: string
  resolvido_em: string
  dias_pico: number
  aulas_pendentes_pico: number | null
  status_final: SilencioStatus
}
export interface SilencioMensagem {
  id: string
  estagio: SilencioStatus
  texto: string
  enviado_em: string
}

export function useSilencioProfessor(professorId?: string) {
  return useQuery({
    queryKey: ['silencio-professor', professorId],
    queryFn: async () => {
      const [snap, inc, log] = await Promise.all([
        supabase.from('silencio_snapshot_semanal')
          .select('semana, qtd_pendencias, dias_max')
          .eq('professor_id', professorId!).order('semana'),
        supabase.from('silencio_incidente')
          .select('id, aberto_em, resolvido_em, dias_pico, aulas_pendentes_pico, status_final')
          .eq('professor_id', professorId!).order('resolvido_em', { ascending: false }),
        supabase.from('silencio_mensagem_log')
          .select('id, estagio, texto, enviado_em')
          .eq('professor_id', professorId!).order('enviado_em', { ascending: false }),
      ])
      if (snap.error) throw snap.error
      if (inc.error) throw inc.error
      if (log.error) throw log.error
      return {
        series: (snap.data ?? []) as SilencioSemanaProfessor[],
        incidentes: (inc.data ?? []) as SilencioIncidente[],
        mensagens: (log.data ?? []) as SilencioMensagem[],
      }
    },
    enabled: !!professorId,
  })
}
