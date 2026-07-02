-- ─────────────────────────────────────────────────────────────────────────────
-- Agendamento pg_cron: pré-materialização diária das ocorrências de agenda.
--
-- Mantém a janela futura sempre preenchida — cada nova semana que entra na
-- janela ganha sua própria ocorrência (Meet novo + coordenador confirmado).
-- Idempotente na function (só cria o que ainda não existe).
--
-- Roda 1x/dia às 05:00 BRT (08:00 UTC), antes do horário comercial.
--
-- ANTES DE EXECUTAR: substitua os placeholders <PROJECT-REF> e
-- <SERVICE-ROLE-KEY> (mesmo padrão de 20260423_cron_jobs.sql).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('king-materializar-ocorrencias')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-materializar-ocorrencias');

SELECT cron.schedule(
  'king-materializar-ocorrencias',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/materializar-ocorrencias',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE-ROLE-KEY>'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
