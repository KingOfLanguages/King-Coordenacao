-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela para armazenar refresh tokens do Google Calendar por coordenador
-- Usado pela Edge Function "daily-import" para importação automática diária
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS google_tokens (
  user_id       UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT        NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: cada usuário só vê/edita o próprio token
ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own google token" ON google_tokens;
CREATE POLICY "Users manage own google token"
  ON google_tokens FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
