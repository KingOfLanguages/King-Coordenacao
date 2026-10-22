-- ─────────────────────────────────────────────────────────────────────────────
-- Convite da trilha (22/10/2026)
--
-- Parecer do RH: depois de criar o login na King, o professor tentava entrar na
-- trilha antes de o cadastro chegar ao KTM, e o código não saía. Em vez de o
-- professor adivinhar a hora certa, o KTM avisa: quando o cadastro chega (sync
-- de 5 em 5 min, migration 20260805), a função convite-trilha manda o e-mail
-- "Sua trilha de boas-vindas está pronta" com o link. Decisão do João.
--
--   • professores.convite_trilha_em: quando o convite saiu (NULL = não saiu).
--   • professores.convite_trilha_tentativas: envios tentados; a função reserva
--     o professor somando 1 antes de mandar, então duas chamadas ao mesmo tempo
--     não mandam dois e-mails. Desiste depois de 3.
--   • convites_trilha_pendentes(): quem deve receber agora.
--   • O cron só chama a função quando há alguém pendente (como o vigia do sync).
--
-- O convite NÃO grava em email_disparos: contaria na carência de 15 dias e
-- travaria o e-mail da 1ª reunião, que vem logo depois. Conta só na cota do
-- Brevo, como os códigos do portal (uns poucos por semana).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE professores
  ADD COLUMN IF NOT EXISTS convite_trilha_em          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS convite_trilha_tentativas  SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN professores.convite_trilha_em IS
  'Quando saiu o e-mail "Sua trilha de boas-vindas está pronta" (função convite-trilha). NULL = não saiu.';
COMMENT ON COLUMN professores.convite_trilha_tentativas IS
  'Envios do convite tentados (reserva antes de mandar). Com 3, desiste.';

-- Quem recebe o convite agora. Só professor novo de verdade:
--   • chegou ao KTM depois que o convite passou a existir e há no máximo 3 dias
--     (cadastro antigo que o sync só agora trouxe não é professor novo, e os de
--     antes do convite já tinham recebido o guia do RH);
--   • começa há no máximo 30 dias, ou ainda vai começar;
--   • ativo, com e-mail válido, sem ter aberto a trilha e sem dispensa.
CREATE OR REPLACE FUNCTION convites_trilha_pendentes()
RETURNS TABLE (id UUID, nome TEXT, email TEXT, tentativas SMALLINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.email, p.convite_trilha_tentativas
  FROM professores p
  WHERE p.convite_trilha_em IS NULL
    AND p.convite_trilha_tentativas < 3
    AND p.status = 'ativo'
    AND p.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    AND p.created_at >= GREATEST('2026-10-22 13:00+00'::timestamptz, now() - interval '3 days')
    AND (p.data_inicio IS NULL OR p.data_inicio >= current_date - 30)
    AND NOT EXISTS (SELECT 1 FROM welcome_path_jornada j WHERE j.professor_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM welcome_path_dispensas d WHERE d.professor_id = p.id)
  ORDER BY p.created_at
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION convites_trilha_pendentes() FROM PUBLIC;
REVOKE ALL ON FUNCTION convites_trilha_pendentes() FROM anon, authenticated;
