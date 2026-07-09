-- ─────────────────────────────────────────────────────────────────────────────
-- Objetivo (2026-07-08): abrir tarefas entre suporte e coordenação (nos dois
-- sentidos), endereçadas a uma pessoa específica OU "no geral" para um time.
--
-- Uma tarefa tem um criador e um destino: uma pessoa (atribuido_a) OU um time
-- (atribuido_time = 'coordenacao' | 'suporte'). Status Aberto/Concluído.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tarefas (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo         TEXT        NOT NULL,
  descricao      TEXT,
  criado_por     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  atribuido_a    UUID        REFERENCES profiles(id) ON DELETE SET NULL,   -- pessoa específica
  atribuido_time TEXT        CHECK (atribuido_time IN ('coordenacao', 'suporte')), -- geral p/ time
  status         TEXT        NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'concluido')),
  concluido_em   TIMESTAMPTZ,
  concluido_por  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tarefas IS
  'Tarefas entre suporte e coordenação. Endereçadas a uma pessoa (atribuido_a) ou a um time (atribuido_time).';

CREATE INDEX IF NOT EXISTS idx_tarefas_criado_por     ON tarefas (criado_por);
CREATE INDEX IF NOT EXISTS idx_tarefas_atribuido_a    ON tarefas (atribuido_a);
CREATE INDEX IF NOT EXISTS idx_tarefas_atribuido_time ON tarefas (atribuido_time);
CREATE INDEX IF NOT EXISTS idx_tarefas_status         ON tarefas (status);

-- ── Helpers (SECURITY DEFINER — leem profiles sem recursão de RLS) ────────────

CREATE OR REPLACE FUNCTION meu_time_tarefa() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE (SELECT role FROM profiles WHERE id = auth.uid())
           WHEN 'coordenacao'   THEN 'coordenacao'
           WHEN 'suporte'       THEN 'suporte'
           WHEN 'suporte_aluno' THEN 'suporte'
           ELSE NULL END;
$$;
GRANT EXECUTE ON FUNCTION meu_time_tarefa() TO authenticated;

CREATE OR REPLACE FUNCTION sou_admin_tarefa() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin OR role = 'admin' FROM profiles WHERE id = auth.uid()), false);
$$;
GRANT EXECUTE ON FUNCTION sou_admin_tarefa() TO authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;

-- Visível para: criador, destinatário (pessoa), time destinatário, ou admin.
DROP POLICY IF EXISTS "tarefas_select" ON tarefas;
CREATE POLICY "tarefas_select" ON tarefas FOR SELECT TO authenticated
  USING (
    criado_por = auth.uid()
    OR atribuido_a = auth.uid()
    OR (atribuido_time IS NOT NULL AND atribuido_time = meu_time_tarefa())
    OR sou_admin_tarefa()
  );

-- Criar: coordenação/suporte/admin; o criador tem que ser o próprio usuário.
DROP POLICY IF EXISTS "tarefas_insert" ON tarefas;
CREATE POLICY "tarefas_insert" ON tarefas FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('coordenacao', 'suporte', 'suporte_aluno')
      OR sou_admin_tarefa()
    )
  );

-- Atualizar (concluir/reabrir/editar): quem enxerga a tarefa pode atualizar.
DROP POLICY IF EXISTS "tarefas_update" ON tarefas;
CREATE POLICY "tarefas_update" ON tarefas FOR UPDATE TO authenticated
  USING (
    criado_por = auth.uid()
    OR atribuido_a = auth.uid()
    OR (atribuido_time IS NOT NULL AND atribuido_time = meu_time_tarefa())
    OR sou_admin_tarefa()
  )
  WITH CHECK (
    criado_por = auth.uid()
    OR atribuido_a = auth.uid()
    OR (atribuido_time IS NOT NULL AND atribuido_time = meu_time_tarefa())
    OR sou_admin_tarefa()
  );

-- Excluir: criador ou admin.
DROP POLICY IF EXISTS "tarefas_delete" ON tarefas;
CREATE POLICY "tarefas_delete" ON tarefas FOR DELETE TO authenticated
  USING (criado_por = auth.uid() OR sou_admin_tarefa());
