-- ─────────────────────────────────────────────────────────────────────────────
-- Turnover de ALUNO (mesma fórmula do de professor) + correção da fonte do
-- painel de movimento do Dashboard Geral.
--
-- Contexto: a 20260757 trouxe o turnover de professor espelhando a King. Agora
-- a mesma conta vale para aluno, e as duas aparecem no Dashboard Geral com
-- recorte por coordenação.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Movimento de professores: passa a usar as datas reais da King ─────────
--
-- A função original derivava a saída de `professores.desligado_em`, que é
-- carimbado pelo NOSSO trigger quando o sync percebe a virada de status — não é
-- a data real do desligamento, e vinha NULL em todo desligamento anterior a
-- 2026-07-10. Resultado: o painel de movimento contradizia a página de turnover.
-- Mesma assinatura (tipo, data, grupo_id), então o cliente não muda.

CREATE OR REPLACE FUNCTION dashboard_geral_movimento_professores()
RETURNS TABLE (
  tipo     TEXT,
  data     DATE,
  grupo_id UUID
) AS $$
  SELECT 'entrada'::text, t.data_entrada, p.grupo_id
  FROM professor_turnover t
  JOIN professores p ON p.id = t.professor_id
  WHERE t.data_entrada IS NOT NULL

  UNION ALL

  SELECT 'saida'::text, t.data_saida, p.grupo_id
  FROM professor_turnover t
  JOIN professores p ON p.id = t.professor_id
  WHERE t.data_saida IS NOT NULL;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION dashboard_geral_movimento_professores() IS
  'Eventos de entrada/saída de professor com as datas REAIS da King (professor_turnover). Antes usava professores.desligado_em, que era a data em que o nosso sync percebeu a mudança.';

-- ── 2. Base do ciclo de vida do aluno ────────────────────────────────────────
--
-- Achata, por aluno, o que está espalhado em duas tabelas de granularidade
-- "por professor":
--   professor_alunos_kms          → roster ATUAL (DELETE+INSERT a cada rodada)
--   professor_ciclo_vida_alunos   → saídas (append, histórico acumulado)
--
-- Universo = quem está no roster hoje ∪ quem saiu da escola. Aluno que só
-- trocou de professor não é saída: continua matriculado e aparece no roster.
--
-- Duas colunas de saída, de propósito:
--   data_saida          → real. Conta a saída no mês em que ela aconteceu.
--   data_saida_efetiva  → NULL para quem está no roster hoje. O roster é a
--                         verdade sobre quem está ativo AGORA, e 156 alunos
--                         saíram e voltaram; sem isso eles sumiriam da base de
--                         ativos. Efeito colateral aceito: durante a janela em
--                         que estiveram fora, esses alunos contam como ativos.
--
-- Limite de janela: a API devolve as saídas de aluno dos ÚLTIMOS 12 MESES. A
-- matrícula vai bem mais para trás (2023), mas ativos/turnover só são confiáveis
-- a partir de ~12 meses atrás — antes disso faltam as saídas, e a base de ativos
-- fica inflada. A tabela é append-only, então a janela boa cresce com o tempo.

CREATE OR REPLACE VIEW aluno_ciclo_escola AS
WITH matricula AS (
  -- Data de fechamento do contrato com a escola — o análogo do data_entrada do
  -- professor. Vem nas duas tabelas; a origem tem data suja ('0025-11-24').
  SELECT aluno_id, MIN(data_matricula_escola) AS data_matricula
  FROM (
    SELECT aluno_id, data_matricula_escola FROM professor_alunos_kms
    UNION ALL
    SELECT aluno_id, data_matricula_escola FROM professor_ciclo_vida_alunos
  ) x
  WHERE data_matricula_escola BETWEEN DATE '2015-01-01' AND DATE '2030-12-31'
  GROUP BY aluno_id
),
saida AS (
  SELECT aluno_id, MAX(data_saida) AS data_saida
  FROM professor_ciclo_vida_alunos
  WHERE saiu_da_escola IS TRUE
  GROUP BY aluno_id
),
roster AS (
  -- Vínculo atual. Um punhado de alunos aparece com mais de um professor —
  -- fica o mais recente.
  SELECT DISTINCT ON (a.aluno_id)
    a.aluno_id, a.status_aluno, p.grupo_id
  FROM professor_alunos_kms a
  JOIN professores p ON p.id = a.professor_id
  ORDER BY a.aluno_id, a.data_adicao DESC NULLS LAST
),
grupo_da_saida AS (
  -- Para quem já saiu: a coordenação do professor com quem estava por último.
  SELECT DISTINCT ON (c.aluno_id) c.aluno_id, p.grupo_id
  FROM professor_ciclo_vida_alunos c
  JOIN professores p ON p.id = c.professor_id
  ORDER BY c.aluno_id, c.data_saida DESC
),
universo AS (
  SELECT aluno_id FROM roster
  UNION
  SELECT aluno_id FROM saida
)
SELECT
  u.aluno_id,
  m.data_matricula,
  s.data_saida,
  CASE WHEN r.aluno_id IS NOT NULL THEN NULL ELSE s.data_saida END AS data_saida_efetiva,
  COALESCE(r.grupo_id, gs.grupo_id)   AS grupo_id,
  COALESCE(r.status_aluno, 'saiu')    AS status_aluno,
  (r.aluno_id IS NOT NULL)            AS no_roster,
  -- Quem entra na conta. `status_aluno` é o estado de HOJE, então NÃO pode ser
  -- usado para decidir se alguém estava ativo numa data passada: todo aluno que
  -- já saiu carrega status 'saiu', e filtrar por ele apagaria essas pessoas
  -- também do passado, achatando a base de ativos. Quem decide o passado é a
  -- data. Aqui ficam só os dois casos que a data não resolve:
  --   pausado                    → fora, igual ao professor pausado
  --   no roster e marcado 'saiu' → fora; saiu sem registro de saída (9 alunos)
  (COALESCE(r.status_aluno, 'saiu') <> 'pausado'
   AND NOT (r.aluno_id IS NOT NULL AND r.status_aluno = 'saiu')) AS elegivel
