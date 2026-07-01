-- ─────────────────────────────────────────────────────────────────────────────
-- kms-api-sync precisa fazer upsert em lote (onConflict: 'kms_id') para não
-- estourar o limite de recursos da Edge Function processando ~1.800
-- professores um por um. supabase-js upsert() exige um índice único "normal"
-- como alvo do ON CONFLICT — o índice parcial (WHERE kms_id IS NOT NULL)
-- criado em 20260628_ktm_foundation.sql não serve pra isso.
--
-- UNIQUE constraint no Postgres já trata múltiplos NULLs como distintos
-- (não conflitam entre si), então isso preserva o comportamento anterior
-- (vários professores com kms_id NULL continuam permitidos) e também cobre
-- o caso de kms_id preenchido.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_professores_kms_id;

ALTER TABLE professores
  ADD CONSTRAINT professores_kms_id_key UNIQUE (kms_id);
