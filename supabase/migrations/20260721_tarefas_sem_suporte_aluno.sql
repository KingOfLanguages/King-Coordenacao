-- ─────────────────────────────────────────────────────────────────────────────
-- Tarefas é interno a quem cuida dos professores: coordenação + suporte ao
-- professor + admin. O suporte ao aluno NÃO participa (nem cria, nem vê tarefas
-- de time). Ajusta o helper de time e a policy de INSERT.
-- ─────────────────────────────────────────────────────────────────────────────

-- Suporte ao aluno deixa de pertencer ao time 'suporte' (não vê tarefas de time).
CREATE OR REPLACE FUNCTION meu_time_tarefa() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE (SELECT role FROM profiles WHERE id = auth.uid())
           WHEN 'coordenacao' THEN 'coordenacao'
           WHEN 'suporte'     THEN 'suporte'
           ELSE NULL END;
$$;

-- Criar tarefa: só coordenação, suporte ao professor ou admin.
DROP POLICY IF EXISTS "tarefas_insert" ON tarefas;
CREATE POLICY "tarefas_insert" ON tarefas FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) IN ('coordenacao', 'suporte')
      OR sou_admin_tarefa()
    )
  );
