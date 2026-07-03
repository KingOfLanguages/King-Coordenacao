-- ─────────────────────────────────────────────────────────────────────────────
-- Agendamento pg_cron: sync do King Nexus (ocorrências + tracking) a cada
-- 30 minutos, deslocado dos jobs de hora cheia (kms-api-sync roda no :00).
--
-- ANTES DE EXECUTAR: substitua os placeholders <PROJECT-REF> e
-- <SERVICE-ROLE-KEY> (mesmo padrão de 20260423_cron_jobs.sql). A função
-- também exige os secrets NEXUS_SUPABASE_URL, NEXUS_ANON_KEY,
-- NEXUS_SYNC_EMAIL e NEXUS_SYNC_PASSWORD (conta coordenacao no Nexus)
-- configurados no projeto — sem eles cada execução retorna 500.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('king-nexus-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-nexus-sync');

SELECT cron.schedule(
  'king-nexus-sync',
  '7,37 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/nexus-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE-ROLE-KEY>'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
