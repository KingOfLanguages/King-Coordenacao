-- ─────────────────────────────────────────────────────────────────────────────
-- Simplificação do agendamento de reuniões em grupo
--
-- Decisão de produto (2026-07-17): o sistema deixa de gerar links de Meet e
-- deixa de criar eventos na agenda do coordenador. O link passa a ser SEMPRE
-- informado manualmente pelo coordenador na recorrência (agenda_recorrencias.
-- meet_link) e é reaproveitado em todas as ocorrências daquele horário, em
-- qualquer semana. Só o professor adiciona o evento ao próprio calendário
-- (link TEMPLATE do Google, que não cria evento em calendário de ninguém).
--
-- Esta migration:
--   1. Faz backfill do meet_link da recorrência a partir dos links que já
--      existiam nas ocorrências materializadas (Meets auto-gerados) — assim as
--      recorrências que já rodaram herdam um link fixo sem trabalho manual.
--   2. Remove as colunas de pré-materialização/evento-Google de agenda_horarios
--      (google_event_id, coordenador_confirmado) — não há mais evento no Google.
--   3. Desmarca o cron king-materializar-ocorrencias (a Edge Function
--      materializar-ocorrencias foi removida do código; falta só o undeploy).
--
-- NB: NÃO adicionamos NOT NULL em agenda_recorrencias.meet_link. Recorrências
-- antigas que nunca materializaram (nem têm link na agenda) continuam com link
-- nulo até o coordenador editar — o create-booking recusa reserva sem link e o
-- formulário passa a exigir o campo, então a obrigatoriedade é garantida na
-- borda de escrita/reserva sem arriscar quebrar dados legados aqui.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Backfill: recorrência herda o link de uma ocorrência já materializada ──
UPDATE agenda_recorrencias r
SET meet_link = h.meet_link
FROM (
  SELECT DISTINCT ON (recorrencia_id) recorrencia_id, meet_link
  FROM agenda_horarios
  WHERE recorrencia_id IS NOT NULL
    AND meet_link IS NOT NULL
  ORDER BY recorrencia_id, data_hora DESC
) h
WHERE r.id = h.recorrencia_id
  AND r.meet_link IS NULL;

-- Fallback: recorrência sem ocorrência materializada herda o link da agenda.
UPDATE agenda_recorrencias r
SET meet_link = a.meet_link
FROM agenda_reunioes a
WHERE r.agenda_id = a.id
  AND r.meet_link IS NULL
  AND a.meet_link IS NOT NULL;

-- ── 2. Remove colunas de pré-materialização (evento no Google) ────────────────
ALTER TABLE agenda_horarios DROP COLUMN IF EXISTS coordenador_confirmado;
ALTER TABLE agenda_horarios DROP COLUMN IF EXISTS google_event_id;

-- ── 3. Desmarca o cron de pré-materialização ──────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-materializar-ocorrencias') THEN
    PERFORM cron.unschedule('king-materializar-ocorrencias');
  END IF;
END $$;
