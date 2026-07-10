import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { MES_ANALISE_PROBLEM_TYPE } from '@/hooks/useMesAnalise'

// ─────────────────────────────────────────────────────────────────────────────
// Correlação de reclamações por aluno. Não existe entidade "aluno" estruturada
// (aluno_nome em nexus_incidents é texto livre), então agregamos no cliente por
// um nome normalizado (minúsculas, sem acento, espaços colapsados) pra juntar as
// variações de grafia do mesmo aluno. Volume baixo — só incidentes COM aluno.
//
// LGPD: nomes de alunos são dado pessoal. A tela é de uso interno, restrita a
// quem já enxerga incidentes; nada é exposto além do que já está no incidente.
// ─────────────────────────────────────────────────────────────────────────────

export interface IncidenteAluno {
  id: string
  aluno_nome: string
  teacher_name: string
  professor_id: string | null
  problem_type: string
  urgency: string
  description: string
  resolved: boolean
  created_at: string
}

export interface TipoProblemaQtd { tipo: string; qtd: number }

export interface AlunoAgregado {
  chave: string                    // nome normalizado — só agrupador, não exibido
  nome: string                     // grafia mais frequente, pra exibição
  total: number
  abertos: number
  resolvidos: number
  professores: string[]            // teacher_name distintos ligados ao aluno
  tiposProblema: TipoProblemaQtd[] // tipos de problema com contagem (desc)
  ultimaOcorrencia: string         // ISO da ocorrência mais recente
  incidentes: IncidenteAluno[]     // ocorrências (mais recentes primeiro)
}

/** Normaliza o nome pra agrupar variações: minúsculas, sem acento, espaços colapsados. */
export function normalizarNome(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // remove diacríticos (combining marks U+0300–U+036F)
    .replace(/\s+/g, ' ')
}

function agrupar(incidentes: IncidenteAluno[]): AlunoAgregado[] {
  // grafias: conta cada forma original do nome pra escolher a mais comum como exibição
  const mapa = new Map<string, AlunoAgregado & { grafias: Map<string, number> }>()

  for (const inc of incidentes) {
    const nome = inc.aluno_nome?.trim()
    if (!nome) continue
    const chave = normalizarNome(nome)
    if (!chave) continue

    let a = mapa.get(chave)
    if (!a) {
      a = {
        chave, nome, total: 0, abertos: 0, resolvidos: 0,
        professores: [], tiposProblema: [], ultimaOcorrencia: inc.created_at,
        incidentes: [], grafias: new Map(),
      }
      mapa.set(chave, a)
    }

    a.total++
    if (inc.resolved) a.resolvidos++
    else a.abertos++
    a.incidentes.push(inc)
    a.grafias.set(nome, (a.grafias.get(nome) ?? 0) + 1)
    if (inc.created_at > a.ultimaOcorrencia) a.ultimaOcorrencia = inc.created_at
  }

  const resultado: AlunoAgregado[] = []
  for (const a of mapa.values()) {
    const nomeExibicao = [...a.grafias.entries()].sort((x, y) => y[1] - x[1])[0][0]

    const professores = [...new Set(a.incidentes.map(i => i.teacher_name).filter(Boolean))]

    const tipos = new Map<string, number>()
    for (const i of a.incidentes) tipos.set(i.problem_type, (tipos.get(i.problem_type) ?? 0) + 1)
    const tiposProblema = [...tipos.entries()]
      .map(([tipo, qtd]) => ({ tipo, qtd }))
      .sort((x, y) => y.qtd - x.qtd)

    resultado.push({
      chave: a.chave,
      nome: nomeExibicao,
      total: a.total,
      abertos: a.abertos,
      resolvidos: a.resolvidos,
      professores,
      tiposProblema,
      ultimaOcorrencia: a.ultimaOcorrencia,
      incidentes: a.incidentes,   // já vêm mais recentes primeiro do fetch
    })
  }

  // Mais reclamados primeiro; desempata pela ocorrência mais recente.
  return resultado.sort((x, y) => y.total - x.total || y.ultimaOcorrencia.localeCompare(x.ultimaOcorrencia))
}

/** Alunos agregados a partir dos incidentes que referem um aluno (exclui Mês de Análise). */
export function useAcompanhamentoAlunos() {
  return useQuery({
    queryKey: ['acompanhamento-alunos'],
    queryFn: async (): Promise<AlunoAgregado[]> => {
      const { data, error } = await supabase
        .from('nexus_incidents')
        .select('id, aluno_nome, teacher_name, professor_id, problem_type, urgency, description, resolved, created_at')
        .not('aluno_nome', 'is', null)
        .neq('problem_type', MES_ANALISE_PROBLEM_TYPE)
        .order('created_at', { ascending: false })
      if (error) throw error
      return agrupar((data ?? []) as IncidenteAluno[])
    },
  })
}
