-- ─────────────────────────────────────────────────────────────────────────────
-- Central de Convocações — fila enxuta de convocação de REUNIÃO (Kanban de 4
-- etapas). O outro fluxo (agendas bloqueadas) NÃO tem tabela: é derivado da API
-- King / Central de Pendências ([[ktm-deteccao-silencio-project]]) em tempo real.
--
-- Auto-criação só nos sinais fortes, com dedup (1 convocação aberta por professor),
-- pra não inundar o board:
--   • incidente com natureza='desafio'  → origem 'incidente'
--   • observação tipo='feedback_negativo' → origem 'feedback'
-- Os demais casos (observação comum, reunião periódica, solicitação da coordenação)
-- entram pelo botão "Nova convocação".
--
-- Aditivo: NÃO altera incidentes/observações — só dispara um INSERT no board, e
-- qualquer falha do gatilho é engolida (RAISE WARNING) pra nunca quebrar a criação
-- do incidente/observação.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS convocacoes (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id       UUID        NOT NULL REFERENCES professores(id)      ON DELETE CASCADE,
  origem             TEXT        NOT NULL DEFAULT 'coordenacao'
                                 CHECK (origem IN ('incidente','observacao','feedback','periodica','coordenacao')),
  motivo             TEXT,
  etapa              TEXT        NOT NULL DEFAULT 'pendente_contato'
                                 CHECK (etapa IN ('pendente_contato','aguardando_resposta','agendada','realizada')),
  coordenador_id     UUID        REFERENCES profiles(id)        ON DELETE SET NULL,
  incidente_id       UUID        REFERENCES nexus_incidents(id) ON DELETE SET NULL,
  observacao_id      UUID        REFERENCES observacoes(id)     ON DELETE SET NULL,
  reuniao_id         UUID        REFERENCES reunioes(id)        ON DELETE SET NULL,
  ultima_mensagem_em TIMESTAMPTZ,
  criado_por         UUID        REFERENCES profiles(id)        ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluida_em       TIMESTAMPTZ
);

COMMENT ON TABLE convocacoes IS
  'Central de Convocações: fila Kanban de convocação de reunião. Agendas bloqueadas vêm da API King, não daqui.';

CREATE INDEX IF NOT EXISTS idx_convocacoes_professor ON convocacoes (professor_id);
CREATE INDEX IF NOT EXISTS idx_convocacoes_etapa     ON convocacoes (etapa);
-- Dedup: no máximo UMA convocação aberta (não realizada) por professor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_convocacoes_aberta_unica
  ON convocacoes (professor_id) WHERE etapa <> 'realizada';

ALTER TABLE convocacoes ENABLE ROW LEVEL SECURITY;

-- Board visível a qualquer logado; escrita = coordenacao/suporte/admin.
DROP POLICY IF EXISTS "convocacoes_select" ON convocacoes;
CREATE POLICY "convocacoes_select" ON convocacoes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "convocacoes_write" ON convocacoes;
CREATE POLICY "convocacoes_write" ON convocacoes FOR ALL TO authenticated
  USING      (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]))
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));

-- ── BEFORE INSERT/UPDATE: preenche coordenador do professor + timestamps ──────
CREATE OR REPLACE FUNCTION convocacoes_biu() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.coordenador_id IS NULL THEN
    SELECT coordenador_id INTO NEW.coordenador_id FROM professores WHERE id = NEW.professor_id;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := NOW();
    IF NEW.etapa = 'realizada' AND OLD.etapa IS DISTINCT FROM 'realizada' THEN
      NEW.concluida_em := NOW();
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_convocacoes_biu ON convocacoes;
CREATE TRIGGER trg_convocacoes_biu BEFORE INSERT OR UPDATE ON convocacoes
  FOR EACH ROW EXECUTE FUNCTION convocacoes_biu();

-- ── Helper de auto-criação (SECURITY DEFINER: roda mesmo se quem cria o incidente
--    não tiver write em convocacoes; dedup por professor) ──────────────────────
CREATE OR REPLACE FUNCTION criar_convocacao_auto(
  p_professor_id UUID, p_origem TEXT, p_motivo TEXT, p_criado_por UUID,
  p_incidente_id UUID DEFAULT NULL, p_observacao_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_professor_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM convocacoes WHERE professor_id = p_professor_id AND etapa <> 'realizada') THEN
    RETURN;  -- já tem uma aberta
  END IF;
  INSERT INTO convocacoes (professor_id, origem, motivo, incidente_id, observacao_id, criado_por)
  VALUES (p_professor_id, p_origem, p_motivo, p_incidente_id, p_observacao_id, p_criado_por);
EXCEPTION
  WHEN unique_violation THEN NULL;  -- corrida: outra convocação abriu no meio
END; $$;

-- Incidente natureza='desafio' → convocação
CREATE OR REPLACE FUNCTION trg_incidente_convocacao() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.natureza = 'desafio' AND NEW.professor_id IS NOT NULL THEN
    PERFORM criar_convocacao_auto(NEW.professor_id, 'incidente', NEW.problem_type, NEW.created_by, NEW.id, NULL);
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'trg_incidente_convocacao: %', SQLERRM;
    RETURN NEW;  -- nunca quebra a criação do incidente
END; $$;
DROP TRIGGER IF EXISTS trg_incidente_convocacao ON nexus_incidents;
CREATE TRIGGER trg_incidente_convocacao AFTER INSERT ON nexus_incidents
  FOR EACH ROW EXECUTE FUNCTION trg_incidente_convocacao();

-- Observação feedback_negativo → convocação
CREATE OR REPLACE FUNCTION trg_observacao_convocacao() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tipo = 'feedback_negativo' AND NEW.professor_id IS NOT NULL THEN
    PERFORM criar_convocacao_auto(NEW.professor_id, 'feedback', 'Feedback negativo', NEW.coordenador_id, NULL, NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'trg_observacao_convocacao: %', SQLERRM;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_observacao_convocacao ON observacoes;
CREATE TRIGGER trg_observacao_convocacao AFTER INSERT ON observacoes
  FOR EACH ROW EXECUTE FUNCTION trg_observacao_convocacao();
