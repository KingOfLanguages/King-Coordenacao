-- ─────────────────────────────────────────────────────────────────────────────
-- Agendamentos pg_cron para automação diária
--
-- ANTES DE EXECUTAR:
--   Substitua os dois placeholders abaixo:
--   1. <PROJECT-REF>      → referência do seu projeto Supabase
--                           (encontre em: Dashboard > Settings > API > Project URL)
--   2. <SERVICE-ROLE-KEY> → chave service_role (secreta)
--                           (encontre em: Dashboard > Settings > API > service_role)
--
-- Horários (BRT = UTC-3, Brasil não adota horário de verão desde 2019):
--   08:00 BRT = 11:00 UTC  → importação do calendário
--   08:30 BRT = 11:30 UTC  → envio de lembretes por email
-- ─────────────────────────────────────────────────────────────────────────────

-- Garante que pg_net está habilitado (necessário para chamadas HTTP via SQL)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamentos anteriores se existirem (idempotente)
SELECT cron.unschedule('king-daily-import')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-daily-import');
SELECT cron.unschedule('king-send-reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-send-reminders');

-- ── Importação automática: segunda a sexta, 08:00 BRT (11:00 UTC) ─────────────
SELECT cron.schedule(
  'king-daily-import',
  '0 11 * * 1-5',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/daily-import',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE-ROLE-KEY>'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ── Lembretes por email: segunda a sexta, 08:30 BRT (11:30 UTC) ──────────────
SELECT cron.schedule(
  'king-send-reminders',
  '30 11 * * 1-5',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE-ROLE-KEY>'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
