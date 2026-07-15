import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  canViewPage, normalizeRoles,
  type PermOverrides, type PermSubject,
} from '@/lib/pagePermissions'

const QUERY_KEY = ['page-permissions'] as const

/**
 * Overrides de acesso por página, do banco (page_permissions).
 *
 * Degradação graciosa: se a tabela ainda não existe (migração não aplicada) ou a
 * leitura falha, retorna {} — todas as páginas caem no acesso PADRÃO do registry,
 * ou seja, o app se comporta exatamente como antes deste sistema.
 */
export function usePagePermissionOverrides() {
  return useQuery({
    queryKey: QUERY_KEY,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<PermOverrides> => {
      const { data, error } = await supabase
        .from('page_permissions')
        .select('page_key, roles')
      if (error) return {}   // tabela ausente / sem permissão de leitura → usa padrões
      const map: PermOverrides = {}
      for (const row of (data ?? []) as { page_key: string; roles: unknown }[]) {
        map[row.page_key] = normalizeRoles(row.roles)
      }
      return map
    },
  })
}

/**
 * Retorna { canView, isLoading } para checar acesso a uma página pela chave.
 * `canView(key)` já considera o perfil logado e o bypass de admin.
 */
export function useCanView() {
  const { profile } = useAuth()
  const { data: overrides = {}, isLoading } = usePagePermissionOverrides()
  const canView = useCallback(
    (key: string) => canViewPage(profile, key, overrides),
    [profile, overrides],
  )
  return { canView, isLoading, overrides }
}

/** Salva o override de acesso de uma página (upsert). Apenas admin (garantido por RLS). */
export function useSalvarPermissaoPagina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ pageKey, roles }: { pageKey: string; roles: PermSubject[] }) => {
      const { error } = await supabase
        .from('page_permissions')
        .upsert({ page_key: pageKey, roles, updated_at: new Date().toISOString() }, { onConflict: 'page_key' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

/** Remove o override de uma página — volta ao acesso padrão do registry. */
export function useRestaurarPermissaoPagina() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pageKey: string) => {
      const { error } = await supabase
        .from('page_permissions')
        .delete()
        .eq('page_key', pageKey)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
