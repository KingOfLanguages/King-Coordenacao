-- ─────────────────────────────────────────────────────────────────────────────
-- Turnover de PROFESSOR — espelho da página de turnover da plataforma do King.
--
-- Contexto: a /retencao media saídas de ALUNO e chamava isso de "turnover",
-- enquanto a King chama de turnover o movimento de entrada/saída de PROFESSOR.
-- Mesma palavra, universos diferentes — os números nunca iam bater. Esta
-- migration cria o lado professor; o lado aluno (professor_ciclo_vida_alunos,
-- migration 20260752) continua intacto e vira uma aba separada na página.
--
-- Fonte: bloco `turnover` de /api/v1/acompanhamento-professores, que já chegava
-- no sync e era jogado num snapshot sobrescrito a cada rodada
-- (professor_acompanhamento.turnover_saida). Aqui ele vira tabela própria.
--
-- A API devolve o histórico COMPLETO: 1044 desligados, todos com data de saída
-- real (2023-08 → hoje). Uma rodada de sync backfilla tudo — não é preciso
-- esperar acumular.
--
-- ── Metodologia (validada contra a página da King em 01–31/08/2026) ──────────
--   ativos(D)      = status <> 'pausa'
--                    AND (data_entrada IS NULL OR data_entrada <= D)
--                    AND (data_saida   IS NULL OR data_saida   >  D)
--   entradas(P)    = data_entrada dentro do período
--   saidas(P)      = data_saida   dentro do período
--   turnover %     = saidas / média(ativos(desde-1), ativos(ate))
--
-- Três detalhes que só se descobrem batendo com o número deles:
--   1. PAUSADOS NÃO CONTAM como ativos. Sem isso dava 882/901 no lugar de
--      878/897 — offset constante de 4, que é exatamente o nº de pausados.
--   2. data_entrada inválida conta como "já estava lá" (não exclui o professor
--      da base de ativos). 66 professores têm data suja na origem.
--   3. Com (1) e (2), a identidade ativos_ini + entradas - saidas = ativos_fim
--      fecha — o que não acontece em nenhuma outra variante.
--
-- Limitação conhecida: `status` é o de HOJE. Para períodos passados, os 4
-- pausados atuais são excluídos retroativamente. Distorção de ~0,5% e é o mesmo
-- comportamento da King, que também calcula a partir do estado vivo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS professor_turnover (
  professor_id      UUID PRIMARY KEY REFERENCES professores(id) ON DELETE CASCADE,
  data_entrada      DATE,          -- turnover.data_entrada (saneada no sync)
  data_saida        DATE,          -- turnover.saida.data   (saneada no sync)
  motivo_saida      TEXT,          -- texto CRU da King, inclusive "Outro: …"
  alunos_realocados INTEGER,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE professor_turnover IS
  'Espelho do bloco `turnover` da API do King (entrada/saída do professor). Base da aba Professor da página /retencao. Upsert por professor_id — nunca apagada pelo sync.';
COMMENT ON COLUMN professor_turnover.data_entrada IS
  'Data de entrada do professor. NULL quando a origem manda data inválida (0001-01-01, 1979, 2060…) — conta como "já estava lá" no cálculo de ativos.';
COMMENT ON COLUMN professor_turnover.motivo_saida IS
  'Texto cru da King. "Nao informado" (sem til) é a categoria default. Motivos livres chegam com prefixo "Outro: ".';

CREATE INDEX IF NOT EXISTS idx_prof_turnover_entrada ON professor_turnover (data_entrada);
CREATE INDEX IF NOT EXISTS idx_prof_turnover_saida   ON professor_turnover (data_saida);

ALTER TABLE professor_turnover ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prof_turnover_select_all" ON professor_turnover;
CREATE POLICY "prof_turnover_select_all" ON professor_turnover
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "prof_turnover_write_coord" ON professor_turnover;
CREATE POLICY "prof_turnover_write_coord" ON professor_turnover
  FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));

-- ── Ativos numa data ─────────────────────────────────────────────────────────
-- Bloco único de verdade sobre "quem estava ativo em D". Todo o resto deriva
-- daqui, então a regra de pausado/data-suja vive num lugar só.

