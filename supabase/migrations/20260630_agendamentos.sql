-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo de Agendamento Coletivo
--   Auto-agendamento de professores em reuniões coletivas, sem login,
--   identificando-se apenas pelo e-mail cadastrado (professor_emails).
--
--   Domínio isolado do modelo 1:1 (reunioes/reuniao_professores) para não
--   misturar conceitos: aqui a coordenação cria agendas com vagas/capacidade
--   com antecedência, e o professor se auto-inscreve num horário.
--
--   Todo o acesso público (anon) acontece via Edge Functions com service-role
--   (teacher-lookup, create-booking) — por isso não há policy para `anon`
--   nestas tabelas.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Agenda coletiva (ex.: "Feedback Coletivo") ────────────────────────────

CREATE TABLE IF NOT EXISTS agenda_reunioes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo              TEXT        NOT NULL,
  descricao           TEXT,
  coordenador_id      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  meet_link           TEXT,
  grupos_autorizados  UUID[],     -- NULL = todos os grupos; senão lista de grupos.id
  ativo               BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agenda_reunioes IS
  'Agenda de reunião coletiva criada pela coordenação, com vagas que professores reservam via /agendar.';
COMMENT ON COLUMN agenda_reunioes.grupos_autorizados IS
  'Grupos autorizados a se inscrever. NULL = qualquer professor ativo pode ver/reservar.';

CREATE INDEX IF NOT EXISTS idx_agenda_reunioes_ativo ON agenda_reunioes (ativo);


-- ── 2. Horários/slots dentro de uma agenda ───────────────────────────────────

CREATE TABLE IF NOT EXISTS agenda_horarios (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id    UUID        NOT NULL REFERENCES agenda_reunioes(id) ON DELETE CASCADE,
  data_hora    TIMESTAMPTZ NOT NULL,
  capacidade   INT         NOT NULL DEFAULT 1 CHECK (capacidade > 0),
  ativo        BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agenda_horarios IS
  'Um horário/slot oferecido dentro de uma agenda coletiva, com capacidade de vagas.';

CREATE INDEX IF NOT EXISTS idx_agenda_horarios_agenda    ON agenda_horarios (agenda_id);
CREATE INDEX IF NOT EXISTS idx_agenda_horarios_data_hora ON agenda_horarios (data_hora);


-- ── 3. Inscrição do professor num horário ────────────────────────────────────

CREATE TABLE IF NOT EXISTS agenda_inscricoes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  horario_id   UUID        NOT NULL REFERENCES agenda_horarios(id) ON DELETE CASCADE,
  professor_id UUID        NOT NULL REFERENCES professores(id)     ON DELETE CASCADE,
  email_usado  TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'confirmada'
                            CHECK (status IN ('confirmada', 'cancelada')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agenda_inscricoes IS
  'Inscrição de um professor em um horário de agenda coletiva.';

-- Um professor não pode duplicar inscrição confirmada no mesmo horário.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_inscricoes_unica
  ON agenda_inscricoes (horario_id, professor_id) WHERE status = 'confirmada';
CREATE INDEX IF NOT EXISTS idx_agenda_inscricoes_horario   ON agenda_inscricoes (horario_id);
CREATE INDEX IF NOT EXISTS idx_agenda_inscricoes_professor ON agenda_inscricoes (professor_id);


-- ── 4. RLS ────────────────────────────────────────────────────────────────────
-- Sem policy para `anon`: o fluxo público (/agendar) nunca acessa estas tabelas
-- diretamente, só via Edge Functions com service-role key.

ALTER TABLE agenda_reunioes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_horarios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_inscricoes  ENABLE ROW LEVEL SECURITY;

-- agenda_reunioes: autenticados veem tudo; admin/coordenação escrevem.
DROP POLICY IF EXISTS "agenda_reunioes_select" ON agenda_reunioes;
CREATE POLICY "agenda_reunioes_select" ON agenda_reunioes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "agenda_reunioes_write" ON agenda_reunioes;
CREATE POLICY "agenda_reunioes_write" ON agenda_reunioes FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));

-- agenda_horarios: autenticados veem tudo; admin/coordenação escrevem.
DROP POLICY IF EXISTS "agenda_horarios_select" ON agenda_horarios;
CREATE POLICY "agenda_horarios_select" ON agenda_horarios FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "agenda_horarios_write" ON agenda_horarios;
CREATE POLICY "agenda_horarios_write" ON agenda_horarios FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));

-- agenda_inscricoes: autenticados veem tudo; admin/coordenação escrevem
-- (inscrição via público acontece pela Edge Function create-booking, com service-role).
DROP POLICY IF EXISTS "agenda_inscricoes_select" ON agenda_inscricoes;
CREATE POLICY "agenda_inscricoes_select" ON agenda_inscricoes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "agenda_inscricoes_write" ON agenda_inscricoes;
CREATE POLICY "agenda_inscricoes_write" ON agenda_inscricoes FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));
