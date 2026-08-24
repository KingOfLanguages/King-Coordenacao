-- ─────────────────────────────────────────────────────────────────────────────
-- Histórico das avaliações de aluno por professor.
--
-- PROBLEMA: professor_acompanhamento.avaliacao_alunos é um SNAPSHOT — o
-- kms-api-sync sobrescreve a linha a cada rodada. Dá pra saber que o professor
-- tem 4,8★ hoje, mas não se ele estava em 4,3★ há três meses. Sem isso não há
-- como mostrar "a avaliação melhorou depois da reunião", que é justamente a
-- leitura que a coordenação quer no Meet.
--
-- Espelha o que professor_score_historico já faz com o score, com duas
-- diferenças: a granularidade é DIÁRIA (a API não dá recorte mensal de
-- avaliação) e só nasce ponto novo quando algum número MUDA — professor sem
-- avaliação nova não vira 24 linhas por dia.
--
-- O passado é recuperado de observacoes.snapshot (ver 20260703_observacoes_
-- snapshot.sql), que já congela avaliacao_alunos a cada observação criada.
-- É esparso (só existe onde alguém escreveu observação), mas é o único
-- histórico real que temos — daí a coluna `fonte`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS professor_avaliacao_historico (
  professor_id          UUID    NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  dia                   DATE    NOT NULL,
  media_estrelas        NUMERIC,
  total_avaliacoes      INTEGER,
  comentarios_positivos INTEGER,
  comentarios_negativos INTEGER,
  estrelas_5            INTEGER,
  estrelas_4            INTEGER,
  estrelas_3            INTEGER,
  estrelas_2            INTEGER,
  estrelas_1            INTEGER,
  fonte                 TEXT    NOT NULL DEFAULT 'sync',
  registrado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (professor_id, dia)
);

COMMENT ON TABLE  professor_avaliacao_historico IS
  'Série temporal da avaliação de alunos (professor_acompanhamento.avaliacao_alunos, que é sobrescrita a cada sync). Um ponto por dia COM MUDANÇA.';
COMMENT ON COLUMN professor_avaliacao_historico.fonte IS
  'sync = gravado pelo gatilho a partir do kms-api-sync; observacao = backfill retroativo a partir de observacoes.snapshot.';

CREATE INDEX IF NOT EXISTS idx_professor_avaliacao_historico_professor
  ON professor_avaliacao_historico(professor_id, dia DESC);


-- ── Gatilho: acumula o histórico a cada sync ─────────────────────────────────
-- Só grava quando algo mudou desde o último ponto. Falha do gatilho NÃO pode
-- derrubar o upsert do kms-api-sync (1820 professores por rodada), então o
-- corpo é envolvido em EXCEPTION com WARNING — perder um ponto do gráfico é
-- barato, quebrar o sync não é.

CREATE OR REPLACE FUNCTION public.registrar_avaliacao_historico()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  av      JSONB;
  v_media NUMERIC;
  v_total INTEGER;
  v_pos   INTEGER;
  v_neg   INTEGER;
  v_e5    INTEGER;
  v_e4    INTEGER;
  v_e3    INTEGER;
  v_e2    INTEGER;
  v_e1    INTEGER;
  v_ult   professor_avaliacao_historico%ROWTYPE;
