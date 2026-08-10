-- ─────────────────────────────────────────────────────────────────────────────
-- Tags no acompanhamento de onboarding.
--
-- O suporte precisa marcar cada professor da lista com um rótulo próprio
-- ("aguardando contrato", "turma noturna", "não responde"…), com cor, para bater
-- o olho e organizar. A observação já existia na tabela (coluna `observacao`,
-- até aqui sem UI) e passa a ser o texto livre que acompanha a tag.
--
-- Aditiva e idempotente. RLS não muda: as políticas onboarding_select /
-- onboarding_write de 20260717 já cobrem a tabela inteira.
--
-- ATENÇÃO: aplicar ANTES de subir o frontend — a tela lê tag_texto/tag_cor no
-- mesmo SELECT do resto; coluna faltando derruba a query inteira (400).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE onboarding_professores ADD COLUMN IF NOT EXISTS tag_texto TEXT;
ALTER TABLE onboarding_professores ADD COLUMN IF NOT EXISTS tag_cor   TEXT;

COMMENT ON COLUMN onboarding_professores.tag_texto  IS
  'Rótulo livre do registro (ex.: "aguardando contrato"). NULL = sem tag.';
COMMENT ON COLUMN onboarding_professores.tag_cor    IS
  'Cor da tag: cinza | vermelho | laranja | amarelo | verde | azul | roxo | rosa. Validada no app; cor desconhecida cai no padrão.';
COMMENT ON COLUMN onboarding_professores.observacao IS
  'Observação livre do registro, exibida junto da tag no acompanhamento.';

-- Filtro/busca por tag na lista (poucos registros, mas o índice é barato).
CREATE INDEX IF NOT EXISTS idx_onboarding_tag_texto
  ON onboarding_professores (tag_texto)
  WHERE tag_texto IS NOT NULL;
