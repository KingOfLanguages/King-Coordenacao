-- Permite reuniões sem professor vinculado (agenda pessoal do coordenador)
ALTER TABLE reunioes ALTER COLUMN professor_id DROP NOT NULL;

-- Armazena o link de entrada da reunião (Google Meet ou htmlLink do Calendar)
ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS meet_link TEXT;

-- Constraint de unicidade para evitar duplicatas na reimportação
-- (o código já faz a verificação manual, mas a constraint garante no DB)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reunioes_google_event_id
  ON reunioes (google_event_id)
  WHERE google_event_id IS NOT NULL;

COMMENT ON COLUMN reunioes.professor_id IS 'NULL = reunião importada do calendário sem vínculo com professor ainda';
COMMENT ON COLUMN reunioes.meet_link    IS 'URL de entrada na reunião (Google Meet / Google Calendar)';
