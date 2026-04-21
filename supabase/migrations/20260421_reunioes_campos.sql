-- Novos campos para completar o fluxo de reunião no Painel do Coordenador

ALTER TABLE reunioes
  ADD COLUMN IF NOT EXISTS aconteceu             BOOLEAN,
  ADD COLUMN IF NOT EXISTS monitoramento_resultado TEXT,
  ADD COLUMN IF NOT EXISTS titulo                TEXT;

-- Índice para busca por coordenador + data (painel de hoje / atrasadas)
CREATE INDEX IF NOT EXISTS idx_reunioes_coordenador_data
  ON reunioes (coordenador_id, data);

COMMENT ON COLUMN reunioes.aconteceu              IS 'A reunião de fato ocorreu? null = não registrado';
COMMENT ON COLUMN reunioes.monitoramento_resultado IS 'Resultado do monitoramento após reunião: normal | alta_prioridade | baixa_prioridade';
COMMENT ON COLUMN reunioes.titulo                 IS 'Título do evento no Google Calendar, se importado';
