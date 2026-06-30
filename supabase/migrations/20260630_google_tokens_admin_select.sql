-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: "Desativar importação automática" não funcionava para admin quando a
-- conexão pertencia a OUTRO usuário (ex: conta compartilhada conectada por
-- um coordenador, não pelo admin que está tentando desativar).
--
-- Causa: no Postgres, DELETE/UPDATE com RLS exigem que a linha também seja
-- visível por alguma política de SELECT — não basta uma política de DELETE
-- permissiva. Como só existia a política "own row" para SELECT, a política
-- "Admins can delete any google token" (20260630_google_automation_admin.sql)
-- nunca via a linha de outro usuário para poder de fato apagá-la (o filtro
-- combinado virava, na prática, "(A OR B) AND A" = "A", anulando a parte do
-- admin). Confirmado via EXPLAIN do DELETE.
--
-- Fix: política de SELECT equivalente para admin, espelhando a de DELETE.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can view any google token" ON google_tokens;
CREATE POLICY "Admins can view any google token"
  ON google_tokens FOR SELECT TO authenticated
  USING ( minha_role() = 'admin' );