FROM universo u
LEFT JOIN matricula      m  ON m.aluno_id  = u.aluno_id
LEFT JOIN saida          s  ON s.aluno_id  = u.aluno_id
LEFT JOIN roster         r  ON r.aluno_id  = u.aluno_id
LEFT JOIN grupo_da_saida gs ON gs.aluno_id = u.aluno_id;

COMMENT ON VIEW aluno_ciclo_escola IS
  'Ciclo de vida do aluno achatado por aluno_id (matrícula, saída da escola, grupo). Base do turnover de aluno. Só confiável nos últimos ~12 meses — é a janela de saídas que a API devolve.';

-- ── 3. Ativos numa data ──────────────────────────────────────────────────────
-- Mesma regra do professor: pausado não conta, matrícula inválida conta como
-- "já estava lá", saída estritamente depois da data.

CREATE OR REPLACE FUNCTION turnover_alunos_ativos(p_data DATE)
RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::bigint
  FROM aluno_ciclo_escola a
  WHERE a.elegivel
    AND (a.data_matricula     IS NULL OR a.data_matricula     <= p_data)
    AND (a.data_saida_efetiva IS NULL OR a.data_saida_efetiva >  p_data);
$$;

-- ── 4. Resumo e recorte por coordenação ──────────────────────────────────────

CREATE OR REPLACE FUNCTION turnover_alunos_resumo(p_desde DATE, p_ate DATE)
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
      (SELECT COUNT(*) FROM aluno_ciclo_escola
        WHERE elegivel AND data_matricula BETWEEN p_desde AND p_ate)::bigint AS entradas,
      -- data_saida_EFETIVA: aluno que saiu e voltou dentro da janela não conta
      -- como saída líquida — senão a identidade
      -- ativos_ini + entradas - saidas = ativos_fim não fecha e a tela mente.
      (SELECT COUNT(*) FROM aluno_ciclo_escola
        WHERE elegivel AND data_saida_efetiva BETWEEN p_desde AND p_ate)::bigint AS saidas,
      turnover_alunos_ativos(p_desde - 1) AS ativos_inicio,
      turnover_alunos_ativos(p_ate)       AS ativos_fim
  )
  SELECT
    entradas, saidas, ativos_inicio, ativos_fim,
    CASE WHEN (ativos_inicio + ativos_fim) > 0
      THEN ROUND(saidas * 100.0 / ((ativos_inicio + ativos_fim) / 2.0), 2)
      ELSE 0
    END
  FROM base;
$$;

CREATE OR REPLACE FUNCTION turnover_alunos_por_grupo(p_desde DATE, p_ate DATE)
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
      a.grupo_id,
      COALESCE(gr.nome, 'Sem grupo') AS grupo_nome,
      COUNT(*) FILTER (WHERE a.elegivel AND a.data_matricula     BETWEEN p_desde AND p_ate)::bigint AS entradas,
      COUNT(*) FILTER (WHERE a.elegivel AND a.data_saida_efetiva BETWEEN p_desde AND p_ate)::bigint AS saidas,
      COUNT(*) FILTER (
        WHERE a.elegivel
          AND (a.data_matricula     IS NULL OR a.data_matricula     <= p_desde - 1)
          AND (a.data_saida_efetiva IS NULL OR a.data_saida_efetiva >  p_desde - 1)
      )::bigint AS ativos_inicio,
      COUNT(*) FILTER (
        WHERE a.elegivel
          AND (a.data_matricula     IS NULL OR a.data_matricula     <= p_ate)
          AND (a.data_saida_efetiva IS NULL OR a.data_saida_efetiva >  p_ate)
      )::bigint AS ativos_fim
    FROM aluno_ciclo_escola a
    LEFT JOIN grupos gr ON gr.id = a.grupo_id
    GROUP BY a.grupo_id, gr.nome
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

GRANT SELECT ON aluno_ciclo_escola TO authenticated;
GRANT EXECUTE ON FUNCTION turnover_alunos_ativos(DATE)          TO authenticated;
GRANT EXECUTE ON FUNCTION turnover_alunos_resumo(DATE, DATE)    TO authenticated;
GRANT EXECUTE ON FUNCTION turnover_alunos_por_grupo(DATE, DATE) TO authenticated;
