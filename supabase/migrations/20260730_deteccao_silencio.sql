-- ─────────────────────────────────────────────────────────────────────────────
-- KTM — Controle de Pendências (professores que somem sem lançar aulas)
--
-- Contexto: professores ATIVOS e EM PAUSA (desligados ficam de fora). A escola
-- teme não saber se um professor está dando aula. O sinal de sumiço é o backlog
-- de aulas não lançadas, que a API do KMS já entrega de hora em hora em
-- professor_acompanhamento:
--   aulas_pendentes_qtd              → nº de pendências
--   aulas_pendentes_data_mais_antiga → dias_pendente = hoje − data
--
-- ⚠️ PISO DE ~6 DIAS (validado em 2026-07-13): o KMS só marca "aula pendente"
-- após ~1 semana de carência. Não há sinal abaixo de 6 dias. A régua é ancorada
-- acima do piso (limiares fáceis de ajustar em T1/T2/T3, abaixo).
--
-- Processo GRADATIVO, não cumulativo: cada professor está em UM estágio (o do
-- seu dia atual). A UI mostra cada professor só no filtro do estágio corrente.
--   >= T1 (6d)  → 'alerta'       (1ª msg — Alerta inicial)
--   >= T2 (9d)  → 'aviso_saida'  (2ª msg — Reforço)
--   >= T3 (12d) → 'reuniao'      (3ª msg — Aplicação da medida / Mês de Análise)
--
-- NÃO reutiliza professores.status (vínculo: ativo/pausa/desligado). O estado de
-- pendência vive em acompanhamento_silencio.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Episódio ativo (1 linha por professor com pendências agora) ────────────

