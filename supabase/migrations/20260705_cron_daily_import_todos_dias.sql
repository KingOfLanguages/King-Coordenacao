-- ─────────────────────────────────────────────────────────────────────────────
-- Correção crítica: reuniões criadas sábado/domingo só sincronizavam na
-- segunda-feira porque o cron só rodava em dias úteis. Passa a rodar todos
-- os dias, mantendo o intervalo de 10 minutos.
--
-- Idempotente: se o job não existir ainda (ambiente novo), não falha, só não
-- faz nada — cron.alter_job exige o job existente.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'king-daily-import';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_job_id, schedule := '*/10 * * * *');
  END IF;
END $$;
