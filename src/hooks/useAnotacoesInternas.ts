import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// Anotações internas de reunião — a "versão própria" de anotações de cada
// coordenador. PRIVADAS: a RLS (reuniao_anotacoes_internas) só devolve as do
// próprio autor, então toda leitura aqui já vem filtrada por quem está logado.
// Uma anotação por (reunião, autor) — upsert; texto vazio apaga.
// ─────────────────────────────────────────────────────────────────────────────

export interface AnotacaoInterna {
  id: string
  reuniao_id: string
  texto: string
  updated_at: string
}

/** Minha anotação privada de uma reunião (ou null se ainda não escrevi). */
export function useMinhaAnotacao(reuniaoId?: string) {
  return useQuery({
    queryKey: ['anotacao-interna', reuniaoId],
    enabled: !!reuniaoId,
    queryFn: async (): Promise<AnotacaoInterna | null> => {
      const { data, error } = await supabase
        .from('reuniao_anotacoes_internas')
        .select('id, reuniao_id, texto, updated_at')
        .eq('reuniao_id', reuniaoId!)
        .maybeSingle()
      if (error) throw error
      return (data as AnotacaoInterna | null) ?? null
    },
  })
}

/** Salva (upsert) minha anotação da reunião. Texto vazio = apaga a anotação. */
export function useSalvarAnotacao() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ reuniaoId, texto }: { reuniaoId: string; texto: string }) => {
      const autor = profile?.id
      if (!autor) throw new Error('Sessão inválida.')
      const limpo = texto.trim()

      if (!limpo) {
        const { error } = await supabase
          .from('reuniao_anotacoes_internas')
          .delete()
          .eq('reuniao_id', reuniaoId)
          .eq('autor_id', autor)
        if (error) throw error
        return
      }

      const { error } = await supabase
        .from('reuniao_anotacoes_internas')
        .upsert(
          { reuniao_id: reuniaoId, autor_id: autor, texto: limpo, updated_at: new Date().toISOString() },
          { onConflict: 'reuniao_id,autor_id' },
        )
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['anotacao-interna', v.reuniaoId] })
      qc.invalidateQueries({ queryKey: ['minhas-anotacoes'] })
    },
  })
}

// ─── Agregação para a "Minha Área" (perfil interno do coordenador) ────────────

export interface MinhaAnotacaoItem {
  id: string
  texto: string
  updated_at: string
  reuniao: {
    id: string
    data: string
    titulo: string | null
    tipo_reuniao: 'professor' | 'interna' | 'grupo'
    professores: string[]
  } | null
}

type ReuniaoRaw = {
  id: string
  data: string
  titulo: string | null
  tipo_reuniao: 'professor' | 'interna' | 'grupo'
  participantes: { professor: { nome: string } | { nome: string }[] | null }[] | null
}
type AnotacaoRaw = {
  id: string
  texto: string
  updated_at: string
  reuniao: ReuniaoRaw | ReuniaoRaw[] | null
}

const um = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

/** Todas as minhas anotações + contexto da reunião. RLS garante que são só as minhas. */
export function useMinhasAnotacoes() {
  return useQuery({
    queryKey: ['minhas-anotacoes'],
    queryFn: async (): Promise<MinhaAnotacaoItem[]> => {
      const { data, error } = await supabase
        .from('reuniao_anotacoes_internas')
        .select(`
          id, texto, updated_at,
          reuniao:reunioes (
            id, data, titulo, tipo_reuniao,
            participantes:reuniao_professores ( professor:professores ( nome ) )
          )
        `)
        .order('updated_at', { ascending: false })
      if (error) throw error

      return ((data ?? []) as unknown as AnotacaoRaw[]).map((a): MinhaAnotacaoItem => {
        const r = um(a.reuniao)
        return {
          id: a.id,
          texto: a.texto,
          updated_at: a.updated_at,
          reuniao: r
            ? {
                id: r.id,
                data: r.data,
                titulo: r.titulo,
                tipo_reuniao: r.tipo_reuniao,
                professores: (r.participantes ?? [])
                  .map(p => um(p.professor)?.nome)
                  .filter((n): n is string => !!n),
              }
            : null,
        }
      })
    },
  })
}
