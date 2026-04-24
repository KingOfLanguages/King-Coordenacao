-- ─────────────────────────────────────────────────────────────────────────────
-- Armazena o email Google (ex: coordenacaoking7@gmail.com) junto ao token,
-- para atribuir corretamente o coordenador_id durante a importação automática.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE google_tokens
  ADD COLUMN IF NOT EXISTS google_email TEXT;

COMMENT ON COLUMN google_tokens.google_email IS
  'Email da conta Google conectada (ex: coordenacaoking7@gmail.com).
   Preenchido automaticamente pela Edge Function exchange-google-token via Google userinfo API.
   Usado pelo daily-import para atribuir o coordenador_id correto em cada evento.';
