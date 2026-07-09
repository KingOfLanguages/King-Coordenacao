-- ─────────────────────────────────────────────────────────────────────────────
-- Dados de perfil do professor vindos do export do KMS (planilha "Professores").
-- A API de acompanhamento NÃO retorna esses campos, então são preenchidos por
-- import pontual (casando por kms_id) e NÃO são tocados pelo kms-api-sync — logo
-- não correm risco de serem sobrescritos pela sincronização horária.
--   • cidade / estado                 — localização do professor
--   • nivel_recomendado_alunos        — nível de aluno recomendado
--                                       ('B1 ou mais' | 'A1 ou A2' | 'Sem prioridade')
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE professores
  ADD COLUMN IF NOT EXISTS cidade                    TEXT,
  ADD COLUMN IF NOT EXISTS estado                    TEXT,
  ADD COLUMN IF NOT EXISTS nivel_recomendado_alunos  TEXT;

COMMENT ON COLUMN professores.cidade                   IS 'Cidade do professor (import KMS).';
COMMENT ON COLUMN professores.estado                   IS 'UF do professor (import KMS).';
COMMENT ON COLUMN professores.nivel_recomendado_alunos IS 'Nível de aluno recomendado para o professor (import KMS).';
