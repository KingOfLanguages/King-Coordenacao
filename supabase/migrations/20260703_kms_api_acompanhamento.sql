-- ─────────────────────────────────────────────────────────────────────────────
-- KTM — Acompanhamento de Professores via API externa (KLS-720)
--
-- Substitui o kms-webhook (nunca implantado, removido) como canal de entrada
-- de professores: agora é a Edge Function kms-api-sync que consulta
-- GET /api/v1/acompanhamento-professores (pull, via pg_cron) e faz upsert
-- em professores (por kms_id) + nas tabelas novas abaixo (score, alertas,
-- turnover, roster de alunos e histórico mensal de score).
--
-- Importante: a API não retorna e-mail do professor. O campo `coordenador`
-- retornado também NÃO é usado para setar coordenador_id/grupo_id — a
-- distribuição continua sendo feita pelo nosso algoritmo
-- (atribuir_grupo_professor / distribuir_professores_inicial, ver
-- 20260628_ktm_foundation.sql).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Snapshot atual (1:1 com professor) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS professor_acompanhamento (
  professor_id                    UUID        PRIMARY KEY REFERENCES professores(id) ON DELETE CASCADE,

  score_atual                     INTEGER,
  score_faixa                     TEXT,
  elegivel_alocacao               BOOLEAN,
  avaliacao_alunos                JSONB,

  reuniao_status                  TEXT,
  reuniao_ultima                  DATE,
  reuniao_proxima                 DATE,

  aulas_pendentes_qtd             INTEGER     NOT NULL DEFAULT 0,
  aulas_pendentes_data_mais_antiga DATE,
  faltas_professor                JSONB,
  no_show_primeira_aula           JSONB,
  agendas_bloqueadas              JSONB,
  trocas_professor                JSONB,

  turnover_entrou_no_periodo      BOOLEAN,
  turnover_saida                  JSONB,

  api_atualizado_em               TIMESTAMPTZ,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE professor_acompanhamento IS 'Snapshot mais recente da API de Acompanhamento de Professores (KLS-720). Sobrescrito a cada sync.';

DROP TRIGGER IF EXISTS trg_professor_acompanhamento_updated_at ON professor_acompanhamento;
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_professor_acompanhamento_updated_at
  BEFORE UPDATE ON professor_acompanhamento
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 2. Histórico mensal de score ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS professor_score_historico (
  professor_id UUID    NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  ano_mes      INTEGER NOT NULL,     -- formato YYYYMM, ex: 202605
  score        INTEGER NOT NULL,
  PRIMARY KEY (professor_id, ano_mes)
);

COMMENT ON TABLE professor_score_historico IS 'Um ponto por mês com evento (meses sem evento não aparecem, conforme doc da API).';


-- ── 3. Roster de alunos vinculados (espelho da API, campos permitidos por LGPD) ─

CREATE TABLE IF NOT EXISTS professor_alunos_kms (
  professor_id   UUID NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  aluno_id       BIGINT NOT NULL,
  primeiro_nome  TEXT,
  data_adicao    DATE,
  status_vinculo TEXT,
  PRIMARY KEY (professor_id, aluno_id)
);


-- ── 4. Índices ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_professor_score_historico_professor ON professor_score_historico(professor_id);
CREATE INDEX IF NOT EXISTS idx_professor_alunos_kms_professor      ON professor_alunos_kms(professor_id);
CREATE INDEX IF NOT EXISTS idx_professor_acompanhamento_score      ON professor_acompanhamento(score_atual);


-- ── 5. RLS — mesmo padrão de professores (SELECT p/ todos autenticados; ─────────
--        escrita fica a cargo da Edge Function, que usa a service role key
--        e ignora RLS; mantemos policies restritivas por consistência) ─────────

ALTER TABLE professor_acompanhamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_score_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_alunos_kms      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "professor_acompanhamento_select_all" ON professor_acompanhamento;
CREATE POLICY "professor_acompanhamento_select_all" ON professor_acompanhamento
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "professor_acompanhamento_write_coord" ON professor_acompanhamento;
CREATE POLICY "professor_acompanhamento_write_coord" ON professor_acompanhamento
  FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));

DROP POLICY IF EXISTS "professor_score_historico_select_all" ON professor_score_historico;
CREATE POLICY "professor_score_historico_select_all" ON professor_score_historico
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "professor_score_historico_write_coord" ON professor_score_historico;
CREATE POLICY "professor_score_historico_write_coord" ON professor_score_historico
  FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));

DROP POLICY IF EXISTS "professor_alunos_kms_select_all" ON professor_alunos_kms;
CREATE POLICY "professor_alunos_kms_select_all" ON professor_alunos_kms
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "professor_alunos_kms_write_coord" ON professor_alunos_kms;
CREATE POLICY "professor_alunos_kms_write_coord" ON professor_alunos_kms
  FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));
