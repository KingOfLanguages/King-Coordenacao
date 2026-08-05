-- ─────────────────────────────────────────────────────────────────────────────
-- Dashboard Geral — reuniões realizadas por dia (granularidade fina)
--
-- A meta de reuniões vira multi-período (semana / mês / trimestre / ano). O RPC
-- mensal (dashboard_geral_reunioes_por_periodo, ano_mes = AAAAMM) não dá conta da
-- visão SEMANAL — por isso este devolve por DIA (grupo_id, data, realizadas), e o
-- cliente agrupa pra qualquer período com bucketPeriodo(). Volume pequeno:
-- ~1 linha por (grupo × dia com reunião), então retornar assim é barato.
--
-- Mesma contagem do RPC mensal: participações realizadas
-- (reuniao_professores.status='realizada'), atribuídas à coordenação pelo grupo
-- do professor. Reunião de grupo com N professores conta como N acompanhamentos.
-- Sem SECURITY DEFINER — RLS de reunioes/professores já é USING(true) pra
-- autenticados e a rota /dashboard/geral é admin+líder.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION dashboard_geral_reunioes_datadas()
RETURNS TABLE (
  grupo_id   UUID,
  data       DATE,
  realizadas BIGINT
) AS $$
  SELECT
    p.grupo_id,
    r.data::date AS data,
    COUNT(*)::bigint
  FROM reuniao_professores rp
  JOIN reunioes    r ON r.id = rp.reuniao_id
  JOIN professores p ON p.id = rp.professor_id
  WHERE rp.status = 'realizada'
  GROUP BY p.grupo_id, r.data::date
  ORDER BY data;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION dashboard_geral_reunioes_datadas() IS
  'Reuniões (participações) realizadas por grupo de coordenação e DIA. Base da meta multi-período (semana/mês/trimestre/ano) do Dashboard Geral; o cliente agrupa por período.';

GRANT EXECUTE ON FUNCTION dashboard_geral_reunioes_datadas() TO authenticated;
