-- ─────────────────────────────────────────────────────────────────────────────
-- Links individuais de agendamento do coordenador — usados pelo Portal de
-- Agendamento (/agendar) para direcionar o professor automaticamente para a
-- ferramenta externa certa (Koalendar para 1ª reunião, Google Calendar
-- Appointment Schedule para acompanhamento), sem que ele escolha ou veja
-- links de outro coordenador.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS koalendar_link TEXT,
  ADD COLUMN IF NOT EXISTS google_appointment_link TEXT;

COMMENT ON COLUMN profiles.koalendar_link IS
  'Link do coordenador no Koalendar, para "Primeira reunião com a Coordenação" (professor nunca teve reunião realizada). Configurado pelo próprio coordenador em /admin/agendas.';
COMMENT ON COLUMN profiles.google_appointment_link IS
  'Link do Google Calendar Appointment Schedule do coordenador, para "Reunião de Acompanhamento" (professor já teve ao menos 1 reunião realizada). Configurado pelo próprio coordenador em /admin/agendas.';

-- ── Auto-atualização do próprio perfil ────────────────────────────────────────
-- Não existia policy de UPDATE em profiles para o próprio usuário autenticado
-- (as escritas em profiles até aqui só aconteciam via Edge Function com
-- service-role, ex.: exchange-google-token). O card de configurações da
-- Frente 2 faz update direto do cliente, então essa policy é necessária.

DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
CREATE POLICY "profiles_update_self" ON profiles FOR UPDATE TO authenticated
  USING      (id = auth.uid())
  WITH CHECK (id = auth.uid());
