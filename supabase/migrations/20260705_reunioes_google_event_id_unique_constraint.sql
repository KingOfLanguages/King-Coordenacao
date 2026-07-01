-- ─────────────────────────────────────────────────────────────────────────────
-- daily-import precisa fazer upsert em lote (onConflict: 'google_event_id')
-- para não estourar o limite de recursos da Edge Function processando
-- centenas de eventos um por um (mesmo problema já corrigido em kms-api-sync,
-- ver 20260704_professores_kms_id_unique_constraint.sql). supabase-js
-- upsert() exige um índice único "normal" como alvo do ON CONFLICT — o índice
-- parcial (WHERE google_event_id IS NOT NULL) criado em
-- 20260423_reunioes_nullable_professor.sql não serve pra isso.
--
-- UNIQUE constraint no Postgres já trata múltiplos NULLs como distintos
-- (reuniões criadas manualmente, sem google_event_id, continuam permitidas).
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_reunioes_google_event_id;

ALTER TABLE reunioes
  ADD CONSTRAINT reunioes_google_event_id_key UNIQUE (google_event_id);
