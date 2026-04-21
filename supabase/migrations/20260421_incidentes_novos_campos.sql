-- Migration: novos campos em incidentes
-- Execute no Supabase SQL Editor: https://supabase.com/dashboard/project/dajbzpeduxmsxyukmjfm/sql
-- Data: 2026-04-21

-- 1. Tipo enum para urgência
DO $$ BEGIN
  CREATE TYPE urgencia_nivel AS ENUM ('baixa', 'media', 'alta');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Adicionar colunas
ALTER TABLE incidentes
  ADD COLUMN IF NOT EXISTS urgencia         urgencia_nivel  NOT NULL DEFAULT 'baixa',
  ADD COLUMN IF NOT EXISTS solucao          TEXT,
  ADD COLUMN IF NOT EXISTS responsavel      TEXT,
  ADD COLUMN IF NOT EXISTS precisa_acompanhamento BOOLEAN NOT NULL DEFAULT false;

-- 3. Índice para filtrar pendentes + urgência com frequência
CREATE INDEX IF NOT EXISTS idx_incidentes_urgencia_status
  ON incidentes (urgencia, status);

-- 4. Index para acompanhamento pendente
CREATE INDEX IF NOT EXISTS idx_incidentes_acompanhamento
  ON incidentes (precisa_acompanhamento)
  WHERE precisa_acompanhamento = true;

-- Verificação
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'incidentes'
  AND column_name IN ('urgencia','solucao','responsavel','precisa_acompanhamento')
ORDER BY column_name;
