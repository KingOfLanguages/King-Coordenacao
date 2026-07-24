-- ─────────────────────────────────────────────────────────────────────────────
-- Agendamento pg_cron: geração diária das "Mensagens do dia" de todos os
-- coordenadores (Edge Function contatos-dia-gerar), incluindo a prioridade e o
-- sorteio de agendas bloqueadas por pendência.
--
-- Roda cedo (09:00 UTC ≈ 06:00 BRT) para a lista já estar pronta e priorizada
-- antes de qualquer coordenador abrir a tela — se um coordenador abrir antes, o
-- RPC lazy `gerar_contatos_dia` cria os 20 normais (sem pendência) e o batch,
-- idempotente por dia, respeita a lista já existente.
--
-- ⚠️ ANTES DE EXECUTAR: substitua <PROJECT-REF> e <SERVICE-ROLE-KEY> (mesmo padrão
-- de 20260703_cron_kms_api_sync.sql). Pré-requisitos de secrets na Edge Function:
-- KMS_API_BASE_URL (ou PENDENCIAS_API_BASE_URL), KMS_API_EMAIL, KMS_API_PASSWORD
-- já existem (são os mesmos do kms-api-sync / pendencias-lancamento). CRON_SECRET
-- é opcional; se definido, troque o Bearer abaixo por <CRON_SECRET>.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('king-contatos-dia-gerar')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-contatos-dia-gerar');

SELECT cron.schedule(
  'king-contatos-dia-gerar',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/contatos-dia-gerar',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE-ROLE-KEY>'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
