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

/** Editar informações / registrar reuniões / alterar grupos.
 *  O Suporte (role 'suporte') tem paridade de edição com a coordenação — decisão
 *  do João (2026-08-07): "dar via de regra todas as permissões de edição que os
 *  coordenadores têm". Espelhado na RLS em 20260754_suporte_paridade_edicao.sql.
 *  Fica de fora do suporte só o que é admin/config (excluir cadastro, grupos). */
export function canEdit(perfil?: PerfilComoAdmin): boolean {
  return perfil?.role === 'coordenacao'
      || perfil?.role === 'suporte'
      || ehAdmin(perfil)
}

/** Excluir registros permanentemente. */
export function canDelete(perfil?: PerfilComoAdmin): boolean {
  return ehAdmin(perfil)
}

/** Adicionar informações (observações, ocorrências). Todos os cargos.
 *  O comercial entra aqui só pra REGISTRAR incidente na tela /confiabilidade —
 *  continua fora de canEdit/canEditIncidente (não assume, não resolve, não
 *  edita). Espelhado na policy nexus_incidents_insert_comercial (20260768). */
export function canAddInfo(perfil?: PerfilComoAdmin): boolean {
  return perfil?.role === 'coordenacao'
      || perfil?.role === 'suporte'
      || perfil?.role === 'suporte_aluno'
      || perfil?.role === 'comercial'
      || ehAdmin(perfil)
}

/** Editar/resolver/excluir incidentes. Liberado pra todos os cargos com acesso
 *  à tela de Incidentes (coordenação, suporte, suporte_aluno, admin). */
export function canEditIncidente(perfil?: PerfilComoAdmin): boolean {
  return perfil?.role === 'coordenacao'
      || perfil?.role === 'suporte'
      || perfil?.role === 'suporte_aluno'
      || ehAdmin(perfil)
}

/** Ver/usar as categorias de incidente restritas à coordenação (procedimentos
 *  de suporte do aluno, de vendedores, problemas graves de professores).
 *  Espelha a policy de SELECT criada em 20260723_nexus_incidents_plataforma_natureza.sql —
 *  suporte/suporte_aluno nem chegam a receber essas linhas via RLS. */
export function podeVerCategoriasCoordOnly(perfil?: PerfilComoAdmin): boolean {
  return perfil?.role === 'coordenacao' || ehAdmin(perfil)
}
