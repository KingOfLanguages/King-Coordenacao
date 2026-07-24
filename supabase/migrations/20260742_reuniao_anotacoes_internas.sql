-- ─────────────────────────────────────────────────────────────────────────────
-- Anotações internas de reunião (privadas por autor) + INSERT de participação
-- liberado para o cadastro manual de reunião de professor.
--
-- 1. reuniao_anotacoes_internas: a "versão própria" de anotações que cada
--    coordenador faz sobre uma reunião. PRIVADAS — só o autor lê/escreve as
--    suas (RLS dono-apenas, sem exceção de admin: são notas pessoais).
--    Uma anotação por (reunião, autor), editável.
--
-- 2. Libera INSERT em reuniao_professores para coordenacao/suporte/suporte_aluno/
--    admin, para que o cadastro MANUAL de reunião de professor (que vincula o
--    professor) funcione para qualquer um que cria na sua área. A policy antiga
--    "reuniao_prof_write" só cobre admin/coordenacao (para todas as operações);
--    aqui adiciona uma policy de INSERT mais ampla, espelhando reunioes_create_by_role.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reuniao_anotacoes_internas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reuniao_id  UUID        NOT NULL REFERENCES reunioes(id)  ON DELETE CASCADE,
  autor_id    UUID        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  texto       TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE reuniao_anotacoes_internas IS
  'Anotações internas de reunião, privadas por autor (só o autor vê as suas). Uma por (reunião, autor).';

-- Uma anotação por autor por reunião (permite upsert por essa chave).
CREATE UNIQUE INDEX IF NOT EXISTS idx_reuniao_anot_reuniao_autor
  ON reuniao_anotacoes_internas (reuniao_id, autor_id);
CREATE INDEX IF NOT EXISTS idx_reuniao_anot_autor
  ON reuniao_anotacoes_internas (autor_id);

ALTER TABLE reuniao_anotacoes_internas ENABLE ROW LEVEL SECURITY;

-- Privacidade total: cada um só enxerga/mexe nas SUAS anotações. Nem admin lê as
-- de outro — são pessoais, é isso que a feature promete.
DROP POLICY IF EXISTS "reuniao_anot_owner" ON reuniao_anotacoes_internas;
CREATE POLICY "reuniao_anot_owner" ON reuniao_anotacoes_internas FOR ALL TO authenticated
  USING      (autor_id = auth.uid())
  WITH CHECK (autor_id = auth.uid());


-- ── Cadastro manual de reunião de professor: liberar INSERT da participação ────
DROP POLICY IF EXISTS "reuniao_prof_create_by_role" ON reuniao_professores;
CREATE POLICY "reuniao_prof_create_by_role" ON reuniao_professores
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      sou_admin()
      OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
    )
  );

COMMENT ON POLICY "reuniao_prof_create_by_role" ON reuniao_professores IS
  'Permite admin/coordenacao/suporte/suporte_aluno vincular professor ao criar reunião manualmente na sua área.';
