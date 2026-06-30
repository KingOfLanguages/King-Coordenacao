-- ─────────────────────────────────────────────────────────────────────────────
-- E-mail Google pessoal de cada coordenador, usado para atribuir corretamente
-- o coordenador_id durante o daily-import quando a conexão OAuth é feita por
-- uma conta única (ex: conta compartilhada que recebe os calendários de todos).
--
-- Independente de google_tokens: este campo não concede acesso a nada, só
-- identifica "esse evento/organizador é do fulano".
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS google_email TEXT;

COMMENT ON COLUMN profiles.google_email IS
  'E-mail Google pessoal do coordenador (não é credencial de acesso).
   Usado pelo daily-import para atribuir o coordenador_id correto a cada
   reunião pelo organizer/attendee do evento, mesmo quando a conexão OAuth
   é feita por uma conta Google compartilhada.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_google_email
  ON profiles (lower(google_email))
  WHERE google_email IS NOT NULL;
