-- ─────────────────────────────────────────────────────────────────────────────
-- Cron do convite da trilha (22/10/2026) — liga o envio da 20260806.
--
-- De 5 em 5 min, dois minutos depois do passo dos novos do sync (que roda nos
-- minutos 5, 10, …, 55, e a rodada de hora em hora no 0). Só chama a função
-- quando convites_trilha_pendentes() tem alguém: no resto do tempo é uma
-- consulta SQL e nada mais.
--
-- Copia URL e Authorization do job king-kms-api-sync que já está no banco,
-- trocando a função e o fim do comando — nenhum segredo entra no repositório.
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

  v_novo := replace(v_cmd, '/functions/v1/kms-api-sync', '/functions/v1/convite-trilha');
  v_novo := regexp_replace(
    v_novo,
    '\)\s*AS request_id\s*;?\s*$',
    ') AS request_id WHERE EXISTS (SELECT 1 FROM public.convites_trilha_pendentes());'
  );
  IF v_novo = v_cmd OR position('convite-trilha' IN v_novo) = 0 OR position('WHERE EXISTS' IN v_novo) = 0 THEN
    RAISE EXCEPTION 'comando de king-kms-api-sync fora do formato esperado';
  END IF;
  PERFORM cron.unschedule('king-convite-trilha')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-convite-trilha');
  PERFORM cron.schedule('king-convite-trilha', '2-57/5 * * * *', v_novo);
END;
$$;
