import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { MES_ANALISE_PROBLEM_TYPE } from '@/hooks/useMesAnalise'
import { CATEGORIAS_PLATAFORMA } from '@/hooks/useIncidentes'
import {
  diagnosticar, inicioJanela, dentroDaJanela, contarNaJanela, JANELA_DIAS,
  type Diagnostico, type IncidenteResumo,
} from '@/lib/confiabilidade'

// ─────────────────────────────────────────────────────────────────────────────
// Dados da tela de Confiabilidade (setor comercial).
//
// Só LEITURA, e só de tabelas com SELECT liberado a qualquer autenticado
// (professores, professor_acompanhamento, nexus_incidents, observacoes, grupos).
// O nome do coordenador NÃO sai de um join em `profiles` — a RLS de profiles é
// "própria linha ou admin" e o join aninhado voltaria NULL sem erro; quem resolve
// isso é a view perfis_publicos (ver useNomesPorPerfilId).
// ─────────────────────────────────────────────────────────────────────────────

const PLATAFORMA = new Set<string>(CATEGORIAS_PLATAFORMA)

export interface ProfessorBusca {
  id: string
  nome: string
  email: string | null
  status: string
  grupo_id: string | null
}

/** Lista enxuta pra caixa de busca — só o necessário pra achar o professor. */
export function useProfessoresBusca() {
  return useQuery({
    queryKey: ['professores', 'busca-confiabilidade'],
    queryFn: async (): Promise<ProfessorBusca[]> => {
      const { data, error } = await supabase
        .from('professores')
        .select('id, nome, email, status, grupo_id')
        .order('nome')
      if (error) throw error
      return (data ?? []) as ProfessorBusca[]
    },
    staleTime: 10 * 60 * 1000, // o cadastro muda por sync diário
  })
}

export interface ProfessorFicha {
  id: string
  nome: string
  email: string | null
  status: string
  data_inicio: string | null
  tempo_na_king: string | null
  cidade: string | null
  estado: string | null
  nivel_recomendado_alunos: string | null
  coordenador_id: string | null
  grupo_nome: string | null
}

export interface Avaliacao {
  media: number | null
  total: number
  comentariosNegativos: number
}

export interface ConfiabilidadeProfessor {
  professor: ProfessorFicha
  diagnostico: Diagnostico
  /** Incidentes da janela, do mais recente pro mais antigo (Plataforma incluso, marcado). */
  incidentesJanela: IncidenteResumo[]
  /** Quantos incidentes o professor tem ANTES da janela — contexto, não entra na conta. */
  incidentesAnteriores: number
  /** Retrato de hoje, vindo da API do King. */
  scoreAtual: number | null
  scoreFaixa: string | null
  avaliacao: Avaliacao
  reuniaoUltima: string | null
  reuniaoStatus: string | null
  aulasPendentes: number
  agendaBloqueada: boolean
  /** Quando o King atualizou esses números pela última vez. */
  apiAtualizadoEm: string | null
  /** true = o professor não tem linha em professor_acompanhamento (nunca sincronizou). */
  semDadosDoKing: boolean
}

type LinhaIncidente = {
  id: string
  problem_type: string
  urgency: string
  description: string | null
  aluno_nome: string | null
  natureza: string | null
  resolved: boolean
  created_at: string
}

type Acompanhamento = {
  score_atual: number | null
  score_faixa: string | null
  avaliacao_alunos: Record<string, number> | null
  reuniao_status: string | null
  reuniao_ultima: string | null
  aulas_pendentes_qtd: number | null
  faltas_professor: { quantidade?: number; datas?: string[] } | null
  no_show_primeira_aula: { quantidade?: number; datas?: string[] } | null
  trocas_professor: { data?: string }[] | null
  agenda_bloqueada: boolean | null
  api_atualizado_em: string | null
}

