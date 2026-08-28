import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// O resto do que o KTM sabe sobre um professor e que a tela dele não mostrava:
// pausas, convocações, tarefas, onboarding, trilha, mensagem do dia, e-mails
// disparados — e a série histórica da avaliação de alunos.
//
// A extensão do Meet já montava esse dossiê (extension/src/background), mas
// quem abre /professores/:id via web só via o pedaço vindo da API do King.
//
// REGRA DE OURO desta busca: cada consulta é INDEPENDENTE e falha em silêncio.
// A RLS por cargo barra várias delas (suporte não vê tarefa de coordenação, e
// vice-versa), e um Promise.all que estoura no primeiro erro já zerou a tela
// inteira uma vez. Quem não pode ver um bloco simplesmente não o vê.
// ─────────────────────────────────────────────────────────────────────────────

/** Roda a query e devolve o fallback em qualquer erro (RLS, coluna nova, rede). */
async function tolerante<T>(p: PromiseLike<{ data: T | null; error: unknown }>, fallback: T): Promise<T> {
  try {
    const { data, error } = await p
    if (error) return fallback
    return data ?? fallback
  } catch {
    return fallback
  }
}

// ─── Avaliação de alunos: série histórica ────────────────────────────────────

export interface AvaliacaoPonto {
  dia: string
  media_estrelas: number | null
  total_avaliacoes: number | null
  comentarios_positivos: number | null
  comentarios_negativos: number | null
  fonte: string
}

/** Série de professor_avaliacao_historico (20260771). Hook próprio de propósito:
 *  a tabela é recente e um 400 dela não pode derrubar o Acompanhamento junto. */
export function useProfessorAvaliacaoHistorico(professorId?: string) {
  return useQuery({
    queryKey: ['professor-avaliacao-historico', professorId],
    queryFn: async (): Promise<AvaliacaoPonto[]> => {
      const pontos = await tolerante<AvaliacaoPonto[]>(
        supabase
          .from('professor_avaliacao_historico')
          .select('dia, media_estrelas, total_avaliacoes, comentarios_positivos, comentarios_negativos, fonte')
          .eq('professor_id', professorId!)
          .order('dia', { ascending: true })
          .limit(400),
        [],
      )
      return pontos
    },
    enabled: !!professorId,
  })
}

// ─── Situação fora do King ───────────────────────────────────────────────────

export interface PausaResumo {
  id: string
  motivo: string
  data_inicio: string
  data_fim: string
  status: string
  ativada_em: string | null
  encerrada_em: string | null
  created_at: string
}

export interface ConvocacaoResumo {
  id: string
  origem: string
  motivo: string | null
  etapa: string
  ultima_mensagem_em: string | null
  created_at: string
}

export interface TarefaResumo {
  id: string
  titulo: string
  status: string
  atribuido_time: string | null
  created_at: string
}

export interface OnboardingResumo {
  data_inicio: string | null
  /** 7 posições: 0 vazio, 1 agendado, 2 enviado. */
  dias: number[] | null
  observacao: string | null
  tag_texto: string | null
  tag_cor: string | null
}

export interface WelcomePathResumo {
  concluidas: number
  total: number
  revisaoPendente: number
  ultimaConclusao: string | null
}

export interface EmailResumo {
  assunto: string
  tipo: string
  sucesso: boolean
  created_at: string
}

export interface ProfessorSituacao {
  pausas: PausaResumo[]
  convocacoes: ConvocacaoResumo[]
  tarefas: TarefaResumo[]
  onboarding: OnboardingResumo | null
  welcomePath: WelcomePathResumo | null
  /** Está na lista de mensagens do dia de alguém, hoje? */
  contatoHoje: { enviado: boolean } | null
  emails: EmailResumo[]
}

/** `incidenteIds` vem do Nexus (useNexusDados): tarefa não tem professor_id, o
 *  vínculo com o professor é o incidente que a originou. */
export function useProfessorSituacao(professorId?: string, incidenteIds: string[] = []) {
  const chaveIncidentes = [...incidenteIds].sort().join(',')

  return useQuery({
    queryKey: ['professor-situacao', professorId, chaveIncidentes],
    queryFn: async (): Promise<ProfessorSituacao> => {
      const hojeISO = new Date().toLocaleDateString('en-CA')

      const [pausas, convocacoes, tarefas, onboarding, wpProgresso, wpTotal, contato, emails] = await Promise.all([
        tolerante<PausaResumo[]>(
          supabase
            .from('pausas')
            .select('id, motivo, data_inicio, data_fim, status, ativada_em, encerrada_em, created_at')
            .eq('professor_id', professorId!)
            .neq('status', 'recusada')
            .order('created_at', { ascending: false })
            .limit(12),
          [],
        ),
        tolerante<ConvocacaoResumo[]>(
          supabase
            .from('convocacoes')
            .select('id, origem, motivo, etapa, ultima_mensagem_em, created_at')
            .eq('professor_id', professorId!)
            .order('created_at', { ascending: false })
            .limit(12),
          [],
        ),
        chaveIncidentes
          ? tolerante<TarefaResumo[]>(
              supabase
                .from('tarefas')
                .select('id, titulo, status, atribuido_time, created_at')
                .in('incidente_id', incidenteIds)
                .order('created_at', { ascending: false })
                .limit(12),
              [],
            )
          : Promise.resolve<TarefaResumo[]>([]),
        tolerante<OnboardingResumo | null>(
          supabase
            .from('onboarding_professores')
            .select('data_inicio, dias, observacao, tag_texto, tag_cor')
            .eq('professor_id', professorId!)
            .maybeSingle(),
          null,
        ),
        tolerante<{ etapa_id: string; concluida_em: string | null; revisao_pendente: boolean }[]>(
          supabase
            .from('welcome_path_progresso')
            .select('etapa_id, concluida_em, revisao_pendente')
            .eq('professor_id', professorId!),
          [],
        ),
        // count vem fora de `data` — por isso não passa pelo tolerante().
        supabase
          .from('welcome_path_etapas')
          .select('id', { count: 'exact', head: true })
          .eq('ativa', true)
          .then(r => r.count ?? 0, () => 0),
        tolerante<{ enviado: boolean }[]>(
          supabase
            .from('contatos_diarios')
            .select('enviado')
            .eq('professor_id', professorId!)
            .eq('data', hojeISO)
            .limit(1),
          [],
        ),
        tolerante<EmailResumo[]>(
          supabase
            .from('email_disparos')
            .select('assunto, tipo, sucesso, created_at')
            .eq('professor_id', professorId!)
            .order('created_at', { ascending: false })
            .limit(6),
          [],
        ),
      ])

      const concluidas = wpProgresso.filter(p => p.concluida_em)
      const welcomePath: WelcomePathResumo | null = wpProgresso.length || wpTotal > 0
        ? {
            concluidas: concluidas.length,
            total: wpTotal || wpProgresso.length,
            revisaoPendente: wpProgresso.filter(p => p.revisao_pendente).length,
            ultimaConclusao: concluidas.map(p => p.concluida_em as string).sort().pop() ?? null,
          }
        : null

      return {
        pausas,
        convocacoes,
        tarefas,
        onboarding,
        welcomePath,
        contatoHoje: contato[0] ? { enviado: contato[0].enviado } : null,
        emails,
      }
    },
    enabled: !!professorId,
  })
}
