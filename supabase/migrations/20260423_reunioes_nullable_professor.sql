-- Permite reuniões sem professor vinculado (agenda pessoal do coordenador)
ALTER TABLE reunioes ALTER COLUMN professor_id DROP NOT NULL;

-- Armazena o link de entrada da reunião (Google Meet ou htmlLink do Calendar)
ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS meet_link TEXT;

COMMENT ON COLUMN reunioes.professor_id IS 'NULL = reunião importada do calendário sem vínculo com professor ainda';
COMMENT ON COLUMN reunioes.meet_link    IS 'URL de entrada na reunião (Google Meet / Google Calendar)';
