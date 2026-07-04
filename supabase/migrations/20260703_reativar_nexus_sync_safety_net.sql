-- Religa o sync com o King Nexus como rede de segurança temporária, enquanto
-- a plataforma ainda não foi desativada de vez (decisão do usuário: mais
-- vale garantir que nada se perde do que economizar esse cron). Pode ser
-- desligado a qualquer momento com cron.unschedule('king-nexus-sync') sem
-- quebrar nada — nexus-mes-analise já não depende mais dele (ver
-- nexus-mes-analise/index.ts e [[ktm-nexus-sync]]).

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
