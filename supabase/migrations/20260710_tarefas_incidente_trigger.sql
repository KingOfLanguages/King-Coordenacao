-- ─────────────────────────────────────────────────────────────────────────────
-- Objetivo: automatizar criação de tarefas ao assumir um incidente e
-- concluir tarefa ao resolver o incidente.
--
-- Modelagem: tarefas.incidente_id (FK → nexus_incidents), tipo='incidente'
-- Triggers:
--   1. Quando assumido_por muda de NULL → usuário: cria tarefa pra assumido_por
--   2. Quando resolved muda de false → true: marca tarefa como concluida
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Adicionar coluna incidente_id em tarefas
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS incidente_id UUID UNIQUE REFERENCES nexus_incidents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tarefas_incidente_id ON tarefas (incidente_id)
  WHERE incidente_id IS NOT NULL;

COMMENT ON COLUMN tarefas.incidente_id IS
  'Referência ao incidente que originou a tarefa (criada automaticamente ao assumir).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger: criar tarefa ao assumir incidente
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION criar_tarefa_ao_assumir_incidente()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Só cria se assumido_por acabou de mudar de NULL para não-NULL
  IF NEW.assumido_por IS NOT NULL AND OLD.assumido_por IS NULL THEN
    -- Insere tarefa atribuída à pessoa que assumiu.
    -- ON CONFLICT: se o incidente já teve tarefa (foi devolvido a "Aberto" e
    -- reassumido), reaponta pra quem assumiu agora em vez de estourar o UNIQUE
    -- (o que abortaria o UPDATE do incidente inteiro). Uma tarefa por incidente.
    INSERT INTO tarefas (
      titulo,
      descricao,
      criado_por,
      atribuido_a,
      incidente_id,
      status,
      created_at
    ) VALUES (
      'Resolver incidente: ' || COALESCE(NEW.description, '(sem descrição)'),
      'Problema: ' || COALESCE(NEW.problem_type, '') ||
      CASE WHEN NEW.aluno_nome IS NOT NULL THEN ' | Aluno: ' || NEW.aluno_nome ELSE '' END ||
      CASE WHEN NEW.urgency IS NOT NULL THEN ' | Urgência: ' || NEW.urgency ELSE '' END,
      NEW.assumido_por,  -- SECURITY DEFINER: INSERT roda como owner, ignora RLS de tarefas
      NEW.assumido_por,  -- Atribuído a quem assumiu
      NEW.id,
      'aberto',
      NOW()
    )
    ON CONFLICT (incidente_id) DO UPDATE
      SET atribuido_a = EXCLUDED.atribuido_a;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nexus_incidents_criar_tarefa ON nexus_incidents;
CREATE TRIGGER nexus_incidents_criar_tarefa
  AFTER UPDATE OF assumido_por ON nexus_incidents
  FOR EACH ROW
  EXECUTE FUNCTION criar_tarefa_ao_assumir_incidente();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger: concluir tarefa ao resolver incidente
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION concluir_tarefa_ao_resolver_incidente()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Só conclui se resolved mudou de false → true
  IF NEW.resolved = true AND OLD.resolved = false THEN
    UPDATE tarefas
    SET status = 'concluido',
        concluido_em = NOW(),
        concluido_por = auth.uid()  -- Quem fez a resolução
    WHERE incidente_id = NEW.id AND status = 'aberto';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nexus_incidents_concluir_tarefa ON nexus_incidents;
CREATE TRIGGER nexus_incidents_concluir_tarefa
  AFTER UPDATE OF resolved ON nexus_incidents
  FOR EACH ROW
  EXECUTE FUNCTION concluir_tarefa_ao_resolver_incidente();
