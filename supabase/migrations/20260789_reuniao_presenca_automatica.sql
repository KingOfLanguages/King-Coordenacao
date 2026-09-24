-- ─────────────────────────────────────────────────────────────────────────────
-- Presença automática da extensão (2026-09-24).
--
-- A extensão do Meet passou a confirmar a reunião 1:1 sozinha depois que o
-- professor fica alguns minutos na chamada. Estas duas colunas deixam rastro de
-- COMO a participação foi confirmada — é o que permite "Desfazer" só o que a
-- extensão marcou, e separar nos relatórios a confirmação feita à mão.
--
--   confirmacao_origem    'manual' | 'automatica'; NULL = linha antiga ou
--                         confirmada fora da extensão (web, RPC de grupo).
--   presenca_detectada_em quando a extensão viu o professor na chamada pela
--                         primeira vez (início da contagem).
--
-- Sem RLS nova: são colunas da mesma linha que o coordenador já atualiza.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reuniao_professores
  ADD COLUMN IF NOT EXISTS confirmacao_origem TEXT
    CHECK (confirmacao_origem IN ('manual', 'automatica')),
  ADD COLUMN IF NOT EXISTS presenca_detectada_em TIMESTAMPTZ;

COMMENT ON COLUMN reuniao_professores.confirmacao_origem IS
  'Como a participação foi confirmada: manual (clique) ou automatica (extensão detectou o professor na chamada). NULL = legado/web.';
COMMENT ON COLUMN reuniao_professores.presenca_detectada_em IS
  'Quando a extensão do Meet viu o professor na chamada pela primeira vez (só na confirmação automática).';
