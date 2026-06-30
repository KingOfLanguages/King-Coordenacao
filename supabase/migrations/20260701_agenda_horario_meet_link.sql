-- Link de Meet gerado automaticamente por horário (um evento/sala por slot),
-- em vez de um único link fixo por agenda. agenda_reunioes.meet_link continua
-- existindo como fallback para agendas antigas/criadas sem geração automática.

ALTER TABLE agenda_horarios ADD COLUMN IF NOT EXISTS meet_link TEXT;
ALTER TABLE agenda_horarios ADD COLUMN IF NOT EXISTS google_event_id TEXT;

COMMENT ON COLUMN agenda_horarios.meet_link IS
  'URL do Google Meet gerada para este horário específico (via generate-meet-link), ou inserida manualmente.';
COMMENT ON COLUMN agenda_horarios.google_event_id IS
  'ID do evento no Google Calendar da conta-hub que originou o meet_link, para referência/depuração.';
