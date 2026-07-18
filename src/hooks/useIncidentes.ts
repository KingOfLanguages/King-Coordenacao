import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { MES_ANALISE_PROBLEM_TYPE } from '@/hooks/useMesAnalise'

const PROBLEM_TYPE_MES_ANALISE = MES_ANALISE_PROBLEM_TYPE
const BUCKET_INCIDENTES = 'incidentes'

/** Envia uma imagem pro bucket de incidentes e devolve a URL pública.
 *  Nome aleatório (uuid) evita colisão; o bucket é público pra renderização direta. */
export async function uploadImagemIncidente(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const caminho = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET_INCIDENTES)
    .upload(caminho, file, { cacheControl: '3600', contentType: file.type || undefined, upsert: false })
  if (error) throw error
  return supabase.storage.from(BUCKET_INCIDENTES).getPublicUrl(caminho).data.publicUrl
}

/** Roster de alunos ativos do professor (via KMS) — usado como sugestão de
 *  autocomplete no campo de aluno do incidente. Só primeiro nome (LGPD). */
export function useAlunosDoProfessor(professorId: string | null) {
  return useQuery({
    queryKey: ['alunos-do-professor', professorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professor_alunos_kms')
        .select('aluno_id, primeiro_nome')
        .eq('professor_id', professorId!)
        .order('primeiro_nome')
      if (error) throw error
      return data ?? []
    },
    enabled: !!professorId,
    staleTime: 5 * 60 * 1000,
  })
}

/** Categorias de incidentes sobre professor (aluno, sala de aula, conduta). */
export const CATEGORIAS_PROFESSOR = [
  'No-show',
  'Erros de lançamento',
  'Reclamação',
  'Muitas faltas',
  'Muitas pendências',
  'Problemas didáticos reportados em atendimento',
  'Profissionalismo',
  'Organização',
  'Problemas graves de professores',
] as const

/** Categorias gerais — questões administrativas/operacionais que não dependem de um professor específico. */
export const CATEGORIAS_GERAL = [
  'Questões administrativas',
  'Ocorrências gerais',
  'Problemas de cadastro de alunos/turmas',
  'Problemas em procedimentos do suporte do aluno',
  'Problemas em procedimentos de vendedores',
] as const

/** Categorias da aba Plataforma — bugs e melhorias reportados ao TI. */
export const CATEGORIAS_PLATAFORMA = ['Bugs', 'Melhorias'] as const

/** Categorias visíveis só pra coordenação/admin — ocultas de suporte/suporte_aluno
 *  tanto na UI (filtros/formulários) quanto por RLS (ver migration 20260723). */
export const CATEGORIAS_COORD_ONLY = [
  'Problemas em procedimentos do suporte do aluno',
  'Problemas em procedimentos de vendedores',
  'Problemas graves de professores',
] as const

/** Lista combinada — usada no filtro "todas categorias" da listagem. */
export const CATEGORIAS_INCIDENTE = [...CATEGORIAS_PROFESSOR, ...CATEGORIAS_GERAL, ...CATEGORIAS_PLATAFORMA] as const

/** Filtra categorias coordenação-only de uma lista, a menos que `podeVer` seja true. */
export function categoriasVisiveis(categorias: readonly string[], podeVer: boolean): string[] {
  return podeVer ? [...categorias] : categorias.filter(c => !(CATEGORIAS_COORD_ONLY as readonly string[]).includes(c))
}

export type Aba = 'professor' | 'geral' | 'plataforma'

/** Aba de um incidente: derivada de professor_id + categoria, nunca armazenada.
 *  Categoria de Plataforma manda mais que professor_id — um bug/melhoria com
 *  professor/aluno vinculado (pra ajudar o TI) continua na aba Plataforma. */
export function abaDoIncidente(i: Pick<Incidente, 'professor_id' | 'problem_type'>): Aba {
  if ((CATEGORIAS_PLATAFORMA as readonly string[]).includes(i.problem_type)) return 'plataforma'
  if (i.professor_id) return 'professor'
  return 'geral'
}

export type StatusChamado = 'aberto' | 'em_andamento' | 'concluido'
export type Natureza = 'informe' | 'desafio'
export type TiStatus = 'chamado_aberto' | 'em_analise_ti'

export interface Incidente {
  id: string
  professor_id: string | null
  teacher_name: string
  aluno_nome: string | null
  coordinator: string
  created_by: string | null
  problem_type: string
  urgency: string
  description: string
  solution: string
  needs_follow_up: boolean
  resolved: boolean
  resolved_at: string | null
  assumido_por: string | null
  assumido_em: string | null
  assumido_por_nome: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  created_at: string
  image_urls: string[]
  natureza: Natureza | null
  ti_status: TiStatus | null
}

/** Estado derivado do chamado a partir de resolved + assumido_por. */
export function statusChamado(i: Pick<Incidente, 'resolved' | 'assumido_por'>): StatusChamado {
  if (i.resolved) return 'concluido'
  if (i.assumido_por) return 'em_andamento'
  return 'aberto'
}

