import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Perfil do professor do onboarding do King (tabela professor_perfil, 20260801).
// Formação, como dá aula, preferências e vídeo — sem dados pessoais. Vem de
// import do export do King (scripts/importar-perfil-professores.py).
//
// Query separada da lista de professores de propósito: se esta falhar, a lista
// continua de pé e só os filtros de preferência somem.
// ─────────────────────────────────────────────────────────────────────────────

export interface PerfilProfessor {
  professor_id: string
  nome_preferido: string | null
  formacao: string | null
  curso: string | null
  curso_conclusao_ano: number | null
  curso_turno: string | null
  tem_certificado: boolean | null
  certificado: string | null
  experiencia_exterior: boolean | null
  exterior_local: string | null
  leciona_desde: number | null
  estilo_estrutura: number | null
  estilo_correcao: number | null
  estilo_ritmo: number | null
  quando_aluno_trava: string | null
  portugues_em_aula: string | null
  variante_ingles: string | null
  alunos_neurodivergentes: string | null
  idiomas: string[] | null
  publico: string[] | null
  niveis: string[] | null
  objetivos: string[] | null
  areas: string[] | null
  alunos_que_destrava: string[] | null
  /** true marcou Crianças · false respondeu o público sem marcar · null não respondeu */
  atende_criancas: boolean | null
  video_status: string | null
  video_enviado_em: string | null
  video_revisado_em: string | null
  video_motivo_reprovacao: string | null
  onboarding_atualizado_em: string | null
  fonte: string
  importado_em: string
}

const PAGINA = 1000 // teto de linhas por resposta do PostgREST

/** Todos os perfis, por professor_id. */
export function usePerfisProfessores() {
  return useQuery({
    queryKey: ['professor_perfil'],
    queryFn: async () => {
      const mapa = new Map<string, PerfilProfessor>()
      for (let de = 0; ; de += PAGINA) {
        const { data, error } = await supabase
          .from('professor_perfil')
          .select('*')
          .order('professor_id')
          .range(de, de + PAGINA - 1)
        if (error) throw error
        for (const p of (data ?? []) as PerfilProfessor[]) mapa.set(p.professor_id, p)
        if (!data || data.length < PAGINA) break
      }
      return mapa
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}

export function usePerfilProfessor(professorId: string | undefined) {
  return useQuery({
    queryKey: ['professor_perfil', professorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professor_perfil')
        .select('*')
        .eq('professor_id', professorId!)
        .maybeSingle()
      if (error) throw error
      return data as PerfilProfessor | null
    },
    enabled: !!professorId,
    retry: false,
  })
}

// ─── Filtros por preferência ─────────────────────────────────────────────────

export type FiltroCriancas = 'todos' | 'sim' | 'nao' | 'sem'

export type GrupoPreferencia =
  | 'publico' | 'niveis' | 'idioma' | 'alunos_que_destrava' | 'objetivos' | 'areas'
  | 'variante_ingles' | 'portugues_em_aula' | 'alunos_neurodivergentes' | 'quando_aluno_trava'

interface GrupoDef {
  id: GrupoPreferencia
  label: string
  /** lista = o professor marca várias (precisa ter TODAS as escolhidas);
   *  unico = uma resposta só (basta bater com UMA das escolhidas). */
  tipo: 'lista' | 'unico'
  valores: (p: PerfilProfessor) => string[]
}

/** "Inglês - Avançado" → "Inglês"; "russo" → "Russo". */
export function idiomaSemNivel(s: string): string {
  const nome = s.split(' - ')[0].trim()
  return nome.charAt(0).toLocaleUpperCase('pt-BR') + nome.slice(1)
}

const um = (v: string | null) => (v ? [v] : [])

export const GRUPOS_PREFERENCIA: GrupoDef[] = [
  // Crianças tem controle próprio; aqui ficam os outros públicos.
  { id: 'publico',                 label: 'Público',                     tipo: 'lista', valores: p => (p.publico ?? []).filter(v => v !== 'Crianças') },
  { id: 'niveis',                  label: 'Níveis',                      tipo: 'lista', valores: p => p.niveis ?? [] },
  { id: 'idioma',                  label: 'Idiomas que ensina',          tipo: 'lista', valores: p => [...new Set((p.idiomas ?? []).map(idiomaSemNivel))] },
  { id: 'alunos_que_destrava',     label: 'Alunos que destrava',         tipo: 'lista', valores: p => p.alunos_que_destrava ?? [] },
  { id: 'objetivos',               label: 'Objetivos dos alunos',        tipo: 'lista', valores: p => p.objetivos ?? [] },
  { id: 'areas',                   label: 'Áreas dos alunos',            tipo: 'lista', valores: p => p.areas ?? [] },
  { id: 'variante_ingles',         label: 'Variante do inglês',          tipo: 'unico', valores: p => um(p.variante_ingles) },
  { id: 'portugues_em_aula',       label: 'Português em aula',           tipo: 'unico', valores: p => um(p.portugues_em_aula) },
  { id: 'quando_aluno_trava',      label: 'Quando o aluno trava',        tipo: 'unico', valores: p => um(p.quando_aluno_trava) },
  { id: 'alunos_neurodivergentes', label: 'Alunos neurodivergentes',     tipo: 'unico', valores: p => um(p.alunos_neurodivergentes) },
]

export type SelecaoPreferencias = Partial<Record<GrupoPreferencia, string[]>>

export function passaCriancas(perfil: PerfilProfessor | undefined, f: FiltroCriancas): boolean {
  const v = perfil?.atende_criancas ?? null
  if (f === 'sim') return v === true
  if (f === 'nao') return v === false
  if (f === 'sem') return v === null
  return true
}

export function passaPreferencias(perfil: PerfilProfessor | undefined, sel: SelecaoPreferencias): boolean {
  for (const g of GRUPOS_PREFERENCIA) {
    const escolhidos = sel[g.id]
    if (!escolhidos?.length) continue
    if (!perfil) return false
    const tem = g.valores(perfil)
    const ok = g.tipo === 'lista'
      ? escolhidos.every(e => tem.includes(e))
      : escolhidos.some(e => tem.includes(e))
    if (!ok) return false
  }
  return true
}

/** Opções de cada grupo com a contagem entre os perfis dados, mais frequentes primeiro. */
export function opcoesPreferencias(perfis: (PerfilProfessor | undefined)[]) {
  return GRUPOS_PREFERENCIA.map(g => {
    const n = new Map<string, number>()
    for (const p of perfis) if (p) for (const v of g.valores(p)) n.set(v, (n.get(v) ?? 0) + 1)
    const opcoes = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    return { ...g, opcoes }
  })
}

/** Respondeu alguma preferência no onboarding (público, níveis, idiomas…). */
export function respondeuPreferencias(p: PerfilProfessor | undefined): boolean {
  if (!p) return false
  return !!(p.publico?.length || p.niveis?.length || p.idiomas?.length || p.estilo_estrutura)
}
