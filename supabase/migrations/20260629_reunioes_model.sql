-- ─────────────────────────────────────────────────────────────────────────────
-- Modelo de gestão de reuniões (Fase 2)
--   1. professor_emails    — vários e-mails por professor (aprendizado de vínculo)
--   2. reuniao_professores — junção evento↔professores (multi-professor; cada um
--                            conta como 1 reunião, com status/observação/numeração)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. E-mails por professor ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS professor_emails (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id UUID        NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  email        TEXT        NOT NULL,
  origem       TEXT,       -- 'cadastro' | 'calendar' | 'manual' | 'kms'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE professor_emails IS
  'Identificadores de e-mail de cada professor. Um e-mail aponta para um único professor.';

-- Um e-mail (case-insensitive) pertence a no máximo um professor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_professor_emails_email ON professor_emails (lower(email));
CREATE INDEX        IF NOT EXISTS idx_professor_emails_prof  ON professor_emails (professor_id);

-- Backfill: e-mail atual do cadastro vira o primeiro identificador.
INSERT INTO professor_emails (professor_id, email, origem)
SELECT id, email, 'cadastro'
FROM professores
WHERE email IS NOT NULL AND btrim(email) <> ''
ON CONFLICT DO NOTHING;


-- ── 2. Participação de professores na reunião (junção) ───────────────────────

CREATE TABLE IF NOT EXISTS reuniao_professores (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reuniao_id     UUID        NOT NULL REFERENCES reunioes(id)   ON DELETE CASCADE,
  professor_id   UUID        REFERENCES professores(id)         ON DELETE CASCADE,
  status         TEXT        NOT NULL DEFAULT 'pendente'
                             CHECK (status IN ('pendente', 'realizada', 'cancelada')),
  numero         INT,        -- nº do monitoramento (1º, 2º…), definido na confirmação
  observacao     TEXT,
  confirmado_em  TIMESTAMPTZ,
  confirmado_por UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE reuniao_professores IS
  'Cada professor vinculado a um evento/reunião. Cada linha conta como 1 reunião.';

CREATE INDEX        IF NOT EXISTS idx_reuniao_prof_reuniao   ON reuniao_professores (reuniao_id);
CREATE INDEX        IF NOT EXISTS idx_reuniao_prof_professor ON reuniao_professores (professor_id);
-- Um professor não pode estar duplicado no mesmo evento.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reuniao_prof_unique
  ON reuniao_professores (reuniao_id, professor_id) WHERE professor_id IS NOT NULL;

-- Backfill: cada reunião atual (1 professor) vira uma participação.
INSERT INTO reuniao_professores (reuniao_id, professor_id, status)
SELECT id, professor_id,
       CASE WHEN status = 'concluida' THEN 'realizada'
            WHEN status = 'cancelada' THEN 'cancelada'
            ELSE 'pendente' END
FROM reunioes
WHERE professor_id IS NOT NULL
ON CONFLICT DO NOTHING;


-- ── 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE professor_emails    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reuniao_professores ENABLE ROW LEVEL SECURITY;

-- professor_emails: todos veem; admin/coordenação escrevem.
DROP POLICY IF EXISTS "prof_emails_select" ON professor_emails;
CREATE POLICY "prof_emails_select" ON professor_emails FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "prof_emails_write" ON professor_emails;
CREATE POLICY "prof_emails_write" ON professor_emails FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));

-- reuniao_professores: todos veem; admin/coordenação escrevem.
DROP POLICY IF EXISTS "reuniao_prof_select" ON reuniao_professores;
CREATE POLICY "reuniao_prof_select" ON reuniao_professores FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reuniao_prof_write" ON reuniao_professores;
CREATE POLICY "reuniao_prof_write" ON reuniao_professores FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));
