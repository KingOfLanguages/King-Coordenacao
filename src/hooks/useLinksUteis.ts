import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Links externos do bloco Links úteis da Minha Área (tabela links_uteis,
// migration 20260788). Os portais da plataforma não passam por aqui: vêm de
// src/lib/portal.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface LinkUtil {
  id: string
  titulo: string
  url: string
  created_at: string
}

export function useLinksUteis() {
  return useQuery({
    queryKey: ['links-uteis'],
    queryFn: async (): Promise<LinkUtil[]> => {
      const { data, error } = await supabase
        .from('links_uteis')
        .select('id, titulo, url, created_at')
        .order('created_at', { ascending: true })
      // Tabela fora do ar não derruba a Minha Área — ficam só os da plataforma.
      if (error) return []
      return (data ?? []) as LinkUtil[]
    },
    staleTime: 5 * 60_000,
  })
}

/** Aceita "site.com/x" (completa com https://) e recusa o que não for http(s).
 *  Devolve a URL normalizada, ou null se não der para usar. */
export function normalizarUrl(bruta: string): string | null {
  const t = bruta.trim()
  if (!t) return null
  const comProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(comProtocolo)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

export function useAdicionarLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ titulo, url }: { titulo: string; url: string }) => {
      const { error } = await supabase.from('links_uteis').insert({ titulo: titulo.trim(), url })
      if (error) throw new Error(error.code === '42501' ? 'Sem permissão para adicionar links.' : error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['links-uteis'] }),
  })
}

export function useRemoverLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Sem permissão, a RLS não dá erro: só não apaga nada. O select conta.
      const { data, error } = await supabase.from('links_uteis').delete().eq('id', id).select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('Sem permissão para remover este link.')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['links-uteis'] }),
  })
}
