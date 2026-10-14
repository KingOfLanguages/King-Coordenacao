-- ─────────────────────────────────────────────────────────────────────────────
-- Chamado no Bitrix a partir de um incidente (2026-10-14).
--
-- Incidente de prioridade Média, Alta ou Urgente pode virar uma tarefa no
-- Bitrix24 para a equipe de suporte ao aluno. Quem cria é a Edge Function
-- bitrix-chamado, com o webhook do Bitrix guardado como segredo
-- (BITRIX_WEBHOOK_URL) — nunca no navegador, o repositório é público.
--
-- 1. incidente_chamados_bitrix: um chamado por incidente (a chave primária é
--    o incidente). A linha nasce ANTES da tarefa, com bitrix_task_id NULL, e
--    serve de trava: dois cliques ao mesmo tempo não abrem dois chamados. Se o
--    Bitrix recusar, a função apaga a linha.
--    Leitura: quem trabalha incidentes. Escrita: só a função (service_role).
--
-- 2. profiles.bitrix_user_id: quem a pessoa é no Bitrix. Quem abre o chamado
--    entra sempre como observador; a função descobre pelo e-mail e, sem
--    correspondência, a pessoa escolhe uma vez e fica gravado.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bitrix_user_id INTEGER;
COMMENT ON COLUMN profiles.bitrix_user_id IS
  'ID do usuário no Bitrix24. Quem abre chamado a partir de incidente entra como observador. Gravado pela Edge Function bitrix-chamado.';

CREATE TABLE IF NOT EXISTS incidente_chamados_bitrix (
  incidente_id          UUID        PRIMARY KEY REFERENCES nexus_incidents(id) ON DELETE CASCADE,
  -- NULL enquanto a tarefa está sendo criada no Bitrix.
  bitrix_task_id        BIGINT      UNIQUE,
  bitrix_url            TEXT,
  responsavel_bitrix_id INTEGER     NOT NULL,
  responsavel_nome      TEXT        NOT NULL,
  -- [{ "id": 51, "nome": "Flávia Karolayne" }, …] — como foi aberto.
  observadores          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  aberto_por            UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  aberto_em             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE incidente_chamados_bitrix IS
  'Chamado (tarefa do Bitrix24) aberto a partir de um incidente. Escrita só pela Edge Function bitrix-chamado.';

ALTER TABLE incidente_chamados_bitrix ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON incidente_chamados_bitrix FROM anon;

DROP POLICY IF EXISTS "incidente_chamados_bitrix_select" ON incidente_chamados_bitrix;
CREATE POLICY "incidente_chamados_bitrix_select" ON incidente_chamados_bitrix FOR SELECT TO authenticated
  USING (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte','suporte_aluno']::role_usuario[]));
