-- ─────────────────────────────────────────────────────────────────────────────
-- King's Circle (pedido do João, 16/10/2026)
--
-- O King's Circle é o grupo/comunidade oficial de professores da King. Quem
-- faz parte ganha um selo VIP na ficha e na lista de professores, e é recebido
-- com uma tela de boas-vindas em todo portal do professor (/agendar,
-- /welcome-path).
--
-- Quem entra ou sai é decisão da equipe, na ficha do professor (botão liga/
-- desliga). A policy de UPDATE de `professores` já é a certa para isso
-- (coordenação, suporte, admin — 20260754). O sync do King não conhece a
-- coluna e nunca mexe nela.
--
-- A carga inicial (23 professores) foi rodada à parte, fora do repo.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE professores
  ADD COLUMN IF NOT EXISTS kings_circle     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kings_circle_em  timestamptz,
  ADD COLUMN IF NOT EXISTS kings_circle_por uuid REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN professores.kings_circle IS
  'Membro do King''s Circle (comunidade oficial de professores): selo VIP na ficha e boas-vindas nos portais.';
COMMENT ON COLUMN professores.kings_circle_em IS
  'Quando o selo foi ligado ou desligado pela última vez (carimbado pelo gatilho).';
COMMENT ON COLUMN professores.kings_circle_por IS
  'Quem ligou ou desligou o selo pela última vez. NULL = carga por script.';

-- Carimba quem mexeu e quando. Ninguém escreve essas duas colunas à mão: se o
-- UPDATE não troca o selo, elas voltam ao que eram.
CREATE OR REPLACE FUNCTION carimbar_kings_circle() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kings_circle IS DISTINCT FROM OLD.kings_circle THEN
    NEW.kings_circle_em  := now();
    NEW.kings_circle_por := auth.uid();
  ELSE
    NEW.kings_circle_em  := OLD.kings_circle_em;
    NEW.kings_circle_por := OLD.kings_circle_por;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION carimbar_kings_circle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_carimbar_kings_circle ON professores;
CREATE TRIGGER trg_carimbar_kings_circle
  BEFORE UPDATE OF kings_circle, kings_circle_em, kings_circle_por ON professores
  FOR EACH ROW EXECUTE FUNCTION carimbar_kings_circle();
