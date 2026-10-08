-- ─────────────────────────────────────────────────────────────────────────────
-- /agendar sem código no e-mail (2026-10-08, decisão do João).
--
-- Desde o pentest de 05/10 os 4 portais do professor só abriam com o código
-- enviado ao e-mail oficial. O agendamento de reuniões volta a abrir só com
-- e-mail OU nome completo — mas numa sessão de escopo próprio:
--
--   escopo 'completo'     nasce do código; vale nos 4 portais (como antes)
--   escopo 'agendamento'  nasce de e-mail/nome; só o /agendar aceita;
--                         2 horas, sem renovação; não mostra o link do Meet das
--                         reuniões em grupo (vai por e-mail para o cadastro)
--
-- /pausa, /transferencia e /welcome-path recusam o escopo 'agendamento', então
-- o C-1 do pentest continua fechado para eles. Nenhum portal grava e-mail (C-2).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE portal_sessoes
  ADD COLUMN IF NOT EXISTS escopo TEXT NOT NULL DEFAULT 'completo'
    CHECK (escopo IN ('completo', 'agendamento'));

COMMENT ON COLUMN portal_sessoes.escopo IS
  'completo = entrou com o código do e-mail (4 portais). agendamento = entrou só com e-mail/nome, vale só no /agendar, 2 horas.';
