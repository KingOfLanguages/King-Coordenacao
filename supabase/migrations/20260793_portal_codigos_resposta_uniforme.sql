-- ─────────────────────────────────────────────────────────────────────────────
-- Portais do professor: resposta igual para cadastro que existe e que não existe
-- (pentest 05/10/2026, item 8 — enumeração).
--
-- `portal-identidade` passou a responder SEMPRE "enviamos um código". Quando não
-- há professor (ou ele está sem e-mail), grava um desafio-isca: professor_id
-- NULL e um hash que nenhum código confere. A verificação da isca percorre o
-- mesmo caminho do código real — mesmas mensagens, mesma contagem de tentativas.
--
-- `chave_hash` = SHA-256 do que a pessoa digitou (e-mail ou nome normalizado).
-- O limite de pedidos conta por ela, não pelo professor: um limite por professor
-- só dispararia para quem existe, e a mensagem de "muitos pedidos" denunciaria
-- o cadastro.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE portal_codigos ALTER COLUMN professor_id DROP NOT NULL;
ALTER TABLE portal_codigos ADD COLUMN IF NOT EXISTS chave_hash TEXT;

COMMENT ON COLUMN portal_codigos.professor_id IS
  'NULL = desafio-isca (cadastro não encontrado ou sem e-mail): nunca confere, existe para a resposta ser igual.';
COMMENT ON COLUMN portal_codigos.chave_hash IS
  'SHA-256 do e-mail ou nome digitado — base do limite de pedidos.';

CREATE INDEX IF NOT EXISTS idx_portal_codigos_chave ON portal_codigos (chave_hash, created_at DESC);