/** natureza é opcional/nullable — linhas antigas sem valor são tratadas como "desafio" (fluxo normal). */
export function natureza(i: Pick<Incidente, 'natureza'>): Natureza {
  return i.natureza ?? 'desafio'
}

/** Rótulos + microcopy da natureza. Mantém "Desafio"/"Informe" (vocabulário do
 *  King) sempre acompanhados de uma frase em linguagem simples que explica a
 *  consequência — é o que desfaz a confusão na criação do incidente. */
export const NATUREZA_META: Record<Natureza, {
  label: string     // termo do King (chip)
  titulo: string    // o que a pessoa quer fazer, em linguagem simples
  descricao: string // consequência da escolha
  verbo: string     // rótulo do botão de confirmar
}> = {
  desafio: {
    label: 'Desafio',
    titulo: 'Resolver um problema',
    descricao: 'Entra na fila, alguém assume e é acompanhado até resolver. Tem urgência.',
    verbo: 'Abrir chamado',
  },
  informe: {
    label: 'Informe',
    titulo: 'Só deixar registrado',
    descricao: 'Fica no histórico do professor como sinal. Não precisa de resolução.',
    verbo: 'Registrar informe',
  },
}

const SELECT_INCIDENTE = 'id, professor_id, teacher_name, aluno_nome, coordinator, created_by, problem_type, urgency, description, solution, needs_follow_up, resolved, resolved_at, assumido_por, assumido_em, responsavel_id, created_at, image_urls, natureza, ti_status, assumido_por_perfil:profiles!assumido_por (nome), responsavel_perfil:profiles!responsavel_id (nome)'

/** Todos os incidentes — com ou sem professor vinculado ("desafios"). Mês de
 *  Análise fica de fora, já tem fluxo e tela própria (ver useMesAnalise.ts). */
export function useIncidentes() {
  return useQuery({
    queryKey: ['incidentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nexus_incidents')
        .select(SELECT_INCIDENTE)
        .neq('problem_type', PROBLEM_TYPE_MES_ANALISE)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(row => {
        const { assumido_por_perfil, responsavel_perfil, ...i } = row as Record<string, unknown> & {
          assumido_por_perfil?: { nome: string } | { nome: string }[] | null
          responsavel_perfil?: { nome: string } | { nome: string }[] | null
        }
        const perfil = Array.isArray(assumido_por_perfil) ? assumido_por_perfil[0] : assumido_por_perfil
        const respPerfil = Array.isArray(responsavel_perfil) ? responsavel_perfil[0] : responsavel_perfil
        return {
          ...(i as unknown as Incidente),
          image_urls: (i as { image_urls?: string[] }).image_urls ?? [],
          assumido_por_nome: perfil?.nome ?? null,
          responsavel_nome: respPerfil?.nome ?? null,
        }
      }) as Incidente[]
    },
  })
}

/** Um único incidente por id — usado no detalhe da tarefa (mostra infos + fotos
 *  do desafio que originou a tarefa). Só busca quando `id` está preenchido. */
export function useIncidente(id: string | null | undefined) {
  return useQuery({
    queryKey: ['incidente', id],
    enabled: !!id,
    queryFn: async (): Promise<Incidente | null> => {
      const { data, error } = await supabase
        .from('nexus_incidents')
        .select(SELECT_INCIDENTE)
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const { assumido_por_perfil, responsavel_perfil, ...i } = data as Record<string, unknown> & {
        assumido_por_perfil?: { nome: string } | { nome: string }[] | null
        responsavel_perfil?: { nome: string } | { nome: string }[] | null
      }
      const perfil = Array.isArray(assumido_por_perfil) ? assumido_por_perfil[0] : assumido_por_perfil
      const respPerfil = Array.isArray(responsavel_perfil) ? responsavel_perfil[0] : responsavel_perfil
      return {
        ...(i as unknown as Incidente),
        image_urls: (i as { image_urls?: string[] }).image_urls ?? [],
        assumido_por_nome: perfil?.nome ?? null,
        responsavel_nome: respPerfil?.nome ?? null,
      } as Incidente
    },
  })
}