CREATE TABLE IF NOT EXISTS acompanhamento_silencio (
  professor_id          UUID        PRIMARY KEY REFERENCES professores(id) ON DELETE CASCADE,

  status                TEXT        NOT NULL DEFAULT 'alerta'
                                    CHECK (status IN ('alerta', 'aviso_saida', 'reuniao')),
  dias_pendente         INTEGER     NOT NULL,
  dias_pico             INTEGER     NOT NULL,          -- maior atraso já visto no episódio
  aulas_pendentes       INTEGER     NOT NULL DEFAULT 0,
  qtd_alunos            INTEGER,                       -- nº de alunos vinculados (KMS)
  severidade_nx         NUMERIC,                       -- aulas_pendentes ÷ nº de alunos
  data_mais_antiga      DATE,

  -- Flags de "mensagem enviada" por estágio. O job NÃO mexe nelas — só o RPC
  -- registrar_mensagem_pendencia, quando o responsável marca no filtro.
  msg_resolucao         BOOLEAN     NOT NULL DEFAULT false,
  msg_resolucao_em      TIMESTAMPTZ,
  msg_saida_alunos      BOOLEAN     NOT NULL DEFAULT false,
  msg_saida_alunos_em   TIMESTAMPTZ,
  reuniao_solicitada    BOOLEAN     NOT NULL DEFAULT false,
  reuniao_solicitada_em TIMESTAMPTZ,

  aberto_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE acompanhamento_silencio IS 'Episódio de pendência ATIVO por professor (ativo ou em pausa). Aberto/atualizado/fechado pelo job diário; flags marcadas pelo RPC.';

-- Idempotência p/ ambiente onde a v1 já foi aplicada sem a coluna:
ALTER TABLE acompanhamento_silencio ADD COLUMN IF NOT EXISTS qtd_alunos INTEGER;

CREATE INDEX IF NOT EXISTS idx_silencio_status ON acompanhamento_silencio(status);


-- ── 2. Incidente permanente (histórico do episódio — nunca reseta) ────────────

CREATE TABLE IF NOT EXISTS silencio_incidente (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id          UUID        NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  aberto_em             TIMESTAMPTZ NOT NULL,
  resolvido_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dias_pico             INTEGER     NOT NULL,
  aulas_pendentes_pico  INTEGER,
  status_final          TEXT        NOT NULL           -- estágio máximo atingido
);

COMMENT ON TABLE silencio_incidente IS 'Histórico permanente de episódios de pendência já resolvidos. Diferente de nexus_incidents (pedagógico).';

CREATE INDEX IF NOT EXISTS idx_silencio_incidente_professor ON silencio_incidente(professor_id, resolvido_em DESC);


-- ── 3. Log de mensagens enviadas (o "informe sobre o caso") ───────────────────
-- Cada vez que o responsável marca uma mensagem como enviada, grava aqui o texto
-- exato comunicado + quem + quando. Trilha permanente por professor.

CREATE TABLE IF NOT EXISTS silencio_mensagem_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id  UUID        NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  estagio       TEXT        NOT NULL,          -- alerta | aviso_saida | reuniao
  texto         TEXT        NOT NULL,
  enviado_por   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  enviado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE silencio_mensagem_log IS 'Registro (informe) de cada mensagem de pendência marcada como enviada. Escrito pelo RPC registrar_mensagem_pendencia.';

CREATE INDEX IF NOT EXISTS idx_silencio_msg_log_professor ON silencio_mensagem_log(professor_id, enviado_em DESC);


-- ── 4. Snapshot semanal (alimenta os gráficos) ────────────────────────────────

CREATE TABLE IF NOT EXISTS silencio_snapshot_semanal (
  professor_id   UUID    NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  semana         DATE    NOT NULL,                    -- date_trunc('week')::date (segunda)
  qtd_pendencias INTEGER NOT NULL,
  dias_max       INTEGER,
  PRIMARY KEY (professor_id, semana)
);

COMMENT ON TABLE silencio_snapshot_semanal IS 'Uma linha por professor por semana (maior backlog observado na semana). Gráfico geral = soma; gráfico do professor = a própria série.';


-- ── 5. Job diário — varre o snapshot do KMS e move a máquina de estados ────────
-- SECURITY DEFINER (ignora RLS). Uma varredura em lote. Cobre ativos E em pausa.

CREATE OR REPLACE FUNCTION rodar_deteccao_silencio()
RETURNS TABLE(abertos INT, atualizados INT, fechados INT) AS $$
DECLARE
  -- ── Limiares (dias). Ajuste aqui conforme calibrar com a operação. ──
  T1 CONSTANT INT := 6;   -- alerta        (1ª msg)
  T2 CONSTANT INT := 9;   -- aviso_saida   (2ª msg)
  T3 CONSTANT INT := 12;  -- reuniao       (3ª msg)
  v_semana DATE := date_trunc('week', CURRENT_DATE)::date;
  v_abertos INT := 0; v_atualizados INT := 0; v_fechados INT := 0;
BEGIN
  -- 5a. Fecha episódios de quem voltou ao normal (backlog < piso), foi desligado
  --     ou perdeu o sinal — e grava o incidente permanente.
  WITH voltaram AS (
    SELECT s.*
    FROM acompanhamento_silencio s
    JOIN professores p ON p.id = s.professor_id
    LEFT JOIN professor_acompanhamento pa ON pa.professor_id = s.professor_id
    WHERE p.status = 'desligado'
       OR pa.aulas_pendentes_data_mais_antiga IS NULL
       OR (CURRENT_DATE - pa.aulas_pendentes_data_mais_antiga) < T1
  ), gravados AS (
    INSERT INTO silencio_incidente (professor_id, aberto_em, dias_pico, aulas_pendentes_pico, status_final)
    SELECT professor_id, aberto_em, dias_pico, aulas_pendentes, status FROM voltaram
    RETURNING professor_id
  )
  DELETE FROM acompanhamento_silencio s USING gravados g WHERE s.professor_id = g.professor_id;
  GET DIAGNOSTICS v_fechados = ROW_COUNT;

  -- 5b. Abre/atualiza episódios de quem está com pendência >= T1 (ativos + pausa).
  WITH atual AS (
    SELECT
      pa.professor_id,
      pa.aulas_pendentes_qtd AS qtd,
      pa.aulas_pendentes_data_mais_antiga AS data_antiga,
      (CURRENT_DATE - pa.aulas_pendentes_data_mais_antiga) AS dias,
      (SELECT count(*) FROM professor_alunos_kms a WHERE a.professor_id = pa.professor_id) AS n_alunos
    FROM professor_acompanhamento pa
    JOIN professores p ON p.id = pa.professor_id
    WHERE p.status IN ('ativo', 'pausa')
      AND pa.aulas_pendentes_data_mais_antiga IS NOT NULL
      AND (CURRENT_DATE - pa.aulas_pendentes_data_mais_antiga) >= T1
  ), upsert AS (
    INSERT INTO acompanhamento_silencio AS s
      (professor_id, status, dias_pendente, dias_pico, aulas_pendentes, qtd_alunos, severidade_nx, data_mais_antiga, atualizado_em)
    SELECT
      professor_id,
      CASE WHEN dias >= T3 THEN 'reuniao' WHEN dias >= T2 THEN 'aviso_saida' ELSE 'alerta' END,
      dias, dias, qtd, n_alunos,
      CASE WHEN n_alunos = 0 THEN NULL ELSE round(qtd::numeric / n_alunos, 1) END,
      data_antiga, NOW()
    FROM atual
    ON CONFLICT (professor_id) DO UPDATE SET
      status           = CASE WHEN EXCLUDED.dias_pendente >= T3 THEN 'reuniao'
                              WHEN EXCLUDED.dias_pendente >= T2 THEN 'aviso_saida'
                              ELSE 'alerta' END,
      dias_pendente    = EXCLUDED.dias_pendente,
      dias_pico        = GREATEST(s.dias_pico, EXCLUDED.dias_pendente),
      aulas_pendentes  = EXCLUDED.aulas_pendentes,
      qtd_alunos       = EXCLUDED.qtd_alunos,
      severidade_nx    = EXCLUDED.severidade_nx,
      data_mais_antiga = EXCLUDED.data_mais_antiga,
      atualizado_em    = NOW()
    RETURNING (xmax = 0) AS inseriu     -- xmax=0 ⇒ foi INSERT (episódio novo)
  )
  SELECT
    count(*) FILTER (WHERE inseriu),
    count(*) FILTER (WHERE NOT inseriu)
  INTO v_abertos, v_atualizados
  FROM upsert;

  -- 5c. Snapshot semanal (uma linha por professor/semana; guarda o pico da semana).
  INSERT INTO silencio_snapshot_semanal (professor_id, semana, qtd_pendencias, dias_max)
  SELECT
    pa.professor_id, v_semana, pa.aulas_pendentes_qtd,
    (CURRENT_DATE - pa.aulas_pendentes_data_mais_antiga)
  FROM professor_acompanhamento pa
  JOIN professores p ON p.id = pa.professor_id
  WHERE p.status IN ('ativo', 'pausa') AND pa.aulas_pendentes_qtd > 0
  ON CONFLICT (professor_id, semana) DO UPDATE SET
    qtd_pendencias = GREATEST(silencio_snapshot_semanal.qtd_pendencias, EXCLUDED.qtd_pendencias),
    dias_max       = GREATEST(COALESCE(silencio_snapshot_semanal.dias_max, 0), COALESCE(EXCLUDED.dias_max, 0));

  RETURN QUERY SELECT v_abertos, v_atualizados, v_fechados;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── 6. RPC: marcar mensagem enviada + gravar o informe (atômico) ──────────────

CREATE OR REPLACE FUNCTION registrar_mensagem_pendencia(
  p_professor_id UUID, p_estagio TEXT, p_texto TEXT
) RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (role IN ('admin', 'coordenacao') OR is_admin = true)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registrar mensagem de pendência.';
  END IF;

  INSERT INTO silencio_mensagem_log (professor_id, estagio, texto, enviado_por)
  VALUES (p_professor_id, p_estagio, p_texto, auth.uid());

  UPDATE acompanhamento_silencio SET
    msg_resolucao         = CASE WHEN p_estagio = 'alerta'      THEN true  ELSE msg_resolucao END,
    msg_resolucao_em      = CASE WHEN p_estagio = 'alerta'      THEN NOW() ELSE msg_resolucao_em END,
    msg_saida_alunos      = CASE WHEN p_estagio = 'aviso_saida' THEN true  ELSE msg_saida_alunos END,
    msg_saida_alunos_em   = CASE WHEN p_estagio = 'aviso_saida' THEN NOW() ELSE msg_saida_alunos_em END,
    reuniao_solicitada    = CASE WHEN p_estagio = 'reuniao'     THEN true  ELSE reuniao_solicitada END,
    reuniao_solicitada_em = CASE WHEN p_estagio = 'reuniao'     THEN NOW() ELSE reuniao_solicitada_em END,
    atualizado_em         = NOW()
  WHERE professor_id = p_professor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── 7. RLS — leitura p/ autenticados; escrita via RPC/job (definer) ───────────

ALTER TABLE acompanhamento_silencio     ENABLE ROW LEVEL SECURITY;
ALTER TABLE silencio_incidente          ENABLE ROW LEVEL SECURITY;
ALTER TABLE silencio_mensagem_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE silencio_snapshot_semanal   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "silencio_select_all" ON acompanhamento_silencio;
CREATE POLICY "silencio_select_all" ON acompanhamento_silencio FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "silencio_incidente_select_all" ON silencio_incidente;
CREATE POLICY "silencio_incidente_select_all" ON silencio_incidente FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "silencio_msg_log_select_all" ON silencio_mensagem_log;
CREATE POLICY "silencio_msg_log_select_all" ON silencio_mensagem_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "silencio_snapshot_select_all" ON silencio_snapshot_semanal;
CREATE POLICY "silencio_snapshot_select_all" ON silencio_snapshot_semanal FOR SELECT TO authenticated USING (true);

GRANT EXECUTE ON FUNCTION rodar_deteccao_silencio()                             TO service_role;
GRANT EXECUTE ON FUNCTION registrar_mensagem_pendencia(UUID, TEXT, TEXT)        TO authenticated;


-- ── 8. Agendamento diário (pg_cron). Job puro-SQL, sem HTTP. 06:00 UTC. ───────

SELECT cron.unschedule('king-deteccao-silencio')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-deteccao-silencio');

SELECT cron.schedule('king-deteccao-silencio', '0 6 * * *', $$ SELECT rodar_deteccao_silencio(); $$);
