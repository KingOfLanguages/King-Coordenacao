-- ─────────────────────────────────────────────────────────────────────────────
-- kms-api-sync: professor novo chega ao KTM em minutos (22/10/2026)
--
-- Parecer do RH: depois de criar o login na King, o código de acesso à trilha
-- só chegou ~1 hora depois. O professor só existe no KTM quando o sync o traz
-- (rodada de ativos, de hora em hora), e até lá o portal-identidade responde
-- "enviado" com uma isca (item 8 do pentest) e não manda nada.
--
-- Agora o passo dos novos roda também sozinho, de 5 em 5 minutos (body
-- {"tipo":"novos"}): consulta os IDs logo acima do maior kms_id e grava quem
-- achar. Não abre rodada em kms_sync_rodadas e pula quando uma rodada de ativos
-- está em andamento. Fora do minuto 0, quando começa a rodada de hora em hora.
--
-- Como os jobs de 19/10, copia URL e Authorization do king-kms-api-sync que já
-- está no banco — nenhum segredo entra no repositório.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_cmd   TEXT;
  v_novo  TEXT;
BEGIN
  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'king-kms-api-sync';
  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'job king-kms-api-sync não existe — agende-o antes (20260703_cron_kms_api_sync.sql)';
  END IF;

  v_novo := regexp_replace(v_cmd, '''\{\}''::jsonb', '''{"tipo":"novos"}''::jsonb');
  IF v_novo = v_cmd THEN
    RAISE EXCEPTION 'comando de king-kms-api-sync fora do formato esperado (body ''{}''::jsonb)';
  END IF;
  PERFORM cron.unschedule('king-kms-sync-novos')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-kms-sync-novos');
  PERFORM cron.schedule('king-kms-sync-novos', '5-55/5 * * * *', v_novo);
END;
$$;
