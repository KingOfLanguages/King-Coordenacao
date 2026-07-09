-- ─────────────────────────────────────────────────────────────────────────────
-- Objetivo (2026-07-08): "para quem cadastra o incidente, ter uma tela de
-- acompanhamento dos chamados abertos pela pessoa".
--
-- Hoje só existe `coordinator` (texto livre com o nome de quem registrou), o que
-- é frágil pra filtrar "meus chamados". Adicionamos um vínculo real por ID.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE nexus_incidents
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN nexus_incidents.created_by IS
  'Usuário do KTM que registrou o incidente (quando criado pela plataforma). NULL para incidentes vindos do KMS.';

CREATE INDEX IF NOT EXISTS idx_nexus_incidents_created_by
  ON nexus_incidents (created_by) WHERE created_by IS NOT NULL;

-- Backfill best-effort: casa o nome livre em `coordinator` com o nome do perfil.
UPDATE nexus_incidents i
   SET created_by = p.id
  FROM profiles p
 WHERE i.created_by IS NULL
   AND i.coordinator IS NOT NULL
   AND lower(btrim(i.coordinator)) = lower(btrim(p.nome));
