// ─────────────────────────────────────────────────────────────────────────────
// Matriz de permissões por cargo (KTM).
// Usada na UI para esconder/desabilitar ações. As mesmas regras são espelhadas
// nas políticas de RLS do Postgres (migration 20260628_ktm_foundation.sql).
// ─────────────────────────────────────────────────────────────────────────────

import type { RoleUsuario } from '@/types'

/** Administrar usuários (criar/aprovar/bloquear/excluir, alterar permissões). */
export function canManageUsers(role?: RoleUsuario): boolean {
  return role === 'admin'
}

/** Alterar configurações gerais (grupos, integrações, parâmetros). */
export function canConfig(role?: RoleUsuario): boolean {
  return role === 'admin'
}

/** Editar informações / registrar reuniões / alterar grupos. */
export function canEdit(role?: RoleUsuario): boolean {
  return role === 'admin' || role === 'coordenacao'
}

/** Excluir registros permanentemente. */
export function canDelete(role?: RoleUsuario): boolean {
  return role === 'admin'
}

/** Adicionar informações (observações, ocorrências). Todos os cargos. */
export function canAddInfo(role?: RoleUsuario): boolean {
  return role === 'admin'
      || role === 'coordenacao'
      || role === 'suporte'
      || role === 'suporte_aluno'
}
