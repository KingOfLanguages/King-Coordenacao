-- ─────────────────────────────────────────────────────────────────────────────
-- Dashboard Geral — RPCs de agregação
--
-- Uma consulta por RPC, devolvendo linhas planas (sem JSONB bruto) para os
-- ~850 professores ativos. Buckets de score, mediana, ranking, filtros e
-- alertas são computados no cliente (useMemo) a partir desse fetch único e
-- cacheado — mesmo padrão já usado em useDashboardCoord. Os joins com
-- reunioes/reuniao_professores (que exigiriam N+1 se feitos no cliente)
-- ficam aqui.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Linha por professor ativo ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION dashboard_geral_professores()
RETURNS TABLE (
  professor_id              UUID,
  nome                      TEXT,
  grupo_id                  UUID,
  grupo_nome                TEXT,
  coordenador_nome          TEXT,
  score_atual               INTEGER,
  score_faixa               TEXT,
  score_hist_recente        INTEGER,
  score_hist_anterior       INTEGER,
  alertas_qtd               INTEGER,
  ultima_reuniao_realizada  DATE,
  proxima_reuniao_pendente  DATE
) AS $$
  SELECT
    p.id,
    p.nome,
    p.grupo_id,
    g.nome,
    coord.nome,
    pa.score_atual,
    pa.score_faixa,
    hs.scores[1],
    hs.scores[2],
    (COALESCE(pa.aulas_pendentes_qtd, 0)
      + COALESCE((pa.faltas_professor->>'quantidade')::int, 0)
      + COALESCE((pa.no_show_primeira_aula->>'quantidade')::int, 0)
      + COALESCE((pa.agendas_bloqueadas->>'quantidade_horarios')::int, 0)
      + COALESCE(jsonb_array_length(pa.trocas_professor), 0))::int,
    ult.ultima::date,
    prox.proxima::date
  FROM professores p
  LEFT JOIN grupos   g     ON g.id = p.grupo_id
  LEFT JOIN profiles coord ON coord.id = p.coordenador_id
  LEFT JOIN professor_acompanhamento pa ON pa.professor_id = p.id
  LEFT JOIN LATERAL (
    SELECT array_agg(score ORDER BY ano_mes DESC) AS scores
    FROM professor_score_historico h
    WHERE h.professor_id = p.id
  ) hs ON true
  LEFT JOIN LATERAL (
    SELECT MAX(r.data) AS ultima
    FROM reuniao_professores rp
    JOIN reunioes r ON r.id = rp.reuniao_id
    WHERE rp.professor_id = p.id AND rp.status = 'realizada'
  ) ult ON true
  LEFT JOIN LATERAL (
    SELECT MIN(r.data) AS proxima
    FROM reuniao_professores rp
    JOIN reunioes r ON r.id = rp.reuniao_id
    WHERE rp.professor_id = p.id AND rp.status = 'pendente' AND r.data >= now()
  ) prox ON true
  WHERE p.status = 'ativo';
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION dashboard_geral_professores() IS
  'Uma linha por professor ativo com score, alertas agregados e datas de reunião (dados sincronizados da agenda) — base do Dashboard Geral.';

-- ── 2. Evolução mensal do score — escola inteira + por grupo ─────────────────

CREATE OR REPLACE FUNCTION dashboard_geral_score_trend()
RETURNS TABLE (
  grupo_id    UUID,
  ano_mes     INTEGER,
  score_medio NUMERIC
) AS $$
  SELECT p.grupo_id, h.ano_mes, AVG(h.score)
  FROM professor_score_historico h
  JOIN professores p ON p.id = h.professor_id
  WHERE p.status = 'ativo'
  GROUP BY p.grupo_id, h.ano_mes

  UNION ALL

  SELECT NULL::uuid, h.ano_mes, AVG(h.score)
  FROM professor_score_historico h
  JOIN professores p ON p.id = h.professor_id
  WHERE p.status = 'ativo'
  GROUP BY h.ano_mes

  ORDER BY ano_mes;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION dashboard_geral_score_trend() IS
  'Score médio mensal por grupo (grupo_id preenchido) e da escola inteira (grupo_id NULL) — evolução ao longo do tempo.';

GRANT EXECUTE ON FUNCTION dashboard_geral_professores()  TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_geral_score_trend()  TO authenticated;

-- ── 3. Índices de apoio (JOINs por professor_id + filtro por status/data) ────

CREATE INDEX IF NOT EXISTS idx_reunioes_data ON reunioes(data);
