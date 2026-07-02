-- ─────────────────────────────────────────────────────────────────────────────
-- Pré-materialização de ocorrências de agenda recorrente.
--
-- Antes: uma linha em agenda_horarios (e o Meet) só era criada na 1ª reserva
-- da semana. Agora as ocorrências futuras são criadas proativamente quando a
-- possibilidade de agendamento passa a existir — cada uma com um Meet próprio
-- (link novo por ocorrência, nunca reaproveitado entre grupos) e o coordenador
-- da agenda já confirmado como participante.
--
-- Colunas aditivas e idempotentes — sem impacto no fluxo antigo (create-booking
-- continua funcionando como fallback caso uma ocorrência ainda não exista).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE agenda_horarios
  ADD COLUMN IF NOT EXISTS coordenador_confirmado BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE agenda_horarios
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

COMMENT ON COLUMN agenda_horarios.coordenador_confirmado IS
  'True quando a ocorrência foi pré-criada com o coordenador da agenda confirmado como participante do Meet.';
COMMENT ON COLUMN agenda_horarios.google_event_id IS
  'ID do evento no Google Calendar da conta-hub (para atualizar/remover o Meet desta ocorrência).';
