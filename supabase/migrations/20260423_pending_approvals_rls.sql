-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela de solicitações de acesso + RLS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_approvals (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT        NOT NULL,
  nome           TEXT        NOT NULL,
  role_solicitada TEXT       NOT NULL DEFAULT 'suporte',
  status         TEXT        NOT NULL DEFAULT 'pendente'
                             CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para a query mais comum (admin buscando pendentes)
CREATE INDEX IF NOT EXISTS idx_pending_approvals_status
  ON pending_approvals (status);

-- Habilita RLS
ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;

-- ── Políticas ─────────────────────────────────────────────────────────────────

-- Qualquer usuário autenticado pode INSERIR a própria solicitação
DROP POLICY IF EXISTS "Users can insert own approval" ON pending_approvals;
CREATE POLICY "Users can insert own approval"
  ON pending_approvals
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin pode VER todas as solicitações
DROP POLICY IF EXISTS "Admins can select approvals" ON pending_approvals;
CREATE POLICY "Admins can select approvals"
  ON pending_approvals
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Admin pode ATUALIZAR (aprovar / rejeitar)
DROP POLICY IF EXISTS "Admins can update approvals" ON pending_approvals;
CREATE POLICY "Admins can update approvals"
  ON pending_approvals
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- O próprio usuário pode ver o status da PRÓPRIA solicitação
DROP POLICY IF EXISTS "Users can view own approval" ON pending_approvals;
CREATE POLICY "Users can view own approval"
  ON pending_approvals
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