BEGIN
  av := NEW.avaliacao_alunos;
  IF av IS NULL OR jsonb_typeof(av) <> 'object' THEN
    RETURN NEW;
  END IF;

  v_media := NULLIF(av->>'media_estrelas',        '')::NUMERIC;
  v_total := NULLIF(av->>'total_avaliacoes',      '')::NUMERIC::INTEGER;
  v_pos   := NULLIF(av->>'comentarios_positivos', '')::NUMERIC::INTEGER;
  v_neg   := NULLIF(av->>'comentarios_negativos', '')::NUMERIC::INTEGER;
  v_e5    := NULLIF(av->>'estrelas_5',            '')::NUMERIC::INTEGER;
  v_e4    := NULLIF(av->>'estrelas_4',            '')::NUMERIC::INTEGER;
  v_e3    := NULLIF(av->>'estrelas_3',            '')::NUMERIC::INTEGER;
  v_e2    := NULLIF(av->>'estrelas_2',            '')::NUMERIC::INTEGER;
  v_e1    := NULLIF(av->>'estrelas_1',            '')::NUMERIC::INTEGER;

  -- Professor sem nenhuma avaliação ainda não vira ponto (linha reta em zero).
  IF v_media IS NULL AND COALESCE(v_total, 0) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_ult
  FROM professor_avaliacao_historico
  WHERE professor_id = NEW.professor_id
  ORDER BY dia DESC
  LIMIT 1;

  -- Nada mudou desde o último ponto (e ele não é de hoje) → não cria ponto novo.
  IF FOUND
     AND v_ult.dia <> CURRENT_DATE
     AND v_ult.media_estrelas        IS NOT DISTINCT FROM v_media
     AND v_ult.total_avaliacoes      IS NOT DISTINCT FROM v_total
     AND v_ult.comentarios_positivos IS NOT DISTINCT FROM v_pos
     AND v_ult.comentarios_negativos IS NOT DISTINCT FROM v_neg
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO professor_avaliacao_historico (
    professor_id, dia, media_estrelas, total_avaliacoes,
    comentarios_positivos, comentarios_negativos,
    estrelas_5, estrelas_4, estrelas_3, estrelas_2, estrelas_1, fonte
  )
  VALUES (
    NEW.professor_id, CURRENT_DATE, v_media, v_total,
    v_pos, v_neg, v_e5, v_e4, v_e3, v_e2, v_e1, 'sync'
  )
  ON CONFLICT (professor_id, dia) DO UPDATE SET
    media_estrelas        = EXCLUDED.media_estrelas,
    total_avaliacoes      = EXCLUDED.total_avaliacoes,
    comentarios_positivos = EXCLUDED.comentarios_positivos,
    comentarios_negativos = EXCLUDED.comentarios_negativos,
    estrelas_5            = EXCLUDED.estrelas_5,
    estrelas_4            = EXCLUDED.estrelas_4,
    estrelas_3            = EXCLUDED.estrelas_3,
    estrelas_2            = EXCLUDED.estrelas_2,
    estrelas_1            = EXCLUDED.estrelas_1,
    fonte                 = 'sync',
    registrado_em         = NOW();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'registrar_avaliacao_historico falhou para % : %', NEW.professor_id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registrar_avaliacao_historico ON professor_acompanhamento;
CREATE TRIGGER trg_registrar_avaliacao_historico
  AFTER INSERT OR UPDATE OF avaliacao_alunos ON professor_acompanhamento
  FOR EACH ROW EXECUTE FUNCTION public.registrar_avaliacao_historico();


-- ── Backfill retroativo a partir de observacoes.snapshot ─────────────────────
-- Um ponto por professor/dia (o último snapshot do dia). Idempotente.

INSERT INTO professor_avaliacao_historico (
  professor_id, dia, media_estrelas, total_avaliacoes,
  comentarios_positivos, comentarios_negativos,
  estrelas_5, estrelas_4, estrelas_3, estrelas_2, estrelas_1, fonte
)
SELECT DISTINCT ON (o.professor_id, o.created_at::date)
  o.professor_id,
  o.created_at::date,
  NULLIF(o.snapshot->'avaliacao_alunos'->>'media_estrelas',        '')::NUMERIC,
  NULLIF(o.snapshot->'avaliacao_alunos'->>'total_avaliacoes',      '')::NUMERIC::INTEGER,
  NULLIF(o.snapshot->'avaliacao_alunos'->>'comentarios_positivos', '')::NUMERIC::INTEGER,
  NULLIF(o.snapshot->'avaliacao_alunos'->>'comentarios_negativos', '')::NUMERIC::INTEGER,
  NULLIF(o.snapshot->'avaliacao_alunos'->>'estrelas_5',            '')::NUMERIC::INTEGER,
  NULLIF(o.snapshot->'avaliacao_alunos'->>'estrelas_4',            '')::NUMERIC::INTEGER,
  NULLIF(o.snapshot->'avaliacao_alunos'->>'estrelas_3',            '')::NUMERIC::INTEGER,
  NULLIF(o.snapshot->'avaliacao_alunos'->>'estrelas_2',            '')::NUMERIC::INTEGER,
  NULLIF(o.snapshot->'avaliacao_alunos'->>'estrelas_1',            '')::NUMERIC::INTEGER,
  'observacao'
FROM observacoes o
WHERE o.professor_id IS NOT NULL
  AND o.snapshot IS NOT NULL
  AND jsonb_typeof(o.snapshot->'avaliacao_alunos') = 'object'
  AND (o.snapshot->'avaliacao_alunos'->>'total_avaliacoes') IS NOT NULL
ORDER BY o.professor_id, o.created_at::date, o.created_at DESC
ON CONFLICT (professor_id, dia) DO NOTHING;


-- ── RLS — mesmo padrão de professor_score_historico ──────────────────────────

ALTER TABLE professor_avaliacao_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "professor_avaliacao_historico_select_all" ON professor_avaliacao_historico;
CREATE POLICY "professor_avaliacao_historico_select_all" ON professor_avaliacao_historico
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "professor_avaliacao_historico_write_coord" ON professor_avaliacao_historico;
CREATE POLICY "professor_avaliacao_historico_write_coord" ON professor_avaliacao_historico
  FOR ALL TO authenticated
  USING      ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordenacao'));
