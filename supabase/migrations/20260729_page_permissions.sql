-- ─────────────────────────────────────────────────────────────────────────────
-- Controle de visualização de página por role.
--
-- Guarda apenas OVERRIDES: uma linha por página cujo acesso o admin personalizou.
-- Páginas sem linha aqui usam o acesso PADRÃO definido no código
-- (src/lib/pagePermissions.ts). Ou seja: tabela vazia = comportamento idêntico
-- ao de antes deste sistema. `roles` é um text[] de sujeitos
-- ('coordenacao' | 'lider' | 'suporte' | 'suporte_aluno'); admin sempre tem acesso.
--
-- Isto é uma camada de UI (menu + rota). A proteção real dos dados continua nas
-- policies de RLS das tabelas.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS page_permissions (
  page_key   TEXT PRIMARY KEY,
  roles      TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE page_permissions IS
  'Overrides de acesso por página (controle de visualização por role). Sem linha = usa o padrão do código. Admin sempre tem acesso.';

ALTER TABLE page_permissions ENABLE ROW LEVEL SECURITY;

-- Todos os autenticados leem (cada usuário precisa saber o próprio acesso ao montar o menu).
DROP POLICY IF EXISTS page_permissions_select ON page_permissions;
CREATE POLICY page_permissions_select ON page_permissions
  FOR SELECT TO authenticated
  USING (true);

-- Só admin escreve.
DROP POLICY IF EXISTS page_permissions_write ON page_permissions;
CREATE POLICY page_permissions_write ON page_permissions
  FOR ALL TO authenticated
  USING (sou_admin())
  WITH CHECK (sou_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON page_permissions TO authenticated;
