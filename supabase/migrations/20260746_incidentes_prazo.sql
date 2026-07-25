-- ─────────────────────────────────────────────────────────────────────────────
-- Prazo de resolução (SLA) dos incidentes.
--
-- prazo_resolucao: data-limite pra resolver o incidente. Preenchida na criação
-- (sugerida pela urgência, mas editável — ver src/lib/incidentePrazo.ts) e usada
-- pra sinalizar "vence em X" / "vencido há X" na listagem e no calendário da
-- aba Agenda de Tarefas.
--
-- Coluna nullable e aditiva: o nexus-sync (upsert por colunas conhecidas) segue
-- funcionando, e linhas sem prazo simplesmente não mostram o selo. Sem policy
-- nova — os fluxos de escrita já existentes (useCriarIncidente/useAtualizarIncidente)
-- passam pela mesma RLS de nexus_incidents; só gravam mais uma coluna.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE nexus_incidents
  ADD COLUMN IF NOT EXISTS prazo_resolucao timestamptz;

-- Backfill só dos que ainda estão abertos: prazo = created_at + N dias, N pela
-- urgência (mesmo mapa de src/lib/incidentePrazo.ts). Resolvidos ficam sem prazo
-- retroativo (não faz sentido cobrar SLA de quem já foi fechado).
UPDATE nexus_incidents
SET prazo_resolucao = created_at + (
  CASE urgency
    WHEN 'Alta'    THEN interval '1 day'
    WHEN 'Crítico' THEN interval '1 day'
    WHEN 'Crítica' THEN interval '1 day'
    WHEN 'Média'   THEN interval '3 days'
    WHEN 'Baixa'   THEN interval '7 days'
    ELSE interval '3 days'
  END
)
WHERE resolved = false
  AND prazo_resolucao IS NULL;
