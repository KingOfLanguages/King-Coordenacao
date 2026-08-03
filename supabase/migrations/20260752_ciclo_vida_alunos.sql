-- ─────────────────────────────────────────────────────────────────────────────
-- Ciclo de vida do aluno — base de retenção/turnover (guia da King 2026-07-31),
-- Fase 2. Resolve o pedido do Lucas: retenção + turnover de aluno por grupo.
--
-- A API passou a expor `ciclo_vida_alunos` (lista de SAÍDAS de aluno por
-- professor, na janela since/until). Diferente do roster (professor_alunos_kms),
-- que é DELETE+INSERT a cada rodada e não guarda histórico, esta tabela é
-- APPEND idempotente por (professor_id, aluno_id, data_saida) — NUNCA é apagada
-- pelo sync. Assim o histórico de saídas se acumula rodada a rodada.
--
-- Campo central: `saiu_da_escola`.
--   true  → churn da escola (aluno saiu de vez)
--   false → turnover do professor (trocou de professor, segue matriculado)
-- Sem ele, troca de professor seria contada como perda e inflaria o churn.
--
-- Só entram vínculos INDIVIDUAIS (a API não manda turma aqui).
-- `motivo_saida` vem 'nao_informado' na maioria das saídas automáticas — é
-- categoria legítima, não dado faltante. `data_saida` sempre vem preenchida.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS professor_ciclo_vida_alunos (
  professor_id          UUID    NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  aluno_id              BIGINT  NOT NULL,
  data_saida            DATE    NOT NULL,       -- parte da PK; sync ignora saída sem data
  primeiro_nome         TEXT,
  motivo_saida          TEXT,
  saiu_da_escola        BOOLEAN,
  data_matricula_escola DATE,                   -- fechamento do contrato com a escola
  data_inicio_aulas     DATE,                   -- primeira aula do aluno
  registrado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (professor_id, aluno_id, data_saida)
);

COMMENT ON TABLE professor_ciclo_vida_alunos IS
  'Saídas de aluno por professor (ciclo de vida). Append idempotente — base histórica de retenção/turnover. NUNCA apagada pelo sync.';
COMMENT ON COLUMN professor_ciclo_vida_alunos.saiu_da_escola IS
  'true = churn da escola; false = turnover do professor (trocou de prof, segue matriculado).';
COMMENT ON COLUMN professor_ciclo_vida_alunos.motivo_saida IS
  'Ex.: transferencia_outro_professor, desligamento_da_escola, motivo_financeiro… nao_informado é categoria válida (maioria das saídas automáticas).';

CREATE INDEX IF NOT EXISTS idx_ciclo_vida_professor  ON professor_ciclo_vida_alunos(professor_id);
CREATE INDEX IF NOT EXISTS idx_ciclo_vida_data_saida ON professor_ciclo_vida_alunos(data_saida);

-- RLS: mesmo padrão de professor_alunos_kms (SELECT p/ autenticado; escrita
-- fica a cargo da Edge Function via service role, que ignora RLS).
ALTER TABLE professor_ciclo_vida_alunos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ciclo_vida_select_all" ON professor_ciclo_vida_alunos;
CREATE POLICY "ciclo_vida_select_all" ON professor_ciclo_vida_alunos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ciclo_vida_write_coord" ON professor_ciclo_vida_alunos;
CREATE POLICY "ciclo_vida_write_coord" ON professor_ciclo_vida_alunos
  FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));

-- ── Agregações de retenção/turnover (server-side, pra não esbarrar no teto de ──
--    1000 linhas do PostgREST ao somar saídas de todos os professores) ─────────
--
-- churn    = saiu_da_escola IS TRUE  (aluno saiu da escola)
-- turnover = saiu_da_escola IS FALSE (trocou de professor, segue matriculado)
-- total    = todas as saídas (total − churn − turnover = saídas sem flag definido)
-- O grupo é o ATUAL do professor (não o do momento da saída) — alinhar com o Lucas
-- se a atribuição histórica importar.

CREATE OR REPLACE FUNCTION retencao_por_grupo(p_desde DATE, p_ate DATE)
RETURNS TABLE (grupo_id UUID, grupo_nome TEXT, total_saidas BIGINT, churn BIGINT, turnover BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT
    p.grupo_id,
    COALESCE(g.nome, 'Sem grupo')                     AS grupo_nome,
    COUNT(*)                                          AS total_saidas,
    COUNT(*) FILTER (WHERE c.saiu_da_escola IS TRUE)  AS churn,
    COUNT(*) FILTER (WHERE c.saiu_da_escola IS FALSE) AS turnover
  FROM professor_ciclo_vida_alunos c
  JOIN professores p ON p.id = c.professor_id
  LEFT JOIN grupos g ON g.id = p.grupo_id
  WHERE c.data_saida BETWEEN p_desde AND p_ate
  GROUP BY p.grupo_id, g.nome
  ORDER BY total_saidas DESC;
$$;

CREATE OR REPLACE FUNCTION retencao_por_motivo(p_desde DATE, p_ate DATE)
RETURNS TABLE (motivo TEXT, total BIGINT, churn BIGINT, turnover BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(NULLIF(c.motivo_saida, ''), 'nao_informado') AS motivo,
    COUNT(*)                                              AS total,
    COUNT(*) FILTER (WHERE c.saiu_da_escola IS TRUE)      AS churn,
    COUNT(*) FILTER (WHERE c.saiu_da_escola IS FALSE)     AS turnover
  FROM professor_ciclo_vida_alunos c
  WHERE c.data_saida BETWEEN p_desde AND p_ate
  GROUP BY 1
  ORDER BY total DESC;
$$;

GRANT EXECUTE ON FUNCTION retencao_por_grupo(DATE, DATE)  TO authenticated;
GRANT EXECUTE ON FUNCTION retencao_por_motivo(DATE, DATE) TO authenticated;
