-- ─────────────────────────────────────────────────────────────────────────────
-- Cargo RH (22/10/2026)
--
-- O RH passa a cuidar de quem faz o Welcome Path (grupo de controle). O cargo
-- novo vê só a área da trilha; o que ele pode fazer lá entra na 20260810.
--
-- Sozinho no arquivo de propósito, como o 'comercial' (20260767): o Postgres
-- cria o valor do enum mas proíbe usá-lo na mesma transação.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE role_usuario ADD VALUE IF NOT EXISTS 'rh';
