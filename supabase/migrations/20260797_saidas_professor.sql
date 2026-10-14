-- ─────────────────────────────────────────────────────────────────────────────
-- Saída de professor (2026-10-14).
--
-- O professor avisa que vai sair → alguém da equipe aperta "Solicitou saída"
-- na ficha dele, anota a data que ele disse (pode estar longe) e manda a
-- mensagem padrão com o link do formulário de desligamento do King. Daí em
-- diante o pedido fica na Minha Área de TODA a equipe de qualidade
-- (coordenação + suporte ao professor) até alguém confirmar o desfecho:
--
--   concluida + quem_finalizou = 'professor'  o próprio professor preencheu o
--                                             formulário do King
--   concluida + quem_finalizou = 'equipe'     chegou a data e ele não fez; nós
--                                             fizemos o desligamento
--   cancelada                                 desistiu / registrado por engano
--
-- Nada aqui mexe em professores.status: quem desliga é o King, e o kms-api-sync
-- traz o 'desligado' (com desligado_em). A tela usa isso só como pista para a
-- confirmação.
--
-- data_saida NULL = o professor ainda não disse a data. A mensagem padrão dá a
-- ele 1 dia útil para informar; a tela conta o prazo a partir daí.
--
-- Ler e escrever: coordenação, suporte e admin (o canEdit do front). Os campos
-- de autoria e de encerramento são carimbados pelo gatilho, não pelo cliente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saidas_professor (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id      UUID        NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  -- Último dia que o professor informou. NULL = ainda não informou.
  data_saida        DATE,
  observacao        TEXT        CHECK (observacao IS NULL OR char_length(observacao) <= 2000),
  status            TEXT        NOT NULL DEFAULT 'aguardando'
                                CHECK (status IN ('aguardando', 'concluida', 'cancelada')),
  quem_finalizou    TEXT        CHECK (quem_finalizou IN ('professor', 'equipe')),
  nota_encerramento TEXT        CHECK (nota_encerramento IS NULL OR char_length(nota_encerramento) <= 2000),
  registrado_por    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ,
  encerrada_por     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  encerrada_em      TIMESTAMPTZ,
  -- Concluída sempre diz quem fez; aberta ou cancelada nunca diz.
  CONSTRAINT saidas_professor_desfecho CHECK ((status = 'concluida') = (quem_finalizou IS NOT NULL))
);

COMMENT ON TABLE saidas_professor IS
  'Pedidos de saída de professor registrados pela equipe. Ficam na Minha Área da coordenação e do suporte até a confirmação (professor concluiu / equipe concluiu / cancelada).';
COMMENT ON COLUMN saidas_professor.data_saida IS
  'Último dia informado pelo professor. NULL = ainda não informou (a mensagem padrão dá 1 dia útil).';
COMMENT ON COLUMN saidas_professor.quem_finalizou IS
  'professor = ele mesmo preencheu o desligamento no King; equipe = não fez até a data e nós fizemos.';

-- Um pedido aberto por professor.
CREATE UNIQUE INDEX IF NOT EXISTS saidas_professor_uma_aberta
  ON saidas_professor (professor_id) WHERE status = 'aguardando';
CREATE INDEX IF NOT EXISTS idx_saidas_professor_professor
  ON saidas_professor (professor_id, created_at DESC);

-- ── Carimbos ─────────────────────────────────────────────────────────────────
-- Autor e encerramento vêm da sessão (auth.uid()), não do que o cliente manda.
-- Sem sessão (SQL direto, service_role) os valores informados passam.
CREATE OR REPLACE FUNCTION saidas_professor_carimbar() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.registrado_por := COALESCE(auth.uid(), NEW.registrado_por);
    NEW.created_at     := NOW();
    NEW.status         := 'aguardando';
    NEW.quem_finalizou := NULL;
    NEW.nota_encerramento := NULL;
    NEW.encerrada_por  := NULL;
    NEW.encerrada_em   := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: o pedido continua sendo do mesmo professor e de quem registrou.
  NEW.professor_id   := OLD.professor_id;
  NEW.registrado_por := OLD.registrado_por;
  NEW.created_at     := OLD.created_at;
  NEW.updated_at     := NOW();

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'aguardando' THEN
      NEW.quem_finalizou := NULL;
      NEW.nota_encerramento := NULL;
      NEW.encerrada_por  := NULL;
      NEW.encerrada_em   := NULL;
    ELSE
      NEW.encerrada_por  := COALESCE(auth.uid(), NEW.encerrada_por);
      NEW.encerrada_em   := NOW();
    END IF;
  ELSE
    NEW.encerrada_por  := OLD.encerrada_por;
    NEW.encerrada_em   := OLD.encerrada_em;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saidas_professor_carimbar ON saidas_professor;
CREATE TRIGGER trg_saidas_professor_carimbar
  BEFORE INSERT OR UPDATE ON saidas_professor
  FOR EACH ROW EXECUTE FUNCTION saidas_professor_carimbar();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE saidas_professor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON saidas_professor FROM anon;

DROP POLICY IF EXISTS "saidas_professor_select" ON saidas_professor;
CREATE POLICY "saidas_professor_select" ON saidas_professor FOR SELECT TO authenticated
  USING (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));

DROP POLICY IF EXISTS "saidas_professor_insert" ON saidas_professor;
CREATE POLICY "saidas_professor_insert" ON saidas_professor FOR INSERT TO authenticated
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));

DROP POLICY IF EXISTS "saidas_professor_update" ON saidas_professor;
CREATE POLICY "saidas_professor_update" ON saidas_professor FOR UPDATE TO authenticated
  USING (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]))
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));

-- Sem DELETE: pedido errado vira 'cancelada' e fica no histórico.