CREATE OR REPLACE FUNCTION turnover_professores_ativos(p_data DATE)
RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::bigint
  FROM professores p
  LEFT JOIN professor_turnover t ON t.professor_id = p.id
  WHERE p.status <> 'pausa'
    AND (t.data_entrada IS NULL OR t.data_entrada <= p_data)
    AND (t.data_saida   IS NULL OR t.data_saida   >  p_data);
$$;

COMMENT ON FUNCTION turnover_professores_ativos(DATE) IS
  'Professores ativos na data (exclui pausados; data_entrada NULL conta como já presente). Base de ativos_inicio/ativos_fim.';

-- ── Resumo do período (os 5 números do topo da página da King) ───────────────

CREATE OR REPLACE FUNCTION turnover_professores_resumo(p_desde DATE, p_ate DATE)
RETURNS TABLE (
  entradas      BIGINT,
  saidas        BIGINT,
  ativos_inicio BIGINT,
  ativos_fim    BIGINT,
  turnover_pct  NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT
      (SELECT COUNT(*) FROM professor_turnover
        WHERE data_entrada BETWEEN p_desde AND p_ate)::bigint AS entradas,
      (SELECT COUNT(*) FROM professor_turnover
        WHERE data_saida   BETWEEN p_desde AND p_ate)::bigint AS saidas,
      turnover_professores_ativos(p_desde - 1) AS ativos_inicio,
      turnover_professores_ativos(p_ate)       AS ativos_fim
  )
  SELECT
    entradas, saidas, ativos_inicio, ativos_fim,
    CASE WHEN (ativos_inicio + ativos_fim) > 0
      THEN ROUND(saidas * 100.0 / ((ativos_inicio + ativos_fim) / 2.0), 2)
      ELSE 0
    END
  FROM base;
$$;

-- ── Motivo de saída ──────────────────────────────────────────────────────────
-- Texto cru; a UI agrupa os "Outro: …" visualmente, mas o dado fica fiel.

