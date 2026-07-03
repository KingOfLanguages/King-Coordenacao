-- ─────────────────────────────────────────────────────────────────────────────
-- Mês de Análise — índice de apoio para a página dedicada e as sugestões
-- automáticas (KTM passa a escrever incidentes 'Mês de análise' de volta no
-- Nexus via Edge Function nexus-mes-analise; aqui só facilita a leitura do
-- mirror local nexus_incidents, sem mudança de RLS — escrita continua restrita
-- à service role, igual o resto da tabela).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_nexus_incidents_mes_analise
  ON nexus_incidents (professor_id, resolved)
  WHERE problem_type = 'Mês de análise';
