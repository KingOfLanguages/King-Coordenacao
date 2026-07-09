-- ─────────────────────────────────────────────────────────────────────────────
-- Objetivo #4: controle de chamados com 3 estados (Aberto / Em andamento /
-- Concluído) e mostrando quem começou a resolver.
--
-- Modelagem sem mexer no `resolved` existente: registramos quem ASSUMIU o
-- incidente. Estados derivados:
--   Aberto       = NOT resolved AND assumido_por IS NULL
--   Em andamento = NOT resolved AND assumido_por IS NOT NULL
--   Concluído    = resolved
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE nexus_incidents
  ADD COLUMN IF NOT EXISTS assumido_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assumido_em  TIMESTAMPTZ;

COMMENT ON COLUMN nexus_incidents.assumido_por IS
  'Quem começou a resolver o incidente (estado "em andamento"). NULL = ainda em aberto.';
COMMENT ON COLUMN nexus_incidents.assumido_em IS
  'Quando o incidente foi assumido.';

CREATE INDEX IF NOT EXISTS idx_nexus_incidents_assumido_por
  ON nexus_incidents (assumido_por) WHERE assumido_por IS NOT NULL;
