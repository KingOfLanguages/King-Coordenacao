-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3: RLS para CREATE de reunioes via Edge Function
--
-- A edge function create-booking roda como service_role e precisa inserir em
-- reunioes quando o primeiro professor se inscreve. Hoje as policies permitem
-- admin/coordenacao ler+escrever, mas a edge function usaria service_role bypass.
--
-- Por segurança/auditoria, vamos deixar explícito: admin, coordenacao, suporte
-- e suporte_aluno podem criar reunioes. A edge function (service_role) passa em
-- qualquer policy de INSERT.
--
-- Nota: SELECT/UPDATE/DELETE policies já devem existir de migrations anteriores.
-- ─────────────────────────────────────────────────────────────────────────────

-- Verificar se política de INSERT já existe; se não, criar
DO $$
BEGIN
  -- Tenta dropar se existe (migration idempotente)
  DROP POLICY IF EXISTS "reunioes_create_by_role" ON reunioes;
EXCEPTION
  WHEN OTHERS THEN NULL;
END
$$;

CREATE POLICY "reunioes_create_by_role" ON reunioes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      sou_admin()
      OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
    )
  );

COMMENT ON POLICY "reunioes_create_by_role" ON reunioes IS
  'Permite admin, coordenacao, suporte e suporte_aluno criar reuniões (via edge function create-booking ao processar primeiro inscrito em grupo).';