CREATE OR REPLACE FUNCTION turnover_professores_motivos(p_desde DATE, p_ate DATE)
RETURNS TABLE (motivo TEXT, total BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(NULLIF(TRIM(motivo_saida), ''), 'Nao informado') AS motivo,
    COUNT(*)::bigint
  FROM professor_turnover
  WHERE data_saida BETWEEN p_desde AND p_ate
  GROUP BY 1
  ORDER BY 2 DESC, 1;
$$;

-- ── Tempo de permanência das saídas do período ───────────────────────────────
-- Buckets iguais aos da King: 0-3 / 4-6 / 7-12 / +12 meses. Saída sem data de
-- entrada válida vira bucket próprio em vez de ser empurrada pro 0-3.

CREATE OR REPLACE FUNCTION turnover_professores_permanencia(p_desde DATE, p_ate DATE)
RETURNS TABLE (faixa TEXT, ordem INTEGER, total BIGINT)
LANGUAGE sql STABLE AS $$
  WITH saidas AS (
    SELECT CASE
      WHEN data_entrada IS NULL THEN NULL
      ELSE (EXTRACT(YEAR  FROM AGE(data_saida, data_entrada)) * 12
          + EXTRACT(MONTH FROM AGE(data_saida, data_entrada)))::int
    END AS meses
    FROM professor_turnover
    WHERE data_saida BETWEEN p_desde AND p_ate
  ), rotulado AS (
    SELECT CASE
      WHEN meses IS NULL  THEN 'Sem data de entrada'
      WHEN meses <= 3     THEN '0-3 meses'
      WHEN meses <= 6     THEN '4-6 meses'
      WHEN meses <= 12    THEN '7-12 meses'
      ELSE                     '+12 meses'
    END AS faixa
    FROM saidas
  )
  SELECT
    faixa,
    CASE faixa
      WHEN '0-3 meses'  THEN 1 WHEN '4-6 meses' THEN 2
      WHEN '7-12 meses' THEN 3 WHEN '+12 meses' THEN 4 ELSE 5
    END AS ordem,
    COUNT(*)::bigint
  FROM rotulado
  GROUP BY faixa
  ORDER BY 2;
$$;

-- ── Tabela mensal ────────────────────────────────────────────────────────────
-- Uma linha por mês tocado pelo intervalo, com o turnover calculado sobre a
-- média de ativos DAQUELE mês (não do intervalo inteiro).

CREATE OR REPLACE FUNCTION turnover_professores_mensal(p_desde DATE, p_ate DATE)
RETURNS TABLE (
  ano_mes       INTEGER,
  entradas      BIGINT,
  saidas        BIGINT,
  ativos_inicio BIGINT,
  ativos_fim    BIGINT,
  turnover_pct  NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH meses AS (
    SELECT
      GREATEST(m::date, p_desde)                                  AS ini,
      LEAST((m + INTERVAL '1 month - 1 day')::date, p_ate)        AS fim
    FROM generate_series(
      DATE_TRUNC('month', p_desde)::date,
      DATE_TRUNC('month', p_ate)::date,
      INTERVAL '1 month'
    ) AS m
  )
  SELECT
    (EXTRACT(YEAR FROM ini) * 100 + EXTRACT(MONTH FROM ini))::int,
    r.entradas, r.saidas, r.ativos_inicio, r.ativos_fim, r.turnover_pct
  FROM meses
  CROSS JOIN LATERAL turnover_professores_resumo(ini, fim) r
  ORDER BY 1;
$$;

-- ── Recorte por coordenação ──────────────────────────────────────────────────
-- O que a página da King não tem e é a razão de existir a nossa: quebrar o
-- movimento por grupo. Ativos no fim usa a mesma regra do resumo.

CREATE OR REPLACE FUNCTION turnover_professores_por_grupo(p_desde DATE, p_ate DATE)
RETURNS TABLE (
  grupo_id      UUID,
  grupo_nome    TEXT,
  entradas      BIGINT,
  saidas        BIGINT,
  ativos_inicio BIGINT,
  ativos_fim    BIGINT,
  turnover_pct  NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH g AS (
    SELECT
      p.grupo_id,
      COALESCE(gr.nome, 'Sem grupo') AS grupo_nome,
      COUNT(*) FILTER (WHERE t.data_entrada BETWEEN p_desde AND p_ate)::bigint AS entradas,
      COUNT(*) FILTER (WHERE t.data_saida   BETWEEN p_desde AND p_ate)::bigint AS saidas,
      COUNT(*) FILTER (
        WHERE p.status <> 'pausa'
          AND (t.data_entrada IS NULL OR t.data_entrada <= p_desde - 1)
          AND (t.data_saida   IS NULL OR t.data_saida   >  p_desde - 1)
      )::bigint AS ativos_inicio,
      COUNT(*) FILTER (
        WHERE p.status <> 'pausa'
          AND (t.data_entrada IS NULL OR t.data_entrada <= p_ate)
          AND (t.data_saida   IS NULL OR t.data_saida   >  p_ate)
      )::bigint AS ativos_fim
    FROM professores p
    LEFT JOIN professor_turnover t ON t.professor_id = p.id
    LEFT JOIN grupos gr ON gr.id = p.grupo_id
    GROUP BY p.grupo_id, gr.nome
  )
  SELECT
    grupo_id, grupo_nome, entradas, saidas, ativos_inicio, ativos_fim,
    CASE WHEN (ativos_inicio + ativos_fim) > 0
      THEN ROUND(saidas * 100.0 / ((ativos_inicio + ativos_fim) / 2.0), 2)
      ELSE 0
    END
  FROM g
  WHERE entradas > 0 OR saidas > 0 OR ativos_fim > 0
  ORDER BY saidas DESC, grupo_nome;
$$;

GRANT EXECUTE ON FUNCTION turnover_professores_ativos(DATE)            TO authenticated;
GRANT EXECUTE ON FUNCTION turnover_professores_resumo(DATE, DATE)      TO authenticated;
GRANT EXECUTE ON FUNCTION turnover_professores_motivos(DATE, DATE)     TO authenticated;
GRANT EXECUTE ON FUNCTION turnover_professores_permanencia(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION turnover_professores_mensal(DATE, DATE)      TO authenticated;
GRANT EXECUTE ON FUNCTION turnover_professores_por_grupo(DATE, DATE)   TO authenticated;
