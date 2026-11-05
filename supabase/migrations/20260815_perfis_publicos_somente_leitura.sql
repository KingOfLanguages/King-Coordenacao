-- ─────────────────────────────────────────────────────────────────────────────
-- `perfis_publicos` volta a ser SÓ LEITURA  ← aplicada em produção em 05/11/2026
--
-- Achado em 05/11/2026 conferindo os privilégios da 20260814, que copiou o
-- padrão desta view. Vale desde a 20260742.
--
-- A view existe pra contornar a RLS de `profiles` (que só mostra a própria
-- linha) e por isso roda com `security_invoker = false`, ou seja, com os
-- privilégios do DONO. A 20260742 fez `GRANT SELECT ... TO authenticated` e
-- revogou PUBLIC e anon — mas não revogou o que o Supabase concede por default
-- no schema `public`, que é ALL para `authenticated`.
--
-- E a view é AUTO-ATUALIZÁVEL (information_schema.views.is_updatable = 'YES'):
-- uma view de tabela única cujas colunas são referências simples aceita
-- INSERT/UPDATE/DELETE e repassa pra tabela de baixo. Juntando as duas pontas,
-- qualquer usuário logado podia escrever em `profiles` passando por cima da
-- RLS, direto pelo PostgREST. As colunas expostas incluem `role` e `ativo`:
--   PATCH /rest/v1/perfis_publicos?id=eq.<próprio id>  {"role":"admin"}
-- viraria admin (sou_admin() aceita role='admin'), e um DELETE apagaria o
-- perfil de outra pessoa.
--
-- Nenhum código escreve nessa view: os 12 usos no repo são `.select()`. Então
-- fechar a escrita não muda comportamento nenhum.
--
-- Duas trancas, igual à 20260814:
--   1. o sub-SELECT no FROM tira a auto-atualizabilidade — o Postgres recusa a
--      escrita mesmo que alguém reconceda ALL depois;
--   2. o REVOKE, pra não depender só da forma da consulta.
--
-- Regra pra próxima view assim: `GRANT SELECT` NÃO basta. Toda view com
-- security_invoker = false precisa das duas trancas.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW perfis_publicos AS
  SELECT q.id, q.nome, q.role, q.ativo
  FROM (SELECT p.id, p.nome, p.role, p.ativo FROM profiles p) q;

-- Explícito de propósito: é o que faz a view ignorar a RLS de profiles.
ALTER VIEW perfis_publicos SET (security_invoker = false);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON perfis_publicos FROM authenticated;

REVOKE ALL    ON perfis_publicos FROM PUBLIC;
REVOKE ALL    ON perfis_publicos FROM anon;
GRANT  SELECT ON perfis_publicos TO   authenticated;
