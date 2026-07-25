-- ─────────────────────────────────────────────────────────────────────────────
-- Unificação do link da reunião em grupo (fecha o bug de "links diferentes")
--
-- Contexto: o cron de pré-materialização (removido em 2026-07-17) criou
-- ocorrências futuras em agenda_horarios, cada uma com um link de Meet próprio.
-- O backfill da 20260736 só copiou UM link para a recorrência e nunca reconciliou
-- as ocorrências futuras já existentes → cada semana servia um link diferente.
--
-- Esta migration unifica cada recorrência num ÚNICO link, SEM reavisar ninguém:
--   1. Recorrências que já têm uma ocorrência futura RESERVADA adotam como
--      canônico o link que esses professores já receberam (a reserva futura mais
--      próxima). A "fonte da verdade" passa a ser o link já divulgado.
--   2. Garante o esquema https:// em todo link de recorrência — links legados
--      herdados de agenda_reunioes vinham como "meet.google.com/..." sem esquema,
--      o que vira URL relativa (link quebrado) no e-mail e no portal.
--   3. Propaga o link canônico para as ocorrências futuras VAZIAS. Ocorrências
--      que já têm inscrito NÃO são tocadas — mantêm o link avisado, pra não
--      dividir uma sala já comunicada.
--
-- Idempotente. As Edge Functions create-booking/teacher-lookup já servem esse
-- mesmo invariante em runtime (link da recorrência p/ ocorrência vazia; link da
-- ocorrência p/ sessão que já tem inscrito) — esta migration alinha os dados
-- legados. Aplicada em produção via Edge Function temporária ([[ktm-supabase-migration-workflow]]).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Recorrência adota o link da reserva futura mais próxima como canônico.
WITH reservada AS (
  SELECT DISTINCT ON (h.recorrencia_id)
         h.recorrencia_id,
         CASE WHEN h.meet_link ~* '^https?://' THEN h.meet_link
              ELSE 'https://' || h.meet_link END AS link
  FROM agenda_horarios h
  JOIN agenda_inscricoes i ON i.horario_id = h.id AND i.status = 'confirmada'
  WHERE h.data_hora > now()
    AND h.recorrencia_id IS NOT NULL
    AND h.meet_link IS NOT NULL
  ORDER BY h.recorrencia_id, h.data_hora
)
UPDATE agenda_recorrencias r
SET    meet_link = res.link
FROM   reservada res
WHERE  r.id = res.recorrencia_id
  AND  r.meet_link IS DISTINCT FROM res.link;

-- 2. Garante https:// em todo link de recorrência.
UPDATE agenda_recorrencias
SET    meet_link = 'https://' || meet_link
WHERE  meet_link IS NOT NULL
  AND  meet_link !~* '^https?://';

-- 3. Propaga o link canônico para as ocorrências futuras VAZIAS.
UPDATE agenda_horarios h
SET    meet_link = r.meet_link
FROM   agenda_recorrencias r
WHERE  h.recorrencia_id = r.id
  AND  r.meet_link IS NOT NULL
  AND  h.data_hora > now()
  AND  h.meet_link IS DISTINCT FROM r.meet_link
  AND  NOT EXISTS (
         SELECT 1 FROM agenda_inscricoes i
         WHERE i.horario_id = h.id AND i.status = 'confirmada'
       );
