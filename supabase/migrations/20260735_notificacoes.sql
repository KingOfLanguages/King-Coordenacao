-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2b — Central de avisos in-app (o sino).
--
-- Tabela notificacoes + gatilhos sobre nexus_incidents. Quatro eventos:
--   1. Novo chamado (Desafio)  → responsável
--   2. Chamado Crítico         → toda a coordenação + admins (+ responsável)
--   3. Chamado assumido        → quem registrou (created_by)
--   4. Chamado concluído       → quem registrou (created_by)
--
-- Informe (registro passivo) NÃO gera aviso. Todos os gatilhos são best-effort:
-- um erro na notificação nunca aborta a operação do incidente (bloco EXCEPTION).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notificacoes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,   -- destinatário
  tipo         TEXT        NOT NULL,   -- incidente_novo | incidente_critico | incidente_assumido | incidente_concluido
  titulo       TEXT        NOT NULL,
  corpo        TEXT,
  incidente_id UUID        REFERENCES nexus_incidents(id) ON DELETE CASCADE,
  lida         BOOLEAN     NOT NULL DEFAULT false,
  lida_em      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notificacoes IS
  'Avisos in-app por usuário. Inserido só por triggers SECURITY DEFINER; cada um vê/edita apenas os seus (RLS).';

-- Lista do sino: as não-lidas do usuário, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS idx_notificacoes_user_naolida
  ON notificacoes (user_id, created_at DESC) WHERE lida = false;
CREATE INDEX IF NOT EXISTS idx_notificacoes_user
  ON notificacoes (user_id, created_at DESC);

-- ── RLS: cada um só enxerga/edita/apaga as próprias. Sem policy de INSERT →
--    inserção direta por authenticated é bloqueada; só os triggers (DEFINER) inserem.
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificacoes_select" ON notificacoes;
CREATE POLICY "notificacoes_select" ON notificacoes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notificacoes_update" ON notificacoes;
CREATE POLICY "notificacoes_update" ON notificacoes FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notificacoes_delete" ON notificacoes;
CREATE POLICY "notificacoes_delete" ON notificacoes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── 1+2. AFTER INSERT: novo chamado → responsável; crítico → coordenação+admin ──
CREATE OR REPLACE FUNCTION notificar_incidente_novo() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref     TEXT := NEW.teacher_name;
  v_corpo   TEXT := NEW.problem_type || ' — ' || left(COALESCE(NEW.description, ''), 140);
  v_critico BOOLEAN := (NEW.urgency = 'Crítico');
BEGIN
  BEGIN
    -- Informe é registro passivo — não notifica.
    IF COALESCE(NEW.natureza, 'desafio') = 'informe' THEN
      RETURN NEW;
    END IF;

    -- (1) Responsável fica sabendo do novo chamado (menos se foi ele quem registrou).
    IF NEW.responsavel_id IS NOT NULL AND NEW.responsavel_id IS DISTINCT FROM NEW.created_by THEN
      INSERT INTO notificacoes (user_id, tipo, titulo, corpo, incidente_id)
      VALUES (
        NEW.responsavel_id,
        CASE WHEN v_critico THEN 'incidente_critico' ELSE 'incidente_novo' END,
        CASE WHEN v_critico THEN 'Chamado crítico: ' ELSE 'Novo chamado: ' END || v_ref,
        v_corpo, NEW.id
      );
    END IF;

    -- (2) Crítico escala pra coordenação + admins (menos criador e responsável já avisado).
    IF v_critico THEN
      INSERT INTO notificacoes (user_id, tipo, titulo, corpo, incidente_id)
      SELECT pr.id, 'incidente_critico', 'Chamado crítico: ' || v_ref, v_corpo, NEW.id
      FROM profiles pr
      WHERE pr.ativo = true
        AND (pr.role = 'coordenacao' OR pr.is_admin = true OR pr.role = 'admin')
        AND pr.id IS DISTINCT FROM NEW.created_by
        AND pr.id IS DISTINCT FROM NEW.responsavel_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- best-effort: aviso nunca bloqueia a criação do incidente
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nexus_incidents_notificar_novo ON nexus_incidents;
CREATE TRIGGER nexus_incidents_notificar_novo
  AFTER INSERT ON nexus_incidents
  FOR EACH ROW EXECUTE FUNCTION notificar_incidente_novo();

-- ── 3. AFTER UPDATE OF assumido_por: assumido → quem registrou ──────────────────
CREATE OR REPLACE FUNCTION notificar_incidente_assumido() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nome TEXT;
BEGIN
  BEGIN
    IF NEW.assumido_por IS NOT NULL AND OLD.assumido_por IS NULL
       AND NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM NEW.assumido_por THEN
      SELECT nome INTO v_nome FROM profiles WHERE id = NEW.assumido_por;
      INSERT INTO notificacoes (user_id, tipo, titulo, corpo, incidente_id)
      VALUES (
        NEW.created_by, 'incidente_assumido',
        COALESCE(v_nome, 'Alguém') || ' assumiu seu chamado',
        NEW.teacher_name || ' · ' || NEW.problem_type, NEW.id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nexus_incidents_notificar_assumido ON nexus_incidents;
CREATE TRIGGER nexus_incidents_notificar_assumido
  AFTER UPDATE OF assumido_por ON nexus_incidents
  FOR EACH ROW EXECUTE FUNCTION notificar_incidente_assumido();

-- ── 4. AFTER UPDATE OF resolved: concluído → quem registrou ─────────────────────
CREATE OR REPLACE FUNCTION notificar_incidente_concluido() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF NEW.resolved = true AND OLD.resolved = false
       AND NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
      INSERT INTO notificacoes (user_id, tipo, titulo, corpo, incidente_id)
      VALUES (
        NEW.created_by, 'incidente_concluido',
        'Chamado concluído: ' || NEW.teacher_name,
        COALESCE(NULLIF(left(NEW.solution, 140), ''), NEW.problem_type), NEW.id
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nexus_incidents_notificar_concluido ON nexus_incidents;
CREATE TRIGGER nexus_incidents_notificar_concluido
  AFTER UPDATE OF resolved ON nexus_incidents
  FOR EACH ROW EXECUTE FUNCTION notificar_incidente_concluido();
