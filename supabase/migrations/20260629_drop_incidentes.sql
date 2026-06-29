-- ─────────────────────────────────────────────────────────────────────────────
-- Atualização de escopo: foco apenas em gestão de reuniões.
-- Remove o módulo de Incidentes (Incidentes / Mês de Análise / Relatórios).
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS incidentes CASCADE;

-- Tipos enum usados apenas pelo módulo de incidentes (se existirem como ENUM).
DROP TYPE IF EXISTS status_incidente;
DROP TYPE IF EXISTS urgencia_nivel;
