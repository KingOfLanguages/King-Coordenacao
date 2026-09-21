-- ─────────────────────────────────────────────────────────────────────────────
-- Uma régua só de pendência de lançamento (2026-09-21).
--
-- Até aqui conviviam duas réguas:
--   • local (20260730/31): acompanhamento_silencio, 6/9/12 dias, calculada pelo
--     cron king-deteccao-silencio a partir do sync do KMS (piso de ~6 dias);
--   • King (/api/PendenciaLancamento): motor oficial, 2/3/5 dias, com bloqueio
--     real de agenda — a aba "Pendências do King".
-- O mesmo professor aparecia em estágios diferentes no Índice de atenção e na
-- aba Pendências. O Índice passou a ler a fila do King e "Marcar enviada" grava
-- no registro do King; a extensão do Meet já mostrava a pendência do King.
--
-- Medido antes de desligar: 64 episódios abertos na régua local, NENHUM
-- incidente automático gerado pela 3ª etapa desde que o recurso existe e
-- NENHUMA mensagem registrada por ela nos últimos 60 dias — só pintava chips.
--
-- As tabelas e funções ficam (histórico); só o cron para. Para reverter:
--   SELECT cron.schedule('king-deteccao-silencio', '0 6 * * *', $$ SELECT rodar_deteccao_silencio(); $$);
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('king-deteccao-silencio')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-deteccao-silencio');

COMMENT ON TABLE acompanhamento_silencio IS
  'LEGADO (aposentada em 2026-09-21): régua local 6/9/12 de pendência. A régua em uso é a do King (/api/PendenciaLancamento). Cron king-deteccao-silencio desligado; dados mantidos como histórico.';
COMMENT ON TABLE silencio_mensagem_log IS
  'LEGADO (2026-09-21): mensagens da régua local. As mensagens de pendência agora são registradas no King (RegistrarMensagem).';
COMMENT ON TABLE silencio_snapshot_semanal IS
  'LEGADO (2026-09-21): série semanal da régua local, congelada quando o cron king-deteccao-silencio foi desligado.';
COMMENT ON TABLE silencio_incidente IS
  'LEGADO (2026-09-21): episódios encerrados da régua local.';
