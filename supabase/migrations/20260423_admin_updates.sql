-- Garante que a coluna ativo existe com default true
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;

-- Índice para listagem de usuários por status
CREATE INDEX IF NOT EXISTS idx_profiles_ativo ON profiles(ativo);
CREATE INDEX IF NOT EXISTS idx_profiles_role  ON profiles(role);

-- O tipo de observação é TEXT, então feedback_neutro funciona sem enum migration.
-- Apenas documentamos os valores válidos como comentário:
-- reuniao | ocorrencia | feedback_positivo | feedback_negativo | feedback_neutro

COMMENT ON COLUMN profiles.ativo IS 'false = conta bloqueada pelo admin, não consegue logar';
