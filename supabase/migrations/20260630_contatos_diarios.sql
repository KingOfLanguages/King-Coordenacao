-- ─────────────────────────────────────────────────────────────────────────────
-- Mensagens diárias — cada coordenador precisa contatar pelo menos 20
-- professores do seu grupo por dia. Esta tabela guarda a lista gerada para
-- cada coordenador/dia (fixa, não recalcula durante o dia) e o checklist de
-- quem já foi contatado.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contatos_diarios (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coordenador_id UUID        NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  professor_id   UUID        NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  data           DATE        NOT NULL DEFAULT CURRENT_DATE,
  enviado        BOOLEAN     NOT NULL DEFAULT false,
  enviado_em     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coordenador_id, professor_id, data)
);

COMMENT ON TABLE contatos_diarios IS
  'Lista diária (gerada 1x/dia por coordenador) de professores a contatar. Meta: 20/dia.';

CREATE INDEX IF NOT EXISTS idx_contatos_diarios_coord_data
  ON contatos_diarios (coordenador_id, data);

ALTER TABLE contatos_diarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contatos_select" ON contatos_diarios;
CREATE POLICY "contatos_select" ON contatos_diarios FOR SELECT TO authenticated
  USING (
    coordenador_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "contatos_update" ON contatos_diarios;
CREATE POLICY "contatos_update" ON contatos_diarios FOR UPDATE TO authenticated
  USING (
    coordenador_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    coordenador_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- ── Geração idempotente da lista do dia ───────────────────────────────────────
-- Se já existe lista para hoje, apenas retorna. Senão, seleciona até 20
-- professores ativos do grupo do coordenador, priorizando quem está há mais
-- tempo sem contato (NULL = nunca contatado entra primeiro).

CREATE OR REPLACE FUNCTION gerar_contatos_dia(p_coordenador_id UUID)
RETURNS SETOF contatos_diarios AS $$
DECLARE
  v_existe INT;
BEGIN
  IF auth.uid() <> p_coordenador_id
     AND (SELECT role FROM profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Sem permissão para gerar contatos deste coordenador.';
  END IF;

  SELECT count(*) INTO v_existe
    FROM contatos_diarios
   WHERE coordenador_id = p_coordenador_id AND data = CURRENT_DATE;

  IF v_existe = 0 THEN
    INSERT INTO contatos_diarios (coordenador_id, professor_id, data)
    SELECT p_coordenador_id, p.id, CURRENT_DATE
    FROM professores p
    WHERE p.status = 'ativo' AND p.coordenador_id = p_coordenador_id
    ORDER BY (
      SELECT max(cd.data) FROM contatos_diarios cd
       WHERE cd.professor_id = p.id AND cd.enviado
    ) ASC NULLS FIRST, p.nome ASC
    LIMIT 20
    ON CONFLICT (coordenador_id, professor_id, data) DO NOTHING;
  END IF;

  RETURN QUERY
    SELECT * FROM contatos_diarios
     WHERE coordenador_id = p_coordenador_id AND data = CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION gerar_contatos_dia(uuid) TO authenticated;
