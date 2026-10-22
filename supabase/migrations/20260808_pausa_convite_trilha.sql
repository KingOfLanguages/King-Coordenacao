-- ─────────────────────────────────────────────────────────────────────────────
-- Pausa do convite da trilha (22/10/2026)
--
-- O RH quer começar com um grupo de controle antes de o convite ir para todo
-- professor novo. O job king-convite-trilha (20260807) fica DESLIGADO, não
-- apagado: para religar, o mesmo alter_job com active := true.
--
-- Atenção ao religar: convites_trilha_pendentes() pega quem chegou nos últimos
-- 3 dias. Quem chegou durante a pausa e ainda não abriu a trilha recebe o
-- convite na primeira batida — se não for para receber, marque antes
-- convite_trilha_tentativas = 3 nessas linhas.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'king-convite-trilha'),
  active := false
);
