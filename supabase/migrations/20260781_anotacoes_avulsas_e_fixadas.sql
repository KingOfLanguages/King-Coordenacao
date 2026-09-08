-- ─────────────────────────────────────────────────────────────────────────────
-- Anotações internas: nota avulsa (sem reunião) + fixar no topo.
--
-- Até aqui toda anotação nascia colada numa reunião — só dava pra escrever
-- abrindo a reunião em Reuniões. A Minha Área passa a ser um bloco de notas de
-- verdade: dá pra criar nota do nada (reuniao_id NULL) e marcar as importantes
-- como FIXADAS, que sobem pro topo da lista.
--
-- O índice único (reuniao_id, autor_id) continua inteiro de propósito: em índice
-- único do Postgres NULL não é igual a NULL, então cada pessoa pode ter quantas
-- notas avulsas quiser e o upsert por reunião (que infere ESTE índice) segue
-- funcionando. Índice PARCIAL quebraria o upsert do PostgREST, que manda
-- ON CONFLICT (cols) sem o WHERE e não conseguiria inferir o índice.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reuniao_anotacoes_internas
  ALTER COLUMN reuniao_id DROP NOT NULL;

ALTER TABLE reuniao_anotacoes_internas
  ADD COLUMN IF NOT EXISTS fixada BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN reuniao_anotacoes_internas.reuniao_id IS
  'Reunião de origem. NULL = nota avulsa, escrita direto na Minha Área.';
COMMENT ON COLUMN reuniao_anotacoes_internas.fixada IS
  'Fixada pelo autor: sobe pro topo da Minha Área.';

COMMENT ON TABLE reuniao_anotacoes_internas IS
  'Anotações internas privadas por autor (só o autor vê as suas). Uma por (reunião, autor); avulsas (reuniao_id NULL) são ilimitadas.';

-- Fixadas primeiro, mais recentes primeiro — a ordem que a Minha Área lê.
CREATE INDEX IF NOT EXISTS idx_reuniao_anot_autor_fixada
  ON reuniao_anotacoes_internas (autor_id, fixada DESC, updated_at DESC);
