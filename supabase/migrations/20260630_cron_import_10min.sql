-- ─────────────────────────────────────────────────────────────────────────────
-- Importação automática passa de 1x/dia (8h) para a cada 10 minutos,
-- dias úteis — qualquer reunião agendada no Google Calendar aparece em
-- Reuniões do Dia em até 10 minutos, em vez de só no dia seguinte às 8h.
--
-- O job já existe (criado em 20260423_cron_jobs.sql); aqui só ajustamos
-- o agendamento. Idempotente: se o job não existir ainda (ambiente novo),
-- não falha, só não faz nada — cron.alter_job exige o job existente.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'king-daily-import';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_job_id, schedule := '*/10 * * * 1-5');
  END IF;
END $$;
