-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: cron job king-daily-import nunca funcionou.
--
-- O job foi criado com URL e Authorization de exemplo, nunca preenchidos com
-- os valores reais do projeto: 'https://SEU_PROJECT_REF.supabase.co/...' e
-- 'Bearer SUA_SERVICE_ROLE_KEY'. Rodava a cada 10 min mas sempre falhava
-- silenciosamente (net.http_post contra um host que não resolve), então a
-- sincronização automática de reuniões nunca aconteceu — só funcionava
-- quando a função era invocada manualmente.
--
-- Segurança: a service_role key NÃO é mais hardcoded aqui. Ela é lida do
-- Supabase Vault. Antes de aplicar/rodar este cron, crie o secret uma vez:
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.alter_job(
  job_id  := 3,
  command := $$
    SELECT net.http_post(
      url     := 'https://dajbzpeduxmsxyukmjfm.supabase.co/functions/v1/daily-import',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'service_role_key'
        )
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
