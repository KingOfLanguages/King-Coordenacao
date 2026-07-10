-- ─────────────────────────────────────────────────────────────────────────────
-- Dashboard Geral — Fase 5: reuniões por coordenação + movimento de professores
--
-- Mesmo padrão das RPCs de 20260705: uma consulta por função, linhas planas,
-- agregação fina (totais, buckets por semana/mês/tri/ano, filtro por data) feita
-- no cliente. Sem SECURITY DEFINER — a RLS de professores/reunioes já é
-- USING(true) pra autenticados, e a rota /dashboard/geral é admin+líder.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Reuniões realizadas por coordenação (grupo) e mês ─────────────────────
-- Conta participações realizadas (reuniao_professores.status='realizada'),
-- atribuídas à coordenação via o grupo do professor. Uma reunião de grupo com
-- N professores conta como N acompanhamentos — que é o que a coordenação mede.
-- O cliente soma por grupo dentro do intervalo de datas pra "total por coordenação".

CREATE OR REPLACE FUNCTION dashboard_geral_reunioes_por_periodo()
RETURNS TABLE (
  grupo_id   UUID,
  ano_mes    INTEGER,
  realizadas BIGINT
) AS $$
  SELECT
    p.grupo_id,
    (EXTRACT(YEAR FROM r.data) * 100 + EXTRACT(MONTH FROM r.data))::int AS ano_mes,
    COUNT(*)::bigint
  FROM reuniao_professores rp
  JOIN reunioes    r ON r.id = rp.reuniao_id
  JOIN professores p ON p.id = rp.professor_id
  WHERE rp.status = 'realizada'
  GROUP BY p.grupo_id, ano_mes
  ORDER BY ano_mes;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION dashboard_geral_reunioes_por_periodo() IS
  'Reuniões (participações) realizadas por grupo de coordenação e mês (ano_mes = AAAAMM). Base do painel de reuniões do Dashboard Geral.';

-- ── 2. Movimento de professores: entradas e saídas datadas ───────────────────
-- Um evento por linha (entrada = data_inicio, saída = desligado_em), com o grupo
-- pra permitir recorte por coordenação. O cliente agrupa por semana/mês/tri/ano.
-- Volume pequeno (~1 linha por professor com data), então retornar cru é ok.

CREATE OR REPLACE FUNCTION dashboard_geral_movimento_professores()
RETURNS TABLE (
  tipo     TEXT,
  data     DATE,
  grupo_id UUID
) AS $$
  SELECT 'entrada'::text, p.data_inicio::date, p.grupo_id
  FROM professores p
  WHERE p.data_inicio IS NOT NULL

  UNION ALL

  SELECT 'saida'::text, p.desligado_em::date, p.grupo_id
  FROM professores p
  WHERE p.desligado_em IS NOT NULL;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION dashboard_geral_movimento_professores() IS
  'Eventos de entrada (data_inicio) e saída (desligado_em) de professores, com grupo. Base do painel de movimento; o cliente agrupa por período.';

GRANT EXECUTE ON FUNCTION dashboard_geral_reunioes_por_periodo()   TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_geral_movimento_professores()  TO authenticated;
