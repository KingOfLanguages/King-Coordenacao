-- ─────────────────────────────────────────────────────────────────────────────
-- Kanban de tarefas (2026-07-18): 3º estado "em_andamento" + sync bidirecional
-- tarefa ↔ incidente.
--
-- Antes: tarefas.status era só 'aberto'/'concluido'. Para o quadro Kanban
-- (Aberto · Em andamento · Concluído) e o acompanhamento do andamento até a
-- resolução, adicionamos 'em_andamento'.
--
-- Sync (fonte única de verdade = o incidente, para tarefas com incidente_id):
--   • assumir incidente  (assumido_por NULL→X)  → tarefa vira 'em_andamento'
--   • largar incidente   (assumido_por X→NULL)  → tarefa volta a 'aberto'
--   • resolver incidente (resolved false→true)  → tarefa 'concluido'
--   • reabrir incidente  (resolved true→false)  → tarefa volta (em_andamento se
--                                                 ainda assumido, senão aberto)
-- O caminho inverso (mover o card no Kanban) é feito no front chamando as
-- ações de incidente (assumir/largar/resolver), que disparam estes triggers.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. CHECK de status aceita 'em_andamento' (remove qualquer check antigo) ────
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'tarefas'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE tarefas DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE tarefas
  ADD CONSTRAINT tarefas_status_check CHECK (status IN ('aberto', 'em_andamento', 'concluido'));

-- ── 1b. Backfill: tarefas de incidentes já assumidos (e não resolvidos) que o
-- trigger antigo criou como 'aberto' passam a refletir "Em andamento". ─────────
UPDATE tarefas t
SET status = 'em_andamento'
FROM nexus_incidents i
WHERE t.incidente_id = i.id
  AND t.status = 'aberto'
  AND i.assumido_por IS NOT NULL
  AND i.resolved = false;

-- ── 2. Assumir/largar incidente → status da tarefa ────────────────────────────
CREATE OR REPLACE FUNCTION criar_tarefa_ao_assumir_incidente()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.assumido_por IS NOT NULL AND OLD.assumido_por IS NULL THEN
    -- Assumiu → cria a tarefa (uma por incidente) já em "Em andamento",
    -- atribuída a quem assumiu. Se já existia (reassumida), reaponta + reativa.
    INSERT INTO tarefas (titulo, descricao, criado_por, atribuido_a, incidente_id, status, created_at)
    VALUES (
      'Resolver incidente: ' || COALESCE(NEW.description, '(sem descrição)'),
      'Problema: ' || COALESCE(NEW.problem_type, '') ||
      CASE WHEN NEW.aluno_nome IS NOT NULL THEN ' | Aluno: ' || NEW.aluno_nome ELSE '' END ||
      CASE WHEN NEW.urgency IS NOT NULL THEN ' | Urgência: ' || NEW.urgency ELSE '' END,
      NEW.assumido_por,
      NEW.assumido_por,
      NEW.id,
      'em_andamento',
      NOW()
    )
    ON CONFLICT (incidente_id) DO UPDATE
      SET atribuido_a = EXCLUDED.atribuido_a,
          status = 'em_andamento',
          concluido_em = NULL,
          concluido_por = NULL;

  ELSIF NEW.assumido_por IS NULL AND OLD.assumido_por IS NOT NULL AND NEW.resolved = false THEN
    -- Largou (e o incidente não está resolvido) → tarefa volta pra "Aberto".
    UPDATE tarefas
    SET status = 'aberto'
    WHERE incidente_id = NEW.id AND status <> 'concluido';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. Resolver/reabrir incidente → status da tarefa ──────────────────────────
CREATE OR REPLACE FUNCTION concluir_tarefa_ao_resolver_incidente()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.resolved = true AND OLD.resolved = false THEN
    UPDATE tarefas
    SET status = 'concluido',
        concluido_em = NOW(),
        concluido_por = COALESCE(auth.uid(), NEW.assumido_por)
    WHERE incidente_id = NEW.id AND status <> 'concluido';

  ELSIF NEW.resolved = false AND OLD.resolved = true THEN
    -- Reabriu o incidente → tarefa volta: "Em andamento" se ainda assumido, senão "Aberto".
    UPDATE tarefas
    SET status = CASE WHEN NEW.assumido_por IS NOT NULL THEN 'em_andamento' ELSE 'aberto' END,
        concluido_em = NULL,
        concluido_por = NULL
    WHERE incidente_id = NEW.id AND status = 'concluido';
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers já existem (20260710); os CREATE OR REPLACE acima atualizam as funções.
-- Recriamos por garantia (idempotente) caso a migration 20260710 não tenha rodado.
DROP TRIGGER IF EXISTS nexus_incidents_criar_tarefa ON nexus_incidents;
CREATE TRIGGER nexus_incidents_criar_tarefa
  AFTER UPDATE OF assumido_por ON nexus_incidents
  FOR EACH ROW EXECUTE FUNCTION criar_tarefa_ao_assumir_incidente();

DROP TRIGGER IF EXISTS nexus_incidents_concluir_tarefa ON nexus_incidents;
CREATE TRIGGER nexus_incidents_concluir_tarefa
  AFTER UPDATE OF resolved ON nexus_incidents
  FOR EACH ROW EXECUTE FUNCTION concluir_tarefa_ao_resolver_incidente();
