import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

type ReuniaoInfo = {
  id: string
  data: string
  titulo: string | null
  meet_link: string | null
  status: string
  tipo_reuniao: string | null
  // Coordenador dono da agenda em que a reunião aparece — no import do Google
  // Calendar vem do calendário/organizador do evento, e nas reuniões em grupo do
  // dono da agenda de agendamento. Não é o coordenador responsável pelo professor.
  //
  // Guardamos só o id: `profiles` é restrito à própria linha (ou admin) pela RLS,
  // então o join aninhado voltava NULL pra quem é suporte — justamente o cargo
  // que usa esta tela. O nome vem da view `perfis_publicos` (useNomesPorPerfilId).
  coordenador_id: string | null
}

export type ReuniaoBusca = {
  id: string
  status: 'pendente' | 'realizada' | 'cancelada'
  numero: number | null
  observacao: string | null
  confirmado_em: string | null
  professor: {
    id: string
    nome: string
  } | null
  reuniao: ReuniaoInfo | ReuniaoInfo[] | null
}

function um<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/**
 * Nome do coordenador responsável pela reunião — o dono da agenda em que ela
 * aparece. `nomes` é o mapa de useNomesPorPerfilId().
 */
export function coordenadorNomeDe(r: ReuniaoBusca, nomes: Map<string, string>): string {
  const coordId = um(r.reuniao)?.coordenador_id
  if (!coordId) return 'Sem coordenador'
  return nomes.get(coordId) ?? '—'
}

export function reuniaoDe(r: ReuniaoBusca) {
  return um(r.reuniao)
}

/** Busca reuniões por nome do professor — usado pela tela de Suporte. */
export function useBuscarReunioesPorProfessor(termo: string) {
  return useQuery({
    queryKey: ['suporte-reunioes', termo],
    enabled: termo.trim().length >= 2,
    queryFn: async (): Promise<ReuniaoBusca[]> => {
      const { data, error } = await supabase
        .from('reuniao_professores')
        .select(`
          id, status, numero, observacao, confirmado_em,
          professor:professores!inner(id, nome),
          reuniao:reunioes(id, data, titulo, meet_link, status, tipo_reuniao, coordenador_id)
        `)
        .ilike('professor.nome', `%${termo.trim()}%`)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as unknown as ReuniaoBusca[]
    },
  })
}

/** Todas as reuniões de um dia específico (data no formato YYYY-MM-DD, horário local) —
 *  visão padrão da tela de Suporte antes de qualquer busca por nome. */
export function useReunioesDoDia(diaISO: string) {
  return useQuery({
    queryKey: ['suporte-reunioes-do-dia', diaISO],
    queryFn: async (): Promise<ReuniaoBusca[]> => {
      const inicio = `${diaISO}T00:00:00`
      const fim = `${diaISO}T23:59:59.999`
      const { data, error } = await supabase
        .from('reuniao_professores')
        .select(`
          id, status, numero, observacao, confirmado_em,
          professor:professores!inner(id, nome),
          reuniao:reunioes!inner(id, data, titulo, meet_link, status, tipo_reuniao, coordenador_id)
        `)
        .gte('reuniao.data', inicio)
        .lte('reuniao.data', fim)
        .order('data', { referencedTable: 'reuniao', ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as ReuniaoBusca[]
    },
  })
}
