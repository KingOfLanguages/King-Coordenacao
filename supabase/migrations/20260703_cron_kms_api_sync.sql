-- ─────────────────────────────────────────────────────────────────────────────
-- Agendamento pg_cron: sync horário da API de Acompanhamento de Professores
-- (KLS-720). Alinhado ao cache de 1h documentado pela API — não faz sentido
-- sincronizar com mais frequência que isso.
--
-- ANTES DE EXECUTAR: substitua os placeholders <PROJECT-REF> e
-- <SERVICE-ROLE-KEY> (mesmo padrão de 20260423_cron_jobs.sql).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('king-kms-api-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-kms-api-sync');

SELECT cron.schedule(
  'king-kms-api-sync',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/kms-api-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE-ROLE-KEY>'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
