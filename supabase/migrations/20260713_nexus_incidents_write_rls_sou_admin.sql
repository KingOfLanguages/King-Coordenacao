-- ─────────────────────────────────────────────────────────────────────────────
-- A policy de escrita em nexus_incidents (20260711) checava
-- minha_role() = 'admin' diretamente, igual as policies que a migration
-- 20260704_role_flags_lider_admin.sql já corrigiu pra sou_admin() (que também
-- aceita profiles.is_admin = true, desacoplado do role operacional). Essa aqui
-- foi criada depois e ficou de fora da leva — mesmo gap, mesmo fix.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "nexus_incidents_write" ON nexus_incidents;
CREATE POLICY "nexus_incidents_write" ON nexus_incidents FOR ALL TO authenticated
  USING      (sou_admin() OR minha_role() = 'coordenacao'::role_usuario)
  WITH CHECK (sou_admin() OR minha_role() = 'coordenacao'::role_usuario);
