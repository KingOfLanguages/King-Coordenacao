import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { RoleUsuario } from '@/types'

export type UsuarioAdmin = {
  id:         string
  nome:       string
  role:       RoleUsuario
  ativo:      boolean
  created_at: string
}

/** Lista todos os usuários (apenas admin deve ter acesso via RLS). */
export function useUsuarios() {
  return useQuery({
    queryKey: ['admin', 'usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, role, ativo, created_at')
        .order('nome')
      if (error) throw error
      return data as UsuarioAdmin[]
    },
  })
}

/** Exclui permanentemente o usuário (profile + conta Auth via RPC). */
export function useExcluirUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_user', { target_user_id: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] }),
  })
}

/** Atualiza role e/ou ativo de um usuário. */
export function useAtualizarUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id, role, ativo,
    }: { id: string; role?: RoleUsuario; ativo?: boolean }) => {
      const updates: Record<string, unknown> = {}
      if (role  !== undefined) updates.role  = role
      if (ativo !== undefined) updates.ativo = ativo

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] }),
  })
}
