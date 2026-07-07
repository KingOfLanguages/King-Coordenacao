-- ─────────────────────────────────────────────────────────────────────────────
-- Editar/resolver/excluir incidentes deixa de ser exclusivo de coordenação/admin
-- e passa a valer pra qualquer cargo com acesso à tela de Incidentes (suporte e
-- suporte_aluno inclusos), espelhando canEditIncidente() em src/lib/permissions.ts.
-- Substitui as policies de UPDATE/DELETE/ALL criadas em 20260706, 20260711 e
-- 20260713, que restringiam essas operações a coordenacao/admin.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "nexus_incidents_write"  ON nexus_incidents;
DROP POLICY IF EXISTS "nexus_incidents_insert" ON nexus_incidents;
DROP POLICY IF EXISTS "nexus_incidents_update" ON nexus_incidents;
DROP POLICY IF EXISTS "nexus_incidents_delete" ON nexus_incidents;

CREATE POLICY "nexus_incidents_write" ON nexus_incidents FOR ALL TO authenticated
  USING (
    sou_admin()
    OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
  )
  WITH CHECK (
    sou_admin()
    OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
  );
