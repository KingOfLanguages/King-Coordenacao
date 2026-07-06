-- ─────────────────────────────────────────────────────────────────────────────
-- Suporte (e suporte_aluno) precisa poder registrar incidentes e observações
-- sobre professores — "acompanhar o cotidiano do professor" — mas não deve
-- resolver/reabrir/excluir (isso continua com coordenação/admin). Hoje as
-- policies de escrita de nexus_incidents e observacoes eram uma única regra
-- ALL restrita a admin/coordenacao, bloqueando até o INSERT do suporte.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── nexus_incidents: separa INSERT (mais aberto) de UPDATE/DELETE (restrito) ──

DROP POLICY IF EXISTS "nexus_incidents_write" ON nexus_incidents;

CREATE POLICY "nexus_incidents_insert" ON nexus_incidents FOR INSERT TO authenticated
  WITH CHECK (
    sou_admin()
    OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
  );

CREATE POLICY "nexus_incidents_update" ON nexus_incidents FOR UPDATE TO authenticated
  USING      (sou_admin() OR minha_role() = 'coordenacao'::role_usuario)
  WITH CHECK (sou_admin() OR minha_role() = 'coordenacao'::role_usuario);

CREATE POLICY "nexus_incidents_delete" ON nexus_incidents FOR DELETE TO authenticated
  USING (sou_admin() OR minha_role() = 'coordenacao'::role_usuario);

-- ── observacoes: mesma separação — e a policy antiga (ALL) era a ÚNICA regra
--    da tabela, ou seja, também cobria o SELECT: sem policy de leitura aberta,
--    ninguém fora de admin/coordenacao conseguia sequer VER observações
--    (a causa raiz do "nada referente ao professor aparece pro suporte").

DROP POLICY IF EXISTS "observacoes: coordenacao e admin" ON observacoes;

CREATE POLICY "observacoes_select_all" ON observacoes FOR SELECT TO authenticated USING (true);

CREATE POLICY "observacoes_insert" ON observacoes FOR INSERT TO authenticated
  WITH CHECK (
    sou_admin()
    OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
  );

CREATE POLICY "observacoes_update" ON observacoes FOR UPDATE TO authenticated
  USING      (sou_admin() OR minha_role() = 'coordenacao'::role_usuario)
  WITH CHECK (sou_admin() OR minha_role() = 'coordenacao'::role_usuario);

CREATE POLICY "observacoes_delete" ON observacoes FOR DELETE TO authenticated
  USING (sou_admin() OR minha_role() = 'coordenacao'::role_usuario);
