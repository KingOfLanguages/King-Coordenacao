-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3: Reuniões de Grupo como Acompanhamento
--
-- Adiciona referência em agenda_horarios para a reunião de grupo criada quando
-- o primeiro professor se inscreve. Permite rastrear qual reuniao_id pertence a
-- cada horário de grupo materializado.
--
-- Formato: agenda_horarios.reuniao_id → reunioes.id (nullable ON DELETE SET NULL)
-- Quando a reunião é cancelada, o horário continua existindo mas sem reunião
-- associada (raro, mas seguro).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE agenda_horarios
  ADD COLUMN IF NOT EXISTS reuniao_id UUID REFERENCES reunioes(id) ON DELETE SET NULL;

COMMENT ON COLUMN agenda_horarios.reuniao_id IS
  'Referência para a reunião de grupo criada quando o primeiro professor confirma inscrição neste horário. NULL se a reunião foi cancelada ou o horário ainda não gerou inscrição.';

CREATE INDEX IF NOT EXISTS idx_agenda_horarios_reuniao_id
  ON agenda_horarios (reuniao_id);

CREATE INDEX IF NOT EXISTS idx_agenda_horarios_data_reuniao
  ON agenda_horarios (data_hora, reuniao_id)
  WHERE reuniao_id IS NOT NULL;
