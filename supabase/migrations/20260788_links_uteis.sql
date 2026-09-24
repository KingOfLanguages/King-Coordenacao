-- ─────────────────────────────────────────────────────────────────────────────
-- Links úteis da Minha Área (2026-09-24).
--
-- Um bloco com os links importantes, para todo mundo que abre a Minha Área. Os
-- portais públicos da própria plataforma (/agendar, /pausa, /transferencia,
-- /welcome-path) vêm do código (src/lib/portal.ts), para acompanharem o domínio
-- de produção sozinhos. Esta tabela guarda só os EXTERNOS, que a equipe
-- adiciona pela tela — começando pelo formulário de desligamento do KMS.
--
-- Ler: qualquer logado. Adicionar/remover: coordenação, suporte e admin (o
-- mesmo grupo de canEdit no front).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS links_uteis (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      TEXT        NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 80),
  -- Só http(s): barra javascript:/data: num link que todo mundo clica.
  url         TEXT        NOT NULL CHECK (url ~* '^https?://[^[:space:]]+$' AND char_length(url) <= 2000),
  criado_por  UUID        REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE links_uteis IS
  'Links externos do bloco Links úteis da Minha Área. Os portais da plataforma vêm do código (src/lib/portal.ts).';

ALTER TABLE links_uteis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "links_uteis_select" ON links_uteis;
CREATE POLICY "links_uteis_select" ON links_uteis FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "links_uteis_insert" ON links_uteis;
CREATE POLICY "links_uteis_insert" ON links_uteis FOR INSERT TO authenticated
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));

DROP POLICY IF EXISTS "links_uteis_delete" ON links_uteis;
CREATE POLICY "links_uteis_delete" ON links_uteis FOR DELETE TO authenticated
  USING (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));

-- O primeiro externo, pedido junto com o bloco.
INSERT INTO links_uteis (titulo, url, criado_por)
SELECT 'Desligamento de professor (KMS)', 'https://app.kingmanagementsystem.com.br/desligamento-professor', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM links_uteis WHERE url = 'https://app.kingmanagementsystem.com.br/desligamento-professor'
);
