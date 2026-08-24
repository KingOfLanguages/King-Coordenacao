-- ─────────────────────────────────────────────────────────────────────────────
-- Novo cargo: 'comercial'.
--
-- O setor comercial precisa responder uma pergunta antes de indicar/alocar um
-- professor: "esse teacher é confiável?". Ganha uma tela só sua (/confiabilidade)
-- com o histórico dos últimos 3 meses e o botão de registrar incidente.
--
-- Fica NESTE arquivo sozinho de propósito: ALTER TYPE ... ADD VALUE cria o valor
-- na transação atual, mas o Postgres não deixa USAR o valor novo na mesma
-- transação. Como o supabase db push roda um arquivo por transação, as policies
-- que citam 'comercial'::role_usuario precisam vir na migration seguinte
-- (20260768) — juntas aqui, quebrariam com "unsafe use of new value".
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE role_usuario ADD VALUE IF NOT EXISTS 'comercial';
