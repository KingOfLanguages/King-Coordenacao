-- ─────────────────────────────────────────────────────────────────────────────
-- Conta de teste fora do score (pedido do João, 27/10/2026)
--
-- O King devolve no feed contas que não são professores de verdade (as do
-- Denielton, "Igor Completo Teste", "Teste Onboarding"...). Elas entravam nas
-- contas de score como qualquer professor ativo: o "Igor Completo Teste"
-- cravado em 200 puxava a média para baixo e caía na faixa Bloqueado, e as
-- contas zeradas em 1000 inflavam a faixa Regular.
--
-- A marca fica no cadastro (`professores.conta_teste`) e é ligada/desligada na
-- ficha do professor, como o King's Circle: a policy de UPDATE de
-- `professores` já é a certa (coordenação, suporte, admin — 20260754) e o
-- sync do King não conhece a coluna, então nunca mexe nela.
--
-- Quem tem a marca sai das contas de score:
--   · Dashboard Geral (dashboard_geral_professores + dashboard_geral_score_trend):
--     score médio, faixas, % acima de 1200, evolução mensal, alertas.
--   · Ranking do Comercial (ranking_professores_entradas).
-- A conta continua existindo e aparecendo na lista de Professores e na ficha.
--
-- A carga inicial (as contas de teste de hoje) foi rodada à parte, fora do repo.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE professores
  ADD COLUMN IF NOT EXISTS conta_teste boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN professores.conta_teste IS
  'Conta de teste, não é professor de verdade: fica fora das contas de score (Dashboard Geral e ranking). Ligada na ficha ou pelo nome no cadastro.';

-- Conta nova com "teste" no nome já nasce marcada. Só no INSERT: se alguém
-- desmarcar na ficha, o sync de hora em hora não remarca — o upsert do King
-- não manda `conta_teste`, então o ON CONFLICT DO UPDATE não toca nela.
CREATE OR REPLACE FUNCTION marcar_conta_teste_pelo_nome() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.nome ~* '\mteste\M' THEN
    NEW.conta_teste := true;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION marcar_conta_teste_pelo_nome() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_marcar_conta_teste ON professores;
CREATE TRIGGER trg_marcar_conta_teste
  BEFORE INSERT ON professores
  FOR EACH ROW EXECUTE FUNCTION marcar_conta_teste_pelo_nome();


-- ── Dashboard Geral: linha por professor ativo, sem conta de teste ───────────

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
  WHERE p.status = 'ativo'
    AND NOT p.conta_teste;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION dashboard_geral_professores() IS
  'Uma linha por professor ativo (sem conta de teste) com score, alertas agregados e datas de reunião — base do Dashboard Geral.';


-- ── Dashboard Geral: evolução mensal do score, sem conta de teste ────────────

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
    AND NOT p.conta_teste
  GROUP BY p.grupo_id, h.ano_mes

  UNION ALL

  SELECT NULL::uuid, h.ano_mes, AVG(h.score)
  FROM professor_score_historico h
  JOIN professores p ON p.id = h.professor_id
  WHERE p.status = 'ativo'
    AND NOT p.conta_teste
  GROUP BY h.ano_mes

  ORDER BY ano_mes;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION dashboard_geral_score_trend() IS
  'Score médio mensal por grupo (grupo_id preenchido) e da escola inteira (grupo_id NULL), sem conta de teste — evolução ao longo do tempo.';


-- ── Ranking do Comercial: sem conta de teste ─────────────────────────────────
-- Mesmo corpo de produção (20260772 + status_aluno), só o filtro novo no fim.

CREATE OR REPLACE FUNCTION ranking_professores_entradas(p_desde TIMESTAMPTZ)
RETURNS TABLE (
  professor_id        UUID,
  nome                TEXT,
  grupo_id            UUID,
  grupo_nome          TEXT,
  score               INTEGER,
  incidentes          INTEGER,
  incidentes_abertos  INTEGER,
  feedbacks_positivos INTEGER,
  feedbacks_negativos INTEGER,
  alunos              INTEGER,
  data_inicio         DATE
)
LANGUAGE sql
STABLE
AS $$
  WITH inc AS (
    SELECT
      ni.professor_id                                        AS pid,
      (count(*))::int                                        AS total,
      (count(*) FILTER (WHERE NOT ni.resolved))::int          AS abertos
    FROM nexus_incidents ni
    WHERE ni.created_at >= p_desde
      AND ni.professor_id IS NOT NULL
      AND ni.problem_type NOT IN ('Bugs', 'Melhorias', 'Plataforma', 'Mês de análise')
    GROUP BY ni.professor_id
  ),
  fb AS (
    SELECT
      o.professor_id                                                  AS pid,
      (count(*) FILTER (WHERE o.tipo = 'feedback_positivo'))::int      AS pos,
      (count(*) FILTER (WHERE o.tipo = 'feedback_negativo'))::int      AS neg
    FROM observacoes o
    WHERE o.created_at >= p_desde
      AND o.professor_id IS NOT NULL
      AND o.tipo IN ('feedback_positivo', 'feedback_negativo')
    GROUP BY o.professor_id
  ),
  al AS (
    -- Carteira de hoje. O roster é reescrito a cada sync (DELETE+INSERT), então
    -- isto é sempre a foto atual — 'pausado'/'saiu' não somam carteira ativa.
    SELECT pak.professor_id AS pid, (count(*))::int AS total
    FROM professor_alunos_kms pak
    WHERE pak.status_aluno = 'ativo'
    GROUP BY pak.professor_id
  )
  SELECT
    p.id,
    p.nome,
    p.grupo_id,
    g.nome,
    pa.score_atual,
    COALESCE(inc.total, 0),
    COALESCE(inc.abertos, 0),
    COALESCE(fb.pos, 0),
    COALESCE(fb.neg, 0),
    COALESCE(al.total, 0),
    p.data_inicio
  FROM professores p
  LEFT JOIN grupos g                    ON g.id = p.grupo_id
  LEFT JOIN professor_acompanhamento pa ON pa.professor_id = p.id
  LEFT JOIN inc                         ON inc.pid = p.id
  LEFT JOIN fb                          ON fb.pid  = p.id
  LEFT JOIN al                          ON al.pid  = p.id
  WHERE p.status = 'ativo'
    AND NOT p.conta_teste
  ORDER BY p.nome;
$$;

COMMENT ON FUNCTION ranking_professores_entradas(TIMESTAMPTZ) IS
  'Números crus por professor ativo (sem conta de teste) pro ranking do Comercial (/confiabilidade). NÃO pontua: a régua é src/lib/rankingProfessores.ts, compartilhada com a extensão. SECURITY INVOKER de propósito — DEFINER vazaria contagem das categorias coordenação-only (20260723) por agregação.';
