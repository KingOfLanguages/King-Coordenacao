-- ─────────────────────────────────────────────────────────────────────────────
-- Plano gratuito do Supabase: menos log e menos histórico (2026-10-07)
--
-- O painel mostrou Log Ingestion em 0,64 / 1 GB no ciclo. Cada chamada de Edge
-- Function e cada consulta que ela faz viram registro de log. A batida de tempo
-- do Welcome Path (a cada 30s, com 8 consultas por batida) passaria do limite
-- sozinha quando as turmas começassem. Duas mudanças:
--
--   1. a batida passa a ser UMA chamada ao banco (wp_registrar_tempo), sem
--      carregar a trilha — e o portal bate a cada 2 min em vez de 30s;
--   2. cron.job_run_details, que guarda cada execução das rotinas desde abril
--      (18 MB, ~6,5 MB/mês), passa a guardar só 30 dias.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Batida de tempo ───────────────────────────────────────────────────────
-- O teto de 120s por batida continua (uma aba esquecida não vira horas de
-- estudo). Prazo esgotado sem concluir: o tempo não conta, porque a trilha está
-- trancada. Só soma em etapa que o professor já abriu (a linha de progresso
-- nasce na ação `etapa`, que passa pelo gate da Edge Function).

CREATE OR REPLACE FUNCTION wp_registrar_tempo(
  p_professor_id UUID,
  p_etapa_id     UUID,
  p_segundos     INTEGER
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_j welcome_path_jornada;
BEGIN
  IF p_segundos IS NULL OR p_segundos <= 0 THEN RETURN; END IF;

  SELECT * INTO v_j FROM welcome_path_jornada WHERE professor_id = p_professor_id;
  IF FOUND AND v_j.concluida_em IS NULL AND v_j.prazo_em < NOW() THEN RETURN; END IF;

  UPDATE welcome_path_progresso
     SET tempo_segundos = tempo_segundos + LEAST(p_segundos, 120)
   WHERE professor_id = p_professor_id AND etapa_id = p_etapa_id;

  UPDATE welcome_path_jornada
     SET ultima_atividade_em = NOW()
   WHERE professor_id = p_professor_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION wp_registrar_tempo(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION wp_registrar_tempo(UUID, UUID, INTEGER) TO service_role;


-- ── 2. Histórico das rotinas: só 30 dias ─────────────────────────────────────
-- SQL puro, sem net.http_post nem segredo do Vault (ver ktm-vault-cron-divergencia).
-- Roda às 05:15 UTC, depois das rotinas da madrugada.

CREATE OR REPLACE FUNCTION limpar_historico_cron() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE v_qtd INTEGER;
BEGIN
  DELETE FROM cron.job_run_details WHERE end_time < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  RETURN v_qtd;
END;
$$;
REVOKE EXECUTE ON FUNCTION limpar_historico_cron() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('king-limpar-historico-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-limpar-historico-cron');
SELECT cron.schedule('king-limpar-historico-cron', '15 5 * * *', $$ SELECT limpar_historico_cron(); $$);
