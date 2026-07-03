-- ─────────────────────────────────────────────────────────────────────────────
-- KTM — Fluxo de dados do King Nexus (ocorrências + tracking de professor)
--
-- Tabelas-espelho do Supabase do King Nexus (app Lovable de gestão de
-- ocorrências, ref ffsydgugewvboicvwhzu), preenchidas pela Edge Function
-- nexus-sync via pg_cron. O Nexus continua sendo o sistema de escrita; aqui
-- os dados são somente leitura — nenhuma policy de INSERT/UPDATE/DELETE,
-- só a service role (que ignora RLS) escreve.
--
-- Vínculo com nossos professores: no Nexus o professor é texto livre
-- (teacher_name / canonical_name). O nexus-sync faz name-match normalizado
-- (sem acentos, caixa baixa) contra professores.nome e preenche professor_id
-- quando o match é inequívoco; ambíguos/desconhecidos ficam NULL e aparecem
-- no relatório da função para revisão manual.
--
-- PKs = os mesmos UUIDs do Nexus (chave de idempotência do upsert e o que
-- permite manter os FKs entre os espelhos idênticos aos da origem).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Ocorrências ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nexus_incidents (
  id              UUID        PRIMARY KEY,             -- id original no Nexus
  teacher_name    TEXT        NOT NULL,
  coordinator     TEXT        NOT NULL,                 -- nome livre de quem registrou
  problem_type    TEXT        NOT NULL,                 -- Suporte, Didático, Aluno, No-Show...
  urgency         TEXT        NOT NULL,                 -- Baixa | Média | Alta
  description     TEXT        NOT NULL,
  solution        TEXT        NOT NULL DEFAULT '',
  needs_follow_up BOOLEAN     NOT NULL DEFAULT false,
  resolved        BOOLEAN     NOT NULL DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  under_analysis  BOOLEAN     NOT NULL DEFAULT false,
  incident_mode   TEXT        NOT NULL DEFAULT 'professor',  -- professor | interno
  image_urls      TEXT[]      NOT NULL DEFAULT '{}',    -- paths no storage do Nexus
  created_at      TIMESTAMPTZ NOT NULL,
  professor_id    UUID        REFERENCES professores(id) ON DELETE SET NULL,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  nexus_incidents              IS 'Espelho de incidents do King Nexus. Somente leitura — escrito pela Edge Function nexus-sync.';
COMMENT ON COLUMN nexus_incidents.professor_id IS 'Match por nome (nexus-sync) contra professores.nome. NULL = sem match inequívoco.';
COMMENT ON COLUMN nexus_incidents.image_urls   IS 'Paths do bucket incident-images no storage do PROJETO NEXUS — precisam de URL assinada de lá para exibir.';

CREATE INDEX IF NOT EXISTS idx_nexus_incidents_professor  ON nexus_incidents(professor_id);
CREATE INDEX IF NOT EXISTS idx_nexus_incidents_created_at ON nexus_incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_incidents_abertas    ON nexus_incidents(created_at DESC) WHERE NOT resolved;


-- ── 2. Tracking de professor (escalonamento de mensagens) ─────────────────────

CREATE TABLE IF NOT EXISTS nexus_teacher_tracking (
  id                              UUID        PRIMARY KEY,   -- id original no Nexus
  teacher_name                    TEXT        NOT NULL,
  message_stage                   INTEGER     NOT NULL DEFAULT 0,
  first_message_sent              BOOLEAN     NOT NULL DEFAULT false,
  first_message_date              DATE,
  second_message_sent             BOOLEAN     NOT NULL DEFAULT false,
  second_message_date             DATE,
  third_message_sent              BOOLEAN     NOT NULL DEFAULT false,
  third_message_date              DATE,
  next_message_due                DATE,
  forwarded_to_coordination       BOOLEAN     NOT NULL DEFAULT false,
  forwarded_to_coordination_date  TIMESTAMPTZ,
  problem_resolved                BOOLEAN     NOT NULL DEFAULT false,
  resolved_at                     TIMESTAMPTZ,
  recurrence_count                INTEGER     NOT NULL DEFAULT 0,
  last_recurrence_at              TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL,
  updated_at                      TIMESTAMPTZ NOT NULL,
  professor_id                    UUID        REFERENCES professores(id) ON DELETE SET NULL,
  synced_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nexus_teacher_tracking IS 'Espelho de teacher_tracking do King Nexus (fluxo 1ª/2ª/3ª mensagem → coordenação). Somente leitura.';

CREATE INDEX IF NOT EXISTS idx_nexus_tracking_professor ON nexus_teacher_tracking(professor_id);
CREATE INDEX IF NOT EXISTS idx_nexus_tracking_abertos   ON nexus_teacher_tracking(next_message_due) WHERE NOT problem_resolved;


-- ── 3. Reincidências ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nexus_teacher_recurrences (
  id          UUID        PRIMARY KEY,                  -- id original no Nexus
  teacher_id  UUID        NOT NULL REFERENCES nexus_teacher_tracking(id) ON DELETE CASCADE,
  incident_id UUID        REFERENCES nexus_incidents(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  source      TEXT        NOT NULL,                     -- incident | manual
  created_at  TIMESTAMPTZ NOT NULL,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nexus_teacher_recurrences IS 'Espelho de teacher_recurrences do King Nexus (eventos de reincidência por professor). Somente leitura.';

CREATE INDEX IF NOT EXISTS idx_nexus_recurrences_teacher ON nexus_teacher_recurrences(teacher_id);


-- ── 4. Alertas de mês de análise ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nexus_mes_analise_alerts (
  id             UUID        PRIMARY KEY,               -- id original no Nexus
  canonical_name TEXT        NOT NULL,
  level          TEXT        NOT NULL,                  -- observacao | alerta | critico
  total_count    INTEGER     NOT NULL,
  breakdown      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  variations     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL,
  professor_id   UUID        REFERENCES professores(id) ON DELETE SET NULL,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nexus_mes_analise_alerts IS 'Espelho de mes_analise_alerts do King Nexus (alertas por volume de ocorrências). Somente leitura.';

CREATE INDEX IF NOT EXISTS idx_nexus_alerts_professor ON nexus_mes_analise_alerts(professor_id);


-- ── 5. RLS — leitura para autenticados, escrita só pela service role ─────────

ALTER TABLE nexus_incidents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_teacher_tracking    ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_teacher_recurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_mes_analise_alerts  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nexus_incidents_select"   ON nexus_incidents;
CREATE POLICY "nexus_incidents_select"   ON nexus_incidents           FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "nexus_tracking_select"    ON nexus_teacher_tracking;
CREATE POLICY "nexus_tracking_select"    ON nexus_teacher_tracking    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "nexus_recurrences_select" ON nexus_teacher_recurrences;
CREATE POLICY "nexus_recurrences_select" ON nexus_teacher_recurrences FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "nexus_alerts_select"      ON nexus_mes_analise_alerts;
CREATE POLICY "nexus_alerts_select"      ON nexus_mes_analise_alerts  FOR SELECT TO authenticated USING (true);
