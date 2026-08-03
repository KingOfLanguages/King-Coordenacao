-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoria dos disparos de e-mail feitos na página /emails (Disparo de E-mails).
--
-- Uma linha por destinatário por disparo. Preenchida pela Edge Function
-- enviar-email-massa (service role), que agrupa cada disparo em massa por
-- lote_id. Guarda o corpo enviado para conferência posterior — sem PII sensível
-- além do e-mail (que já vive em professores.email).
--
-- É best-effort do lado da função: se este INSERT falhar, o envio já aconteceu e
-- a resposta ao coordenador não é afetada.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_disparos (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id UUID        REFERENCES professores(id) ON DELETE SET NULL,
  email        TEXT        NOT NULL,
  assunto      TEXT        NOT NULL,
  corpo        TEXT        NOT NULL,
  tipo         TEXT        NOT NULL DEFAULT 'personalizado'
                           CHECK (tipo IN ('convocacao','personalizado')),
  sucesso      BOOLEAN     NOT NULL DEFAULT FALSE,
  erro         TEXT,
  enviado_por  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  lote_id      UUID,       -- agrupa os destinatários de um mesmo disparo em massa
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE email_disparos IS
  'Auditoria dos e-mails disparados na página /emails. 1 linha por destinatário; lote_id agrupa o disparo em massa.';

CREATE INDEX IF NOT EXISTS idx_email_disparos_professor ON email_disparos (professor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_disparos_lote      ON email_disparos (lote_id);
CREATE INDEX IF NOT EXISTS idx_email_disparos_criado    ON email_disparos (created_at DESC);

ALTER TABLE email_disparos ENABLE ROW LEVEL SECURITY;

-- Leitura: coordenação/admin (a página é da coordenação). A escrita é só pela
-- Edge Function via service role, que ignora RLS — não há policy de INSERT.
DROP POLICY IF EXISTS "email_disparos_select" ON email_disparos;
CREATE POLICY "email_disparos_select" ON email_disparos FOR SELECT TO authenticated
  USING (sou_admin() OR minha_role() = 'coordenacao'::role_usuario);
