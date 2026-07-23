-- ─────────────────────────────────────────────────────────────────────────────
-- perfis_publicos — nome do time interno legível por qualquer autenticado
--
-- Problema: a policy de SELECT de `profiles` é ((id = auth.uid()) OR sou_admin()),
-- então quem é `suporte` enxerga só a própria linha. Todo join feito pra mostrar
-- "quem é o coordenador responsável" volta NULL silenciosamente — é por isso que
-- Buscar Reuniões mostrava "Coordenador: —" pro Suporte mesmo com
-- reunioes.coordenador_id preenchido corretamente (o daily-import atribui o
-- coordenador pela agenda/calendário em que o evento aparece, e o create-booking
-- pelo dono da agenda de grupo — o dado sempre esteve certo, faltava conseguir
-- ler o nome).
--
-- Em vez de afrouxar a policy de `profiles` (que carrega e-mail de login,
-- google_email e as flags de permissão is_admin/is_lider), exponho uma view com
-- só o necessário pra identificar uma pessoa do time.
--
-- A view roda com os privilégios do dono (postgres, security_invoker = false),
-- por isso não é barrada pela RLS de profiles. Só `authenticated` recebe SELECT:
-- os portais públicos (/agendar, /pausa, /welcome-path, que usam `anon` e Edge
-- Functions com service-role) continuam sem acesso.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW perfis_publicos AS
  SELECT id, nome, role, ativo
  FROM profiles;

-- Explícito de propósito: é o que faz a view ignorar a RLS de profiles.
ALTER VIEW perfis_publicos SET (security_invoker = false);

COMMENT ON VIEW perfis_publicos IS
  'Nome e cargo do time interno, sem dados sensíveis, legível por qualquer usuário autenticado. Use no lugar de profiles quando só precisar exibir de quem é a responsabilidade — profiles continua restrito à própria linha ou admin.';

REVOKE ALL ON perfis_publicos FROM PUBLIC;
REVOKE ALL ON perfis_publicos FROM anon;
GRANT SELECT ON perfis_publicos TO authenticated;
