-- ─────────────────────────────────────────────────────────────────────────────
-- KTM — Fundação (Milestone 1)
-- Grupos de coordenação + extensão do cadastro de professores +
-- distribuição automática + RLS.
--
-- Faixas de tempo de casa usadas na distribuição:
--   A  (até 3 meses)   |  B  (3 a 8 meses)   |  C  (mais de 8 meses)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Tabela de grupos de coordenação ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS grupos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           TEXT        NOT NULL,
  coordenador_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  ativo          BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  grupos                IS 'Grupos de coordenação. Todo professor ativo pertence a exatamente um.';
COMMENT ON COLUMN grupos.coordenador_id IS 'Coordenador responsável pelo grupo (profiles.id).';

-- Seed dos 3 grupos iniciais (nomes provisórios, editáveis em Configurações).
-- Só insere se a tabela ainda estiver vazia.
INSERT INTO grupos (nome)
SELECT v.nome
FROM (VALUES ('Grupo 1'), ('Grupo 2'), ('Grupo 3')) AS v(nome)
WHERE NOT EXISTS (SELECT 1 FROM grupos);


-- ── 2. Extensão do cadastro de professores ───────────────────────────────────

ALTER TABLE professores
  ADD COLUMN IF NOT EXISTS kms_id         TEXT,
  ADD COLUMN IF NOT EXISTS grupo_id       UUID REFERENCES grupos(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coordenador_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status         TEXT NOT NULL DEFAULT 'ativo'
                                          CHECK (status IN ('ativo', 'pausa', 'desligado'));

COMMENT ON COLUMN professores.kms_id         IS 'ID externo no KingManagementSystem — chave de idempotência do webhook.';
COMMENT ON COLUMN professores.grupo_id       IS 'Grupo de coordenação do professor.';
COMMENT ON COLUMN professores.coordenador_id IS 'Coordenador responsável (default = coordenador do grupo).';
COMMENT ON COLUMN professores.status         IS 'Status canônico. pausa/saiu são mantidos em sincronia por trigger (legado).';

-- kms_id único quando preenchido (permite múltiplos NULL para cadastros manuais).
CREATE UNIQUE INDEX IF NOT EXISTS idx_professores_kms_id ON professores(kms_id) WHERE kms_id IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_professores_grupo  ON professores(grupo_id);
CREATE INDEX        IF NOT EXISTS idx_professores_status ON professores(status);

-- Backfill do status a partir das flags legadas (saiu tem precedência sobre pausa).
UPDATE professores
   SET status = CASE
                  WHEN saiu  THEN 'desligado'
                  WHEN pausa THEN 'pausa'
                  ELSE            'ativo'
                END;


-- ── 3. Sincronização status <-> pausa/saiu (compatibilidade) ──────────────────
-- status é a fonte da verdade, mas mantemos pausa/saiu para não quebrar os hooks
-- existentes (useProfessoresAtivos, useProfessoresEmPausa, etc.). Bidirecional:
-- quem mudar (status OU as flags) reconcilia o outro lado.

CREATE OR REPLACE FUNCTION sync_professor_status() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.pausa := (NEW.status = 'pausa');
    NEW.saiu  := (NEW.status = 'desligado');
  ELSIF TG_OP = 'UPDATE'
        AND (NEW.pausa IS DISTINCT FROM OLD.pausa OR NEW.saiu IS DISTINCT FROM OLD.saiu) THEN
    NEW.status := CASE WHEN NEW.saiu THEN 'desligado'
                       WHEN NEW.pausa THEN 'pausa'
                       ELSE 'ativo' END;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'ativo' THEN
      NEW.pausa := (NEW.status = 'pausa');
      NEW.saiu  := (NEW.status = 'desligado');
    ELSE
      NEW.status := CASE WHEN NEW.saiu THEN 'desligado'
                         WHEN NEW.pausa THEN 'pausa'
                         ELSE 'ativo' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_status ON professores;
CREATE TRIGGER trg_sync_status
  BEFORE INSERT OR UPDATE ON professores
  FOR EACH ROW EXECUTE FUNCTION sync_professor_status();


-- ── 4. Distribuição automática em grupos ──────────────────────────────────────

-- 4a. Regra incremental: grupo com MENOS professores ativos;
--     empate -> grupo com MENOS recém-contratados (Faixa A, até 3 meses).
CREATE OR REPLACE FUNCTION pick_grupo_novo_professor() RETURNS UUID AS $$
  SELECT g.id
  FROM grupos g
  WHERE g.ativo
  ORDER BY
    (SELECT count(*) FROM professores p
       WHERE p.grupo_id = g.id AND p.status = 'ativo') ASC,
    (SELECT count(*) FROM professores p
       WHERE p.grupo_id = g.id AND p.status = 'ativo'
         AND p.data_inicio IS NOT NULL
         AND p.data_inicio >= CURRENT_DATE - INTERVAL '3 months') ASC,
    g.created_at ASC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- 4b. Trigger: ao inserir professor ativo sem grupo, aloca automaticamente
--     e herda o coordenador do grupo (se não veio definido).
CREATE OR REPLACE FUNCTION atribuir_grupo_professor() RETURNS TRIGGER AS $$
DECLARE
  v_grupo UUID;
BEGIN
  IF NEW.grupo_id IS NULL AND NEW.status = 'ativo' THEN
    v_grupo := pick_grupo_novo_professor();
    NEW.grupo_id := v_grupo;
    IF NEW.coordenador_id IS NULL THEN
      NEW.coordenador_id := (SELECT coordenador_id FROM grupos WHERE id = v_grupo);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_atribuir_grupo ON professores;
CREATE TRIGGER trg_atribuir_grupo
  BEFORE INSERT ON professores
  FOR EACH ROW EXECUTE FUNCTION atribuir_grupo_professor();

-- 4c. Distribuição inicial equilibrada (~33% de cada faixa por grupo).
--     Round-robin sobre a lista ordenada por faixa -> equilibra totais e mix.
--     Admin-only. Guarda contra reexecução acidental (use p_force := true).
CREATE OR REPLACE FUNCTION distribuir_professores_inicial(p_force BOOLEAN DEFAULT false)
RETURNS TABLE(grupo_id UUID, nome TEXT, total BIGINT) AS $$
DECLARE
  v_grupos UUID[];
  v_n      INT;
  v_count  INT;
  r        RECORD;
  i        INT := 0;
BEGIN
  IF (SELECT role FROM profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem executar a distribuição inicial.';
  END IF;

  SELECT count(*) INTO v_count
    FROM professores WHERE status = 'ativo' AND grupo_id IS NOT NULL;
  IF v_count > 0 AND NOT p_force THEN
    RAISE EXCEPTION 'Já existem % professores distribuídos. Use force=true para redistribuir.', v_count;
  END IF;

  SELECT array_agg(g.id ORDER BY g.created_at) INTO v_grupos FROM grupos g WHERE g.ativo;
  v_n := COALESCE(array_length(v_grupos, 1), 0);
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Nenhum grupo ativo cadastrado.';
  END IF;

  FOR r IN
    SELECT p.id,
      CASE
        WHEN p.data_inicio IS NULL                                         THEN 3
        WHEN p.data_inicio >= CURRENT_DATE - INTERVAL '3 months'           THEN 1  -- Faixa A
        WHEN p.data_inicio >= CURRENT_DATE - INTERVAL '8 months'           THEN 2  -- Faixa B
        ELSE                                                                    3  -- Faixa C
      END AS faixa
    FROM professores p
    WHERE p.status = 'ativo'
    ORDER BY faixa, p.data_inicio NULLS LAST, p.id
  LOOP
    UPDATE professores
       SET grupo_id       = v_grupos[(i % v_n) + 1],
           coordenador_id = COALESCE(
             coordenador_id,
             (SELECT g.coordenador_id FROM grupos g WHERE g.id = v_grupos[(i % v_n) + 1])
           )
     WHERE id = r.id;
    i := i + 1;
  END LOOP;

  RETURN QUERY
    SELECT g.id, g.nome,
           count(p.id) FILTER (WHERE p.status = 'ativo')
    FROM grupos g
    LEFT JOIN professores p ON p.grupo_id = g.id
    WHERE g.ativo
    GROUP BY g.id, g.nome
    ORDER BY g.created_at;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION pick_grupo_novo_professor()                 TO authenticated;
GRANT EXECUTE ON FUNCTION distribuir_professores_inicial(boolean)     TO authenticated;


-- ── 5. RLS ────────────────────────────────────────────────────────────────────

-- 5a. grupos: todos veem; só admin escreve (configuração).
ALTER TABLE grupos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grupos_select_all"  ON grupos;
CREATE POLICY "grupos_select_all"  ON grupos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "grupos_admin_write" ON grupos;
CREATE POLICY "grupos_admin_write" ON grupos FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 5b. professores: todos veem; admin+coordenacao inserem/editam; só admin exclui.
ALTER TABLE professores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "professores_select_all"   ON professores;
CREATE POLICY "professores_select_all"   ON professores FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "professores_insert_coord" ON professores;
CREATE POLICY "professores_insert_coord" ON professores FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));

DROP POLICY IF EXISTS "professores_update_coord" ON professores;
CREATE POLICY "professores_update_coord" ON professores FOR UPDATE TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));

DROP POLICY IF EXISTS "professores_delete_admin" ON professores;
CREATE POLICY "professores_delete_admin" ON professores FOR DELETE TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
