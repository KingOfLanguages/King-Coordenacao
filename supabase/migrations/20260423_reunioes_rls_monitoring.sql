-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: Allow admin and suporte roles to read ALL reunioes
-- (needed for the monitoring / acompanhamento page)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admin and suporte view all reunioes" ON reunioes;

CREATE POLICY "Admin and suporte view all reunioes"
  ON reunioes
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid())
    IN ('admin', 'suporte', 'suporte_aluno')
  );
