-- ─────────────────────────────────────────────────────────────────────────────
-- Welcome Path — trilha de onboarding percorrida pelo PRÓPRIO professor.
--
-- Não confundir com `onboarding_professores` (20260717), que é o checklist da
-- coordenação marcando quais mensagens de boas-vindas já foram enviadas. Aqui é
-- o outro lado: o professor entra por um link público (/welcome-path), assiste
-- ao conteúdo, responde as atividades e destrava a etapa seguinte.
--
-- Veio do app "Welcome Path" que a coordenação da Bianca construiu à parte
-- (7 dias fixos, conta com e-mail+senha, gabarito corrigido no navegador).
-- O que muda ao trazer para cá:
--   • identificação pelo padrão da casa (e-mail → nome → mês/ano de início),
--     sem conta de professor — igual /agendar e /pausa;
--   • etapas CONFIGURÁVEIS em vez de 7 dias travados no schema;
--   • cada etapa é uma sequência de BLOCOS (texto, vídeo, imagem, aviso), não
--     um blob de HTML só;
--   • questões de 4 tipos, não só múltipla escolha;
--   • gabarito nunca sai do banco: a correção acontece no servidor. No app
--     original o `correct_index` ia junto com a pergunta para o navegador.
--
-- Segurança: mesmo desenho de `pausas` (20260738). `welcome_path_progresso` e
-- `_respostas` não têm policy de INSERT/UPDATE — quem escreve é a Edge Function
-- `portal-welcome-path` (service_role) ou as funções SECURITY DEFINER daqui.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Etapas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS welcome_path_etapas (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem             INTEGER     NOT NULL,
  titulo            TEXT        NOT NULL DEFAULT '',
  descricao         TEXT        NOT NULL DEFAULT '',
  ativa             BOOLEAN     NOT NULL DEFAULT true,
  obrigatoria       BOOLEAN     NOT NULL DEFAULT true,
  nota_minima       SMALLINT    NOT NULL DEFAULT 80 CHECK (nota_minima BETWEEN 0 AND 100),
  prazo_dias        SMALLINT    CHECK (prazo_dias    IS NULL OR prazo_dias    > 0),
  liberacao_dia     SMALLINT    CHECK (liberacao_dia IS NULL OR liberacao_dia >= 1),
  notas_coordenacao TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  welcome_path_etapas               IS
  'Etapas da trilha de onboarding do professor. Ordem configurável — substitui os 7 "dias" fixos do app original.';
COMMENT ON COLUMN welcome_path_etapas.nota_minima   IS
  'Percentual de acerto necessário para concluir a etapa e destravar a seguinte.';
COMMENT ON COLUMN welcome_path_etapas.prazo_dias    IS
  'Prazo em dias contados de professores.data_inicio. Alimenta o alerta de atraso da coordenação. NULL = sem prazo.';
COMMENT ON COLUMN welcome_path_etapas.liberacao_dia IS
  'Dia mínimo (desde data_inicio) em que a etapa abre, mesmo com a anterior concluída. NULL = abre assim que a anterior conclui.';

-- Sem UNIQUE em `ordem` de propósito: reordenar com unique exige dança de
-- valores temporários. A troca acontece atomicamente em wp_mover_etapa().
CREATE INDEX IF NOT EXISTS idx_wp_etapas_ordem ON welcome_path_etapas (ordem);

DROP TRIGGER IF EXISTS trg_wp_etapas_updated_at ON welcome_path_etapas;
CREATE TRIGGER trg_wp_etapas_updated_at
  BEFORE UPDATE ON welcome_path_etapas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();   -- já existe (20260703)


-- ── 2. Blocos de conteúdo ────────────────────────────────────────────────────
-- A etapa é uma sequência de blocos. No app original havia um `content` (HTML),
-- um `video_url` e um `image_url` por dia — um de cada, na ordem fixa. Aqui a
-- coordenação monta quantos quiser, na ordem que quiser.

CREATE TABLE IF NOT EXISTS welcome_path_blocos (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id   UUID        NOT NULL REFERENCES welcome_path_etapas(id) ON DELETE CASCADE,
  ordem      INTEGER     NOT NULL DEFAULT 0,
  tipo       TEXT        NOT NULL CHECK (tipo IN ('texto', 'video', 'imagem', 'aviso')),
  titulo     TEXT,
  conteudo   TEXT,       -- HTML no 'texto', corpo no 'aviso', legenda nos demais
  url        TEXT,       -- link do YouTube no 'video', da imagem no 'imagem'
  meta       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  welcome_path_blocos      IS 'Blocos de conteúdo de uma etapa, em sequência.';
COMMENT ON COLUMN welcome_path_blocos.meta IS 'Extras por tipo — ex.: {"tom":"alerta"} num bloco de aviso.';

CREATE INDEX IF NOT EXISTS idx_wp_blocos_etapa ON welcome_path_blocos (etapa_id, ordem);


-- ── 3. Questões ──────────────────────────────────────────────────────────────
-- `corretas` como int[] unifica os três tipos objetivos num caminho de correção
-- só: [1] na múltipla escolha, [0,2] na múltipla seleção, [0] no V/F. A
-- dissertativa fica com array vazio e é corrigida por gente.

CREATE TABLE IF NOT EXISTS welcome_path_questoes (
  id          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id    UUID     NOT NULL REFERENCES welcome_path_etapas(id) ON DELETE CASCADE,
  -- Ancora a questão logo depois de um bloco. NULL = questão solta, no fim da etapa.
  bloco_id    UUID     REFERENCES welcome_path_blocos(id) ON DELETE SET NULL,
  ordem       INTEGER  NOT NULL DEFAULT 0,
  tipo        TEXT     NOT NULL DEFAULT 'multipla_escolha'
                       CHECK (tipo IN ('multipla_escolha', 'multipla_selecao', 'verdadeiro_falso', 'dissertativa')),
  enunciado   TEXT     NOT NULL,
  opcoes      JSONB    NOT NULL DEFAULT '[]'::jsonb,
  corretas    INTEGER[] NOT NULL DEFAULT '{}',
  explicacao  TEXT,    -- feedback mostrado ao professor DEPOIS de responder
  peso        SMALLINT NOT NULL DEFAULT 1 CHECK (peso > 0),
  obrigatoria BOOLEAN  NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  welcome_path_questoes             IS
  'Atividades avaliativas da trilha. O gabarito (corretas) nunca é enviado ao portal público — a correção é feita no servidor.';
COMMENT ON COLUMN welcome_path_questoes.corretas    IS
  'Índices corretos dentro de `opcoes`. Vazio na dissertativa (correção manual).';
COMMENT ON COLUMN welcome_path_questoes.obrigatoria IS
  'Dissertativa obrigatória segura a conclusão da etapa até a coordenação revisar.';

CREATE INDEX IF NOT EXISTS idx_wp_questoes_etapa ON welcome_path_questoes (etapa_id, ordem);


-- ── 4. Progresso (uma linha por professor × etapa) ───────────────────────────

CREATE TABLE IF NOT EXISTS welcome_path_progresso (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id         UUID        NOT NULL REFERENCES professores(id)        ON DELETE CASCADE,
  etapa_id             UUID        NOT NULL REFERENCES welcome_path_etapas(id) ON DELETE CASCADE,
  iniciada_em          TIMESTAMPTZ,
  concluida_em         TIMESTAMPTZ,
  tempo_segundos       INTEGER     NOT NULL DEFAULT 0,
  nota                 NUMERIC(5,1),
  tentativas           INTEGER     NOT NULL DEFAULT 0,
  observacao           TEXT,       -- anotação pessoal do professor
  liberada_manualmente BOOLEAN     NOT NULL DEFAULT false,
  revisao_pendente     BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (professor_id, etapa_id)
);

COMMENT ON TABLE  welcome_path_progresso                      IS
  'Passagem de cada professor por cada etapa. Escrita só pela Edge Function e pelas funções DEFINER — não há policy de INSERT/UPDATE.';
COMMENT ON COLUMN welcome_path_progresso.liberada_manualmente IS
  'A coordenação destravou esta etapa fora da ordem para este professor.';
COMMENT ON COLUMN welcome_path_progresso.revisao_pendente     IS
  'Há dissertativa respondida esperando correção da coordenação.';

CREATE INDEX IF NOT EXISTS idx_wp_progresso_professor ON welcome_path_progresso (professor_id);
CREATE INDEX IF NOT EXISTS idx_wp_progresso_revisao
  ON welcome_path_progresso (etapa_id) WHERE revisao_pendente;


-- ── 5. Respostas ─────────────────────────────────────────────────────────────
-- O app original descartava as respostas e guardava só a nota. Guardar permite
-- revisar dissertativa e enxergar em qual questão os professores tropeçam.

CREATE TABLE IF NOT EXISTS welcome_path_respostas (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id       UUID        NOT NULL REFERENCES professores(id)          ON DELETE CASCADE,
  questao_id         UUID        NOT NULL REFERENCES welcome_path_questoes(id) ON DELETE CASCADE,
  tentativa          INTEGER     NOT NULL DEFAULT 1,
  resposta           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- NULL = dissertativa aguardando correção da coordenação.
  correta            BOOLEAN,
  revisado_por       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  revisado_em        TIMESTAMPTZ,
  comentario_revisao TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (professor_id, questao_id, tentativa)
);

COMMENT ON COLUMN welcome_path_respostas.resposta IS
  'Objetivas: {"opcoes":[1]}. Dissertativa: {"texto":"…"}.';

CREATE INDEX IF NOT EXISTS idx_wp_respostas_professor ON welcome_path_respostas (professor_id, questao_id);
CREATE INDEX IF NOT EXISTS idx_wp_respostas_pendentes
  ON welcome_path_respostas (questao_id) WHERE correta IS NULL;


-- ── 6. Sessões do portal ("lembrar neste dispositivo") ───────────────────────
-- A trilha dura dias; obrigar o professor a redigitar o e-mail toda visita é
-- atrito puro. Guardamos só o SHA-256 do token — o token cru existe uma vez, na
-- resposta do lookup, e daí vive no localStorage do professor.

CREATE TABLE IF NOT EXISTS welcome_path_sessoes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id  UUID        NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  token_hash    TEXT        NOT NULL UNIQUE,
  expira_em     TIMESTAMPTZ NOT NULL,
  ultimo_uso_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE welcome_path_sessoes IS
  'Sessões do portal público do Welcome Path. Só a service_role toca — não há policy alguma.';

CREATE INDEX IF NOT EXISTS idx_wp_sessoes_professor ON welcome_path_sessoes (professor_id);
CREATE INDEX IF NOT EXISTS idx_wp_sessoes_expira    ON welcome_path_sessoes (expira_em);


-- ── 7. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE welcome_path_etapas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE welcome_path_blocos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE welcome_path_questoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE welcome_path_progresso ENABLE ROW LEVEL SECURITY;
ALTER TABLE welcome_path_respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE welcome_path_sessoes   ENABLE ROW LEVEL SECURITY;

/** Quem edita o CONTEÚDO da trilha: coordenação e admin. Suporte acompanha o
 *  progresso (leitura), mas não reescreve o material. */
CREATE OR REPLACE FUNCTION pode_gerir_welcome_path() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT is_admin OR role IN ('admin', 'coordenacao')
    FROM profiles WHERE id = auth.uid()
  ), false);
$$;
GRANT EXECUTE ON FUNCTION pode_gerir_welcome_path() TO authenticated;

-- Conteúdo: todo autenticado lê (a coordenação precisa ver o gabarito na tela
-- de edição e na revisão); só quem gere escreve.
DROP POLICY IF EXISTS "wp_etapas_select" ON welcome_path_etapas;
CREATE POLICY "wp_etapas_select" ON welcome_path_etapas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "wp_etapas_write" ON welcome_path_etapas;
CREATE POLICY "wp_etapas_write" ON welcome_path_etapas FOR ALL TO authenticated
  USING (pode_gerir_welcome_path()) WITH CHECK (pode_gerir_welcome_path());

DROP POLICY IF EXISTS "wp_blocos_select" ON welcome_path_blocos;
CREATE POLICY "wp_blocos_select" ON welcome_path_blocos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "wp_blocos_write" ON welcome_path_blocos;
CREATE POLICY "wp_blocos_write" ON welcome_path_blocos FOR ALL TO authenticated
  USING (pode_gerir_welcome_path()) WITH CHECK (pode_gerir_welcome_path());

DROP POLICY IF EXISTS "wp_questoes_select" ON welcome_path_questoes;
CREATE POLICY "wp_questoes_select" ON welcome_path_questoes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "wp_questoes_write" ON welcome_path_questoes;
CREATE POLICY "wp_questoes_write" ON welcome_path_questoes FOR ALL TO authenticated
  USING (pode_gerir_welcome_path()) WITH CHECK (pode_gerir_welcome_path());

-- Progresso e respostas: leitura para qualquer autenticado (mesma abertura de
-- professores/observacoes). Escrita, nenhuma — só Edge Function e DEFINER.
DROP POLICY IF EXISTS "wp_progresso_select" ON welcome_path_progresso;
CREATE POLICY "wp_progresso_select" ON welcome_path_progresso FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "wp_respostas_select" ON welcome_path_respostas;
CREATE POLICY "wp_respostas_select" ON welcome_path_respostas FOR SELECT TO authenticated USING (true);

-- welcome_path_sessoes: RLS ligado e nenhuma policy = invisível para anon e
-- authenticated. Só a service_role enxerga.


-- ── 8. Recálculo da etapa (nota, revisão pendente, conclusão) ────────────────
-- Fonte única da regra de nota. A Edge Function grava as respostas e chama esta
-- função; a revisão de dissertativa chama a mesma. Sem isso a regra viveria
-- duplicada em TypeScript e em SQL, e as duas divergiriam no primeiro ajuste.
--
-- Nota = peso acertado / peso já corrigido. Dissertativa pendente NÃO conta
-- contra o professor no cálculo, mas segura a conclusão quando é obrigatória.

CREATE OR REPLACE FUNCTION wp_recalcular_etapa(p_professor_id UUID, p_etapa_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tentativa    INTEGER;
  v_peso_total   INTEGER;
  v_peso_acerto  INTEGER;
  v_pendente     BOOLEAN;
  v_pendente_obr BOOLEAN;
  v_nota         NUMERIC(5,1);
  v_minima       SMALLINT;
BEGIN
  SELECT nota_minima INTO v_minima FROM welcome_path_etapas WHERE id = p_etapa_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Só a última tentativa vale.
  SELECT COALESCE(MAX(r.tentativa), 0) INTO v_tentativa
    FROM welcome_path_respostas r
    JOIN welcome_path_questoes  q ON q.id = r.questao_id
   WHERE r.professor_id = p_professor_id AND q.etapa_id = p_etapa_id;

  IF v_tentativa = 0 THEN RETURN; END IF;

  SELECT COALESCE(SUM(q.peso) FILTER (WHERE r.correta IS NOT NULL), 0),
         COALESCE(SUM(q.peso) FILTER (WHERE r.correta), 0),
         COALESCE(BOOL_OR(r.correta IS NULL), false),
         COALESCE(BOOL_OR(r.correta IS NULL AND q.obrigatoria), false)
    INTO v_peso_total, v_peso_acerto, v_pendente, v_pendente_obr
    FROM welcome_path_respostas r
    JOIN welcome_path_questoes  q ON q.id = r.questao_id
   WHERE r.professor_id = p_professor_id
     AND q.etapa_id     = p_etapa_id
     AND r.tentativa    = v_tentativa;

  v_nota := CASE WHEN v_peso_total > 0
                 THEN ROUND(v_peso_acerto::NUMERIC * 100 / v_peso_total, 1)
                 ELSE NULL END;

  UPDATE welcome_path_progresso
     SET nota             = v_nota,
         revisao_pendente = v_pendente,
         -- Conclusão não é revogada por revisão posterior: se a coordenação
         -- quiser desfazer, existe wp_resetar_etapa().
         concluida_em = CASE
           WHEN concluida_em IS NOT NULL THEN concluida_em
           WHEN v_nota IS NOT NULL AND v_nota >= v_minima AND NOT v_pendente_obr THEN NOW()
           ELSE NULL
         END
   WHERE professor_id = p_professor_id AND etapa_id = p_etapa_id;
END;
$$;

-- Interna: quem chama é a Edge Function (service_role) e wp_revisar_resposta().
-- Revogar só de PUBLIC não basta — o Supabase dá EXECUTE direto a anon e
-- authenticated por default privileges, e um GRANT direto sobrevive ao REVOKE
-- de PUBLIC. Os três precisam ser nomeados.
REVOKE EXECUTE ON FUNCTION wp_recalcular_etapa(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION wp_recalcular_etapa(UUID, UUID) TO service_role;


-- ── 9. Ações da coordenação ──────────────────────────────────────────────────

/** Troca a etapa de lugar com a vizinha (p_direcao = -1 sobe, +1 desce).
 *  Numa transação só — é por isso que `ordem` não tem UNIQUE. */
CREATE OR REPLACE FUNCTION wp_mover_etapa(p_id UUID, p_direcao INTEGER) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ordem   INTEGER;
  v_vizinho UUID;
  v_ordem_v INTEGER;
BEGIN
  IF NOT pode_gerir_welcome_path() THEN
    RAISE EXCEPTION 'Sem permissão para reordenar etapas.';
  END IF;
  IF p_direcao NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Direção inválida.';
  END IF;

  SELECT ordem INTO v_ordem FROM welcome_path_etapas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa não encontrada.'; END IF;

  IF p_direcao = -1 THEN
    SELECT id, ordem INTO v_vizinho, v_ordem_v FROM welcome_path_etapas
     WHERE ordem < v_ordem ORDER BY ordem DESC LIMIT 1 FOR UPDATE;
  ELSE
    SELECT id, ordem INTO v_vizinho, v_ordem_v FROM welcome_path_etapas
     WHERE ordem > v_ordem ORDER BY ordem ASC LIMIT 1 FOR UPDATE;
  END IF;

  IF v_vizinho IS NULL THEN RETURN; END IF;  -- já é a primeira/última

  UPDATE welcome_path_etapas SET ordem = v_ordem   WHERE id = v_vizinho;
  UPDATE welcome_path_etapas SET ordem = v_ordem_v WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION wp_mover_etapa(UUID, INTEGER) TO authenticated;

/** Destrava uma etapa para um professor específico, fora da ordem. */
CREATE OR REPLACE FUNCTION wp_liberar_etapa(p_professor_id UUID, p_etapa_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pode_gerir_welcome_path() THEN
    RAISE EXCEPTION 'Sem permissão para liberar etapas.';
  END IF;

  INSERT INTO welcome_path_progresso (professor_id, etapa_id, liberada_manualmente)
  VALUES (p_professor_id, p_etapa_id, true)
  ON CONFLICT (professor_id, etapa_id)
  DO UPDATE SET liberada_manualmente = true;
END;
$$;
GRANT EXECUTE ON FUNCTION wp_liberar_etapa(UUID, UUID) TO authenticated;

/** Zera a etapa para o professor refazer: apaga as respostas, limpa nota e
 *  conclusão. Mantém `tempo_segundos` (o tempo foi gasto de verdade). */
CREATE OR REPLACE FUNCTION wp_resetar_etapa(p_professor_id UUID, p_etapa_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pode_gerir_welcome_path() THEN
    RAISE EXCEPTION 'Sem permissão para resetar etapas.';
  END IF;

  DELETE FROM welcome_path_respostas r
   USING welcome_path_questoes q
   WHERE q.id = r.questao_id
     AND r.professor_id = p_professor_id
     AND q.etapa_id     = p_etapa_id;

  UPDATE welcome_path_progresso
     SET concluida_em = NULL, nota = NULL, tentativas = 0, revisao_pendente = false
   WHERE professor_id = p_professor_id AND etapa_id = p_etapa_id;
END;
$$;
GRANT EXECUTE ON FUNCTION wp_resetar_etapa(UUID, UUID) TO authenticated;

/** Corrige uma dissertativa e recalcula a etapa (pode concluí-la na hora). */
CREATE OR REPLACE FUNCTION wp_revisar_resposta(
  p_resposta_id UUID,
  p_correta     BOOLEAN,
  p_comentario  TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_professor UUID;
  v_etapa     UUID;
BEGIN
  IF NOT pode_gerir_welcome_path() THEN
    RAISE EXCEPTION 'Sem permissão para revisar respostas.';
  END IF;

  SELECT r.professor_id, q.etapa_id
    INTO v_professor, v_etapa
    FROM welcome_path_respostas r
    JOIN welcome_path_questoes  q ON q.id = r.questao_id
   WHERE r.id = p_resposta_id
     FOR UPDATE OF r;

  IF NOT FOUND THEN RAISE EXCEPTION 'Resposta não encontrada.'; END IF;

  UPDATE welcome_path_respostas
     SET correta            = p_correta,
         revisado_por       = auth.uid(),
         revisado_em        = NOW(),
         comentario_revisao = NULLIF(btrim(COALESCE(p_comentario, '')), '')
   WHERE id = p_resposta_id;

  PERFORM wp_recalcular_etapa(v_professor, v_etapa);
END;
$$;
GRANT EXECUTE ON FUNCTION wp_revisar_resposta(UUID, BOOLEAN, TEXT) TO authenticated;


-- ── 10. Faxina das sessões expiradas ─────────────────────────────────────────
-- SQL puro, sem net.http_post e sem service_role key (mesma decisão de 20260738).

CREATE OR REPLACE FUNCTION wp_limpar_sessoes() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_qtd INTEGER;
BEGIN
  DELETE FROM welcome_path_sessoes WHERE expira_em < NOW();
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  RETURN v_qtd;
END;
$$;
REVOKE EXECUTE ON FUNCTION wp_limpar_sessoes() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('king-limpar-sessoes-wp')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-limpar-sessoes-wp');
SELECT cron.schedule('king-limpar-sessoes-wp', '30 3 * * *', $$ SELECT wp_limpar_sessoes(); $$);


-- ── 11. Seed: 7 etapas em branco ─────────────────────────────────────────────
-- Só na primeira vez — a tela não nasce vazia e a coordenação preenche pelo
-- editor. O conteúdo real do app antigo entra depois, por import (ver o plano).

INSERT INTO welcome_path_etapas (ordem, titulo, descricao, nota_minima)
SELECT n,
       'Etapa ' || n,
       'Conteúdo da etapa ' || n || ' — edite em Onboarding → Conteúdo.',
       80
  FROM generate_series(1, 7) AS n
 WHERE NOT EXISTS (SELECT 1 FROM welcome_path_etapas);
