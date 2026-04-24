-- ─────────────────────────────────────────────────────────────────────────────
-- Adiciona coluna de email ao cadastro de professores
-- Usado pela Edge Function "send-reminders" para enviar lembretes automáticos
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE professores
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN professores.email IS
  'Email do professor para envio de lembretes automáticos de reunião';
