-- ─────────────────────────────────────────────────────────────────────────────
-- Identidade dos portais do professor por CÓDIGO NO E-MAIL (2026-10-06).
--
-- Resposta ao pentest de 05/10/2026 (C-1, C-2, M-1). Até aqui os 4 portais
-- públicos (/welcome-path, /pausa, /transferencia, /agendar) identificavam o
-- professor pelo e-mail OU pelo nome completo e já confiavam nisso: o nome é
-- público, então qualquer pessoa operava como qualquer professor — e o passo
-- "cadastre seu e-mail" ainda gravava um e-mail novo sem prova nenhuma.
--
-- Agora o nome/e-mail só LOCALIZAM o cadastro. A sessão nasce quando o
-- professor digita o código de 6 dígitos que mandamos para o e-mail OFICIAL dele
-- (o que veio da API do KMS). A sessão vale para os 4 portais.
--
--   portal_codigos     um código por pedido; guarda só o SHA-256, expira em
--                      10 min, 5 tentativas.
--   portal_sessoes     token opaco (só o SHA-256), validade deslizante de 14
--                      dias com teto absoluto de 30.
--   portal_tentativas  rastro por IP para o limite de pedidos (sem isso o
--                      envio de código vira bomba de e-mail).
--
-- Só a service_role toca: RLS ligado e nenhuma policy.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_codigos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id   UUID        NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  codigo_hash    TEXT        NOT NULL,
  email_destino  TEXT        NOT NULL,
  expira_em      TIMESTAMPTZ NOT NULL,
  tentativas     INT         NOT NULL DEFAULT 0,
  usado_em       TIMESTAMPTZ,
  ip             TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE portal_codigos IS
  'Códigos de acesso dos portais do professor (hash SHA-256). Edge function portal-identidade. Só service_role.';

CREATE INDEX IF NOT EXISTS idx_portal_codigos_professor ON portal_codigos (professor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_codigos_expira    ON portal_codigos (expira_em);

CREATE TABLE IF NOT EXISTS portal_sessoes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id   UUID        NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  token_hash     TEXT        NOT NULL UNIQUE,
  expira_em      TIMESTAMPTZ NOT NULL,
  expira_max_em  TIMESTAMPTZ NOT NULL,
  ultimo_uso_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip             TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE portal_sessoes IS
  'Sessões dos portais do professor, criadas só depois do código por e-mail. Token guardado como SHA-256. Só service_role.';

CREATE INDEX IF NOT EXISTS idx_portal_sessoes_professor ON portal_sessoes (professor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_sessoes_expira    ON portal_sessoes (expira_em);

CREATE TABLE IF NOT EXISTS portal_tentativas (
  id          BIGSERIAL   PRIMARY KEY,
  ip          TEXT        NOT NULL,
  acao        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE portal_tentativas IS
  'Rastro por IP dos pedidos aos portais (limite de taxa). Limpo pelo cron king-portal-limpeza. Só service_role.';

CREATE INDEX IF NOT EXISTS idx_portal_tentativas_ip ON portal_tentativas (ip, acao, created_at DESC);

ALTER TABLE portal_codigos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sessoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_tentativas ENABLE ROW LEVEL SECURITY;


-- ── Troca do e-mail oficial derruba tudo ─────────────────────────────────────
-- Se o KMS (ou a coordenação) troca o e-mail do professor, quem entrou pelo
-- e-mail antigo não pode continuar dentro.
CREATE OR REPLACE FUNCTION portal_revogar_por_troca_email() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  DELETE FROM portal_sessoes WHERE professor_id = NEW.id;
  DELETE FROM portal_codigos WHERE professor_id = NEW.id AND usado_em IS NULL;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION portal_revogar_por_troca_email() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_portal_revogar_por_troca_email ON professores;
CREATE TRIGGER trg_portal_revogar_por_troca_email
  AFTER UPDATE OF email ON professores
  FOR EACH ROW
  WHEN (lower(trim(coalesce(OLD.email, ''))) IS DISTINCT FROM lower(trim(coalesce(NEW.email, ''))))
  EXECUTE FUNCTION portal_revogar_por_troca_email();


-- ── Faxina diária ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION portal_limpeza() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  DELETE FROM portal_codigos    WHERE expira_em < NOW() - INTERVAL '1 day';
  DELETE FROM portal_sessoes    WHERE expira_em < NOW() OR expira_max_em < NOW();
  DELETE FROM portal_tentativas WHERE created_at < NOW() - INTERVAL '2 days';
$fn$;

REVOKE ALL ON FUNCTION portal_limpeza() FROM PUBLIC;

SELECT cron.unschedule('king-portal-limpeza')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-portal-limpeza');

SELECT cron.schedule(
  'king-portal-limpeza',
  '30 6 * * *',
  $cron$ SELECT portal_limpeza(); $cron$
);


-- ── Sessões antigas do Welcome Path ──────────────────────────────────────────
-- Foram emitidas sem prova de posse do e-mail (inclusive as do pentest). Todo
-- mundo entra de novo, agora pelo código. A tabela fica vazia e sem uso; sai
-- numa limpeza futura.
DELETE FROM welcome_path_sessoes;
