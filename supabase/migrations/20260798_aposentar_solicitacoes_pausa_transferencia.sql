-- ─────────────────────────────────────────────────────────────────────────────
-- Aposenta os formulários de pausa e de transferência de aluno (2026-10-14).
--
-- A pausa e a transferência passaram para a plataforma da King. Saem do KTM:
-- os portais /pausa e /transferencia (agora só um aviso), as Edge Functions
-- portal-pausa e portal-transferencia e a tela Solicitações (fila do Suporte).
--
-- Os DADOS ficam: pausas, transferencias_aluno, observações e notificações
-- antigas não são tocados, e as funções do banco continuam lá (sem quem chame).
--
-- Crons:
--   king-transferencia-atraso  SAI — avisava pedido atrasado na fila que não
--                              existe mais.
--   king-ativar-pausas         SAI — ativava pausa concluída na data de início;
--                              sem pedido novo não há o que ativar (as 31 em
--                              andamento já estavam ativas em 14/10).
--   king-cobrar-fim-pausa      FICA — as pausas que já estavam em andamento
--                              ainda geram a tarefa "Encerrar pausa" na data de
--                              retorno (a última em 2027-03). Sem ela, o
--                              professor ficaria travado em 'pausa' no KTM.
-- ─────────────────────────────────────────────────────────────────────────────

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-transferencia-atraso') THEN
    PERFORM cron.unschedule('king-transferencia-atraso');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-ativar-pausas') THEN
    PERFORM cron.unschedule('king-ativar-pausas');
  END IF;
END
$do$;
