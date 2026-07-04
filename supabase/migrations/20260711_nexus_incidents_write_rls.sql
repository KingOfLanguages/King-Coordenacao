-- ─────────────────────────────────────────────────────────────────────────────
-- nexus_incidents virou tabela canônica local (King Nexus descontinuado, ver
-- [[ktm-nexus-sync]]) — não há mais razão pra restringir escrita à service
-- role via Edge Function. Adiciona INSERT/UPDATE direto pra admin/coordenacao,
-- mesmo padrão já usado em reunioes/reuniao_professores. nexus-mes-analise
-- continua existindo (tem regras de negócio próprias: conflito, tipo fixo),
-- mas o fluxo geral de "criar incidente" passa a escrever direto do client.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "nexus_incidents_write" ON nexus_incidents;
CREATE POLICY "nexus_incidents_write" ON nexus_incidents FOR ALL TO authenticated
  USING      (minha_role() = ANY (ARRAY['admin'::role_usuario, 'coordenacao'::role_usuario]))
  WITH CHECK (minha_role() = ANY (ARRAY['admin'::role_usuario, 'coordenacao'::role_usuario]));
