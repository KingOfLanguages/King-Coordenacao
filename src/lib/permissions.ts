// ─────────────────────────────────────────────────────────────────────────────
// Matriz de permissões por cargo (KTM).
// Usada na UI para esconder/desabilitar ações. As mesmas regras são espelhadas
// nas políticas de RLS do Postgres (migration 20260628_ktm_foundation.sql).
// ─────────────────────────────────────────────────────────────────────────────

import type { Profile } from '@/types'

type PerfilComoAdmin = Pick<Profile, 'role' | 'is_admin'> | null | undefined

/** admin vira uma capacidade auxiliar (is_admin), desacoplada do papel operacional. */
function ehAdmin(perfil?: PerfilComoAdmin): boolean {
  return perfil?.is_admin === true || perfil?.role === 'admin'
}

/** Administrar usuários (criar/aprovar/bloquear/excluir, alterar permissões). */
export function canManageUsers(perfil?: PerfilComoAdmin): boolean {
  return ehAdmin(perfil)
}

/** Alterar configurações gerais (grupos, integrações, parâmetros). */
export function canConfig(perfil?: PerfilComoAdmin): boolean {
  return ehAdmin(perfil)
}

/** Editar informações / registrar reuniões / alterar grupos. */
export function canEdit(perfil?: PerfilComoAdmin): boolean {
  return perfil?.role === 'coordenacao' || ehAdmin(perfil)
}

/** Excluir registros permanentemente. */
export function canDelete(perfil?: PerfilComoAdmin): boolean {
  return ehAdmin(perfil)
}

/** Adicionar informações (observações, ocorrências). Todos os cargos. */
export function canAddInfo(perfil?: PerfilComoAdmin): boolean {
  return perfil?.role === 'coordenacao'
      || perfil?.role === 'suporte'
      || perfil?.role === 'suporte_aluno'
      || ehAdmin(perfil)
}
