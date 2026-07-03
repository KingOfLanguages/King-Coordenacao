import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ProfessorAcompanhamento {
  professor_id: string
  score_atual: number | null
  score_faixa: string | null
  elegivel_alocacao: boolean | null
  avaliacao_alunos: {
    estrelas_5?: number
    estrelas_4?: number
    estrelas_3?: number
    estrelas_2?: number
    estrelas_1?: number
    comentarios_positivos?: number
    comentarios_negativos?: number
    total_avaliacoes?: number
    media_estrelas?: number
  } | null
  reuniao_status: string | null
  reuniao_ultima: string | null
  reuniao_proxima: string | null
  aulas_pendentes_qtd: number
  aulas_pendentes_data_mais_antiga: string | null
  faltas_professor: { quantidade: number; datas: string[] } | null
  no_show_primeira_aula: { quantidade: number; datas: string[] } | null
  agendas_bloqueadas: { quantidade_horarios: number; motivos: { motivo: string; quantidade: number }[] } | null
  trocas_professor: { aluno_id: number; tipo: string; data: string; motivo: string; status: string }[] | null
  turnover_entrou_no_periodo: boolean | null
  turnover_saida: {
    data: string | null
    motivo: string | null
    quantidade_alunos_realocados: number | null
    saiu_no_periodo: boolean | null
  } | null
  api_atualizado_em: string | null
}

export interface ProfessorScoreHistoricoRow {
  ano_mes: number
  score: number
}

export interface ProfessorAlunoKms {
  aluno_id: number
  primeiro_nome: string | null
  data_adicao: string | null
  status_vinculo: string | null
}

export function useProfessorAcompanhamento(professorId?: string) {
  return useQuery({
    queryKey: ['professor-acompanhamento', professorId],
    queryFn: async () => {
      const [{ data: acompanhamento, error: e1 }, { data: historico, error: e2 }, { data: alunos, error: e3 }] =
        await Promise.all([
          supabase.from('professor_acompanhamento').select('*').eq('professor_id', professorId!).maybeSingle(),
          supabase.from('professor_score_historico').select('ano_mes, score').eq('professor_id', professorId!).order('ano_mes'),
          supabase.from('professor_alunos_kms').select('aluno_id, primeiro_nome, data_adicao, status_vinculo').eq('professor_id', professorId!),
        ])
      if (e1) throw e1
      if (e2) throw e2
      if (e3) throw e3

      return {
        acompanhamento: acompanhamento as ProfessorAcompanhamento | null,
        historico: (historico ?? []) as ProfessorScoreHistoricoRow[],
        alunos: (alunos ?? []) as ProfessorAlunoKms[],
      }
    },
    enabled: !!professorId,
  })
}

// ─── Visão geral (lista, tela de Acompanhamento) ───────────────────────────────

export interface ProfessorRisco {
  professor_id: string
  nome: string
  status: string
  grupo_nome: string | null
  coordenador_nome: string | null
  score_atual: number | null
  score_faixa: string | null
  reuniao_status: string | null
  alertas_total: number
}

export function useProfessoresAcompanhamento() {
  return useQuery({
    queryKey: ['professores-acompanhamento'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professores')
        .select(`
          id, nome, status,
          grupo:grupos!grupo_id (nome),
          coordenador:profiles!coordenador_id (nome),
          professor_acompanhamento (
            score_atual, score_faixa, reuniao_status,
            aulas_pendentes_qtd, faltas_professor, no_show_primeira_aula, agendas_bloqueadas, trocas_professor
          )
        `)
        .eq('status', 'ativo')
        .order('nome')
      if (error) throw error

      return (data ?? []).map((p): ProfessorRisco => {
        const acomp = Array.isArray(p.professor_acompanhamento)
          ? p.professor_acompanhamento[0]
          : p.professor_acompanhamento
        const grupo = Array.isArray(p.grupo) ? p.grupo[0] : p.grupo
        const coordenador = Array.isArray(p.coordenador) ? p.coordenador[0] : p.coordenador

        const alertas = [
          acomp?.aulas_pendentes_qtd ?? 0,
          (acomp?.faltas_professor as { quantidade?: number } | null)?.quantidade ?? 0,
          (acomp?.no_show_primeira_aula as { quantidade?: number } | null)?.quantidade ?? 0,
          (acomp?.agendas_bloqueadas as { quantidade_horarios?: number } | null)?.quantidade_horarios ?? 0,
          Array.isArray(acomp?.trocas_professor) ? acomp.trocas_professor.length : 0,
        ].reduce((a, b) => a + b, 0)

        return {
          professor_id: p.id,
          nome: p.nome,
          status: p.status,
          grupo_nome: grupo?.nome ?? null,
          coordenador_nome: coordenador?.nome ?? null,
          score_atual: acomp?.score_atual ?? null,
          score_faixa: acomp?.score_faixa ?? null,
          reuniao_status: acomp?.reuniao_status ?? null,
          alertas_total: alertas,
        }
      })
    },
  })
}
