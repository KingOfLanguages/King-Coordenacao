-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2a — Responsável do incidente.
--
-- Hoje o incidente tem 3 "pessoas", nenhuma delas o dono:
--   coordinator   TEXT  — quem DIGITOU (nome, não FK)
--   created_by    UUID  — quem criou (FK, auditoria)
--   assumido_por  UUID  — quem está RESOLVENDO agora (só depois de assumir)
-- Falta o "responsável": quem DEVE cuidar do chamado desde que ele nasce.
--
-- Regra: incidente de professor herda o coordenador daquele professor
-- (professores.coordenador_id, definido pelo grupo — ver 20260628_ktm_foundation).
-- Incidente geral/plataforma nasce sem responsável (ninguém dono por padrão).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE nexus_incidents
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN nexus_incidents.responsavel_id IS
  'Dono do chamado (quem deve cuidar). Default = coordenador do professor. Distinto de assumido_por (quem está resolvendo) e created_by (quem digitou).';

CREATE INDEX IF NOT EXISTS idx_nexus_incidents_responsavel
  ON nexus_incidents (responsavel_id) WHERE responsavel_id IS NOT NULL;

-- ── Backfill: incidentes de professor herdam o coordenador atual do professor ──
UPDATE nexus_incidents ni
   SET responsavel_id = p.coordenador_id
  FROM professores p
 WHERE ni.professor_id = p.id
   AND ni.responsavel_id IS NULL
   AND p.coordenador_id IS NOT NULL;

-- ── Trigger: ao criar, herda o coordenador do professor se não veio explícito ──
-- SECURITY DEFINER + search_path: lê professores sem depender da RLS do chamador
-- (professores hoje é world-readable p/ authenticated, mas fica robusto a mudanças).
CREATE OR REPLACE FUNCTION set_responsavel_incidente() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.responsavel_id IS NULL AND NEW.professor_id IS NOT NULL THEN
    NEW.responsavel_id := (SELECT coordenador_id FROM professores WHERE id = NEW.professor_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nexus_incidents_set_responsavel ON nexus_incidents;
CREATE TRIGGER nexus_incidents_set_responsavel
  BEFORE INSERT ON nexus_incidents
  FOR EACH ROW EXECUTE FUNCTION set_responsavel_incidente();
