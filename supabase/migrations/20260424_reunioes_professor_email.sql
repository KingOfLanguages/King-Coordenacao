-- Email do professor capturado diretamente dos attendees do Google Calendar
-- Não exige cadastro manual do email na tabela professores
ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS professor_email TEXT;

COMMENT ON COLUMN reunioes.professor_email IS
  'Email do professor extraído automaticamente dos attendees do Google Calendar.
   Usado pelo send-reminders para enviar lembretes sem precisar cadastrar email na plataforma.';
