import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { RoleUsuario } from '@/types'

export type UsuarioAdmin = {
  id:           string
  nome:         string
  role:         RoleUsuario
  is_lider:     boolean
  is_admin:     boolean
  ativo:        boolean
  created_at:   string
  google_email: string | null
}

/** Lista todos os usuários (apenas admin deve ter acesso via RLS). */
export function useUsuarios() {
  return useQuery({
    queryKey: ['admin', 'usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, role, is_lider, is_admin, ativo, created_at, google_email')
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

/** Atualiza role, ativo e/ou e-mail Google pessoal de um usuário. */
export function useAtualizarUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id, role, is_lider, is_admin, ativo, google_email,
    }: { id: string; role?: RoleUsuario; is_lider?: boolean; is_admin?: boolean; ativo?: boolean; google_email?: string | null }) => {
      const updates: Record<string, unknown> = {}
      if (role         !== undefined) updates.role         = role
      if (is_lider     !== undefined) updates.is_lider     = is_lider
      if (is_admin     !== undefined) updates.is_admin     = is_admin
      if (ativo        !== undefined) updates.ativo        = ativo
      if (google_email !== undefined) updates.google_email = google_email || null

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] }),
  })
}
