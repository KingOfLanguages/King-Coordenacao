-- ─────────────────────────────────────────────────────────────────────────────
-- Incidentes: campo de aluno (texto livre, sempre opcional). Não existe uma
-- entidade "aluno" estruturada no sistema — professor_alunos_kms é só roster
-- (primeiro nome, por LGPD) sincronizado do KMS. Este campo captura o nome
-- do aluno referido no incidente, com ou sem professor vinculado.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE nexus_incidents ADD COLUMN IF NOT EXISTS aluno_nome TEXT;
