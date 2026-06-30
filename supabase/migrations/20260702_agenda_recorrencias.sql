-- ─────────────────────────────────────────────────────────────────────────────
-- Agendas recorrentes (Fase 2 do módulo de agendamento)
--
-- Substitui a criação manual de horários avulsos por uma regra recorrente
-- semanal (dia da semana + hora), válida indefinidamente até ser desativada.
-- As ocorrências futuras são calculadas em runtime pelo teacher-lookup; uma
-- linha em agenda_horarios só é materializada (e o Meet só é gerado) na
-- primeira reserva daquela semana específica — evita criar eventos/links
-- para datas que talvez nunca sejam reservadas.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agenda_recorrencias (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id   UUID        NOT NULL REFERENCES agenda_reunioes(id) ON DELETE CASCADE,
  dia_semana  SMALLINT    NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=domingo … 6=sábado
  hora        TIME        NOT NULL,
  capacidade  INT         NOT NULL DEFAULT 10 CHECK (capacidade > 0),
  meet_link   TEXT,                                                   -- override manual; senão gerado na 1ª reserva
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agenda_recorrencias IS
  'Regra de horário recorrente semanal de uma agenda coletiva (ex.: toda segunda às 14h), válida até ser desativada.';

CREATE INDEX IF NOT EXISTS idx_agenda_recorrencias_agenda ON agenda_recorrencias (agenda_id);

ALTER TABLE agenda_horarios ADD COLUMN IF NOT EXISTS recorrencia_id UUID REFERENCES agenda_recorrencias(id) ON DELETE CASCADE;

-- Uma recorrência só materializa uma linha por data/hora exata (evita duplicar
-- o evento/Meet quando duas reservas concorrentes caem na mesma semana).
CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_horarios_recorrencia_data
  ON agenda_horarios (recorrencia_id, data_hora) WHERE recorrencia_id IS NOT NULL;

ALTER TABLE agenda_recorrencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_recorrencias_select" ON agenda_recorrencias;
CREATE POLICY "agenda_recorrencias_select" ON agenda_recorrencias FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "agenda_recorrencias_write" ON agenda_recorrencias;
CREATE POLICY "agenda_recorrencias_write" ON agenda_recorrencias FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));