export function useConfiabilidadeProfessor(professorId: string | null) {
  return useQuery({
    queryKey: ['confiabilidade', professorId],
    enabled: !!professorId,
    queryFn: async (): Promise<ConfiabilidadeProfessor> => {
      const corte = inicioJanela()
      const corteIso = corte.toISOString()

      const [
        { data: prof, error: e1 },
        { data: acomp, error: e2 },
        { data: incidentes, error: e3 },
        { data: observacoes, error: e4 },
      ] = await Promise.all([
        supabase
          .from('professores')
          .select('id, nome, email, status, data_inicio, tempo_na_king, cidade, estado, nivel_recomendado_alunos, coordenador_id, grupo:grupos!grupo_id (nome)')
          .eq('id', professorId!)
          .maybeSingle(),
        supabase
          .from('professor_acompanhamento')
          .select('score_atual, score_faixa, avaliacao_alunos, reuniao_status, reuniao_ultima, aulas_pendentes_qtd, faltas_professor, no_show_primeira_aula, trocas_professor, agenda_bloqueada, api_atualizado_em')
          .eq('professor_id', professorId!)
          .maybeSingle(),
        supabase
          .from('nexus_incidents')
          .select('id, problem_type, urgency, description, aluno_nome, natureza, resolved, created_at')
          .eq('professor_id', professorId!)
          .neq('problem_type', MES_ANALISE_PROBLEM_TYPE)
          .order('created_at', { ascending: false }),
        supabase
          .from('observacoes')
          .select('id, tipo, created_at')
          .eq('professor_id', professorId!)
          .eq('tipo', 'feedback_negativo')
          .gte('created_at', corteIso),
      ])
      if (e1) throw e1
      if (e2) throw e2
      if (e3) throw e3
      if (e4) throw e4
      if (!prof) throw new Error('Professor não encontrado.')

      const grupo = Array.isArray(prof.grupo) ? prof.grupo[0] : prof.grupo
      const professor: ProfessorFicha = {
        id: prof.id,
        nome: prof.nome,
        email: prof.email,
        status: prof.status,
        data_inicio: prof.data_inicio,
        tempo_na_king: prof.tempo_na_king,
        cidade: prof.cidade,
        estado: prof.estado,
        nivel_recomendado_alunos: prof.nivel_recomendado_alunos,
        coordenador_id: prof.coordenador_id,
        grupo_nome: (grupo as { nome: string } | null)?.nome ?? null,
      }

      const todos = ((incidentes ?? []) as LinhaIncidente[]).map((i): IncidenteResumo => ({
        id: i.id,
        problem_type: i.problem_type,
        urgency: i.urgency,
        description: i.description ?? '',
        aluno_nome: i.aluno_nome,
        // natureza nula = linha antiga: o app inteiro trata como desafio.
        natureza: i.natureza === 'informe' ? 'informe' : 'desafio',
        resolved: i.resolved,
        created_at: i.created_at,
        plataforma: PLATAFORMA.has(i.problem_type),
      }))

      const incidentesJanela = todos.filter(i => i.created_at >= corteIso)
      const a = (acomp ?? null) as Acompanhamento | null
      const av = (a?.avaliacao_alunos ?? null) as Record<string, number> | null

      const diagnostico = diagnosticar({
        incidentes: incidentesJanela,
        feedbacksNegativos: (observacoes ?? []).length,
        faltas: contarNaJanela(a?.faltas_professor, corte),
        noShowPrimeiraAula: contarNaJanela(a?.no_show_primeira_aula, corte),
        trocas: (a?.trocas_professor ?? []).filter(t => dentroDaJanela(t?.data, corte)).length,
        aulasPendentes: a?.aulas_pendentes_qtd ?? 0,
        agendaBloqueada: a?.agenda_bloqueada === true,
        scoreFaixa: a?.score_faixa ?? null,
      })

      return {
        professor,
        diagnostico,
        incidentesJanela,
        incidentesAnteriores: todos.length - incidentesJanela.length,
        scoreAtual: a?.score_atual ?? null,
        scoreFaixa: a?.score_faixa ?? null,
        avaliacao: {
          media: typeof av?.media_estrelas === 'number' ? av.media_estrelas : null,
          total: typeof av?.total_avaliacoes === 'number' ? av.total_avaliacoes : 0,
          comentariosNegativos: typeof av?.comentarios_negativos === 'number' ? av.comentarios_negativos : 0,
        },
        reuniaoUltima: a?.reuniao_ultima ?? null,
        reuniaoStatus: a?.reuniao_status ?? null,
        aulasPendentes: a?.aulas_pendentes_qtd ?? 0,
        agendaBloqueada: a?.agenda_bloqueada === true,
        apiAtualizadoEm: a?.api_atualizado_em ?? null,
        semDadosDoKing: !a,
      }
    },
  })
}

export { JANELA_DIAS }