export function useCriarIncidente() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      problem_type: string
      urgency: string
      description: string
      needs_follow_up: boolean
      professor_id?: string | null
      /** Rótulo livre quando não há professor vinculado (o "desafio") — cai no problem_type se vazio. */
      titulo_livre?: string
      /** Nome do aluno referido no incidente — sempre opcional, com ou sem professor vinculado. */
      aluno_nome?: string
      /** URLs de imagens já enviadas ao Storage (bucket "incidentes"). */
      image_urls?: string[]
      /** Informe (só registro) ou Desafio (segue o fluxo normal de resolução). Default: desafio. */
      natureza?: Natureza
      /** Só pra categorias da aba Plataforma — estado inicial do chamado junto ao TI. */
      ti_status?: TiStatus | null
    }) => {
      let teacherName: string
      if (input.professor_id) {
        const { data: professor, error: e0 } = await supabase
          .from('professores').select('nome').eq('id', input.professor_id).maybeSingle()
        if (e0) throw e0
        if (!professor) throw new Error('Professor não encontrado.')
        teacherName = professor.nome
      } else {
        teacherName = input.titulo_livre?.trim() || input.problem_type
      }

      const nowIso = new Date().toISOString()
      const { error } = await supabase.from('nexus_incidents').insert({
        id: crypto.randomUUID(),
        teacher_name: teacherName,
        aluno_nome: input.aluno_nome?.trim() || null,
        coordinator: profile?.nome ?? 'KTM',
        problem_type: input.problem_type,
        urgency: input.urgency,
        description: input.description.trim(),
        solution: '',
        needs_follow_up: input.needs_follow_up,
        resolved: false,
        resolved_at: null,
        under_analysis: false,
        incident_mode: input.professor_id ? 'professor' : 'interno',
        image_urls: input.image_urls ?? [],
        natureza: input.natureza ?? 'desafio',
        ti_status: input.ti_status ?? null,
        created_at: nowIso,
        professor_id: input.professor_id ?? null,
        created_by: profile?.id ?? null,
        synced_at: nowIso,
      })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['incidentes'] })
      qc.invalidateQueries({ queryKey: ['tarefas'] }) // triggers de sync mexem nas tarefas
      if (vars.professor_id) qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}

/** Edita os campos de conteúdo de um incidente (não muda o professor vinculado). */
export function useAtualizarIncidente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      problem_type: string
      urgency: string
      description: string
      needs_follow_up: boolean
      aluno_nome?: string | null
      /** Só para incidentes gerais (sem professor): o rótulo livre exibido. */
      titulo_livre?: string
      professor_id?: string | null
      natureza?: Natureza
    }) => {
      const patch: Record<string, unknown> = {
        problem_type: input.problem_type,
        urgency: input.urgency,
        description: input.description.trim(),
        needs_follow_up: input.needs_follow_up,
        aluno_nome: input.aluno_nome?.trim() || null,
        natureza: input.natureza ?? 'desafio',
      }
      // Para geral, o teacher_name é o rótulo livre (cai no problem_type se vazio).
      if (!input.professor_id) {
        patch.teacher_name = input.titulo_livre?.trim() || input.problem_type
      }
      const { data, error } = await supabase
        .from('nexus_incidents')
        .update(patch)
        .eq('id', input.id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Nada foi atualizado — você não tem permissão para editar este chamado.')
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['incidentes'] })
      qc.invalidateQueries({ queryKey: ['tarefas'] }) // triggers de sync mexem nas tarefas
      if (vars.professor_id) qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}

/** Assumir um incidente (começar a resolver) — passa pra "em andamento". */
export function useAssumirIncidente() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ id }: { id: string; professor_id?: string | null }) => {
      const { data, error } = await supabase
        .from('nexus_incidents')
        .update({ assumido_por: profile?.id ?? null, assumido_em: new Date().toISOString() })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Nada foi atualizado — sem permissão para assumir este chamado.')
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['incidentes'] })
      qc.invalidateQueries({ queryKey: ['tarefas'] }) // triggers de sync mexem nas tarefas
      if (vars.professor_id) qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}

/** Alterna o estado de atendimento do TI (só faz sentido pra aba Plataforma) —
 *  ação rápida, independente do fluxo aberto/em_andamento/concluido. */
export function useAtualizarTiStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ti_status }: { id: string; ti_status: TiStatus }) => {
      const { data, error } = await supabase
        .from('nexus_incidents')
        .update({ ti_status })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Nada foi atualizado — sem permissão para editar este chamado.')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidentes'] })
    },
  })
}

/** Largar um incidente assumido — volta pra "em aberto". */
export function useLargarIncidente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; professor_id?: string | null }) => {
      const { error } = await supabase
        .from('nexus_incidents')
        .update({ assumido_por: null, assumido_em: null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['incidentes'] })
      qc.invalidateQueries({ queryKey: ['tarefas'] }) // triggers de sync mexem nas tarefas
      if (vars.professor_id) qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}

export function useResolverIncidente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, solution }: { id: string; solution: string; professor_id?: string | null }) => {
      const { error } = await supabase
        .from('nexus_incidents')
        .update({ resolved: true, resolved_at: new Date().toISOString(), solution: solution.trim() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['incidentes'] })
      qc.invalidateQueries({ queryKey: ['tarefas'] }) // triggers de sync mexem nas tarefas
      if (vars.professor_id) qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}

export function useExcluirIncidente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; professor_id?: string | null }) => {
      const { error } = await supabase.from('nexus_incidents').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['incidentes'] })
      qc.invalidateQueries({ queryKey: ['problemas-abertos'] })
      if (vars.professor_id) qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}

export function useReabrirIncidente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; professor_id?: string | null }) => {
      const { error } = await supabase
        .from('nexus_incidents')
        .update({ resolved: false, resolved_at: null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['incidentes'] })
      qc.invalidateQueries({ queryKey: ['tarefas'] }) // triggers de sync mexem nas tarefas
      if (vars.professor_id) qc.invalidateQueries({ queryKey: ['nexus-dados', vars.professor_id] })
    },
  })
}
