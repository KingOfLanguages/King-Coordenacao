-- ─────────────────────────────────────────────────────────────────────────────
-- Welcome Path só para quem foi liberado (22/10/2026)
--
-- O RH quer um grupo pequeno de professores na trilha por enquanto. Até aqui,
-- todo professor ativo entrava no portal com o código do e-mail e todo novo
-- desde 07/10 aparecia no acompanhamento. Agora:
--
--   welcome_path_liberacoes  quem pode fazer a trilha (com um rótulo de turma,
--                            ex. "Piloto RH"), quem liberou e quando;
--   welcome_path_config      a chave do modo: só liberados (agora) ou todos os
--                            professores, como era antes. Abrir para todos
--                            depois é virar a chave, não outra obra;
--   welcome_path_convites    cada convite mandado pelo botão da tela (função
--                            convite-trilha), com quem mandou;
--   wp_trilha_liberada()     a regra que o portal (portal-welcome-path) usa;
--   wp_acompanhamento()      passa a listar só os liberados no modo restrito.
--
-- Dispensado também entra: a dispensa (20260800) foi uma decisão explícita da
-- coordenação de deixar o conteúdo aberto para consulta.
--
-- O cargo RH (20260809) entra em pode_gerir_welcome_path(): faz na trilha o
-- mesmo que o suporte.
--
-- Já liberados aqui: os 3 que receberam o convite automático em 22/10 antes da
-- pausa (rótulo "Aguardando o RH", o RH decide se ficam) e as contas de teste
-- da coordenação que já mexeram na trilha.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. RH na gestão da trilha ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pode_gerir_welcome_path() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT is_admin OR role IN ('admin', 'coordenacao', 'suporte', 'rh')
    FROM profiles WHERE id = auth.uid()
  ), false);
$$;


-- ── 2. Modo de acesso ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS welcome_path_config (
  id            BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id),
  so_liberados  BOOLEAN     NOT NULL DEFAULT true,
  alterado_por  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  alterado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO welcome_path_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE welcome_path_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wp_config_select" ON welcome_path_config;
CREATE POLICY "wp_config_select" ON welcome_path_config
  FOR SELECT TO authenticated USING (true);


-- ── 3. Liberações ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS welcome_path_liberacoes (
  professor_id  UUID        PRIMARY KEY REFERENCES professores(id) ON DELETE CASCADE,
  rotulo        TEXT        CHECK (rotulo IS NULL OR char_length(rotulo) <= 60),
  liberado_por  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE welcome_path_liberacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wp_liberacoes_select" ON welcome_path_liberacoes;
CREATE POLICY "wp_liberacoes_select" ON welcome_path_liberacoes
  FOR SELECT TO authenticated USING (true);


-- ── 4. Convites mandados pela tela ──────────────────────────────────────────
-- Os automáticos (cron, 20260807) só deixaram professores.convite_trilha_em.
CREATE TABLE IF NOT EXISTS welcome_path_convites (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id  UUID        NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  enviado_por   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  email         TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS welcome_path_convites_prof_idx
  ON welcome_path_convites (professor_id, created_at DESC);

ALTER TABLE welcome_path_convites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wp_convites_select" ON welcome_path_convites;
CREATE POLICY "wp_convites_select" ON welcome_path_convites
  FOR SELECT TO authenticated USING (pode_gerir_welcome_path());


-- ── 5. A regra de quem entra ────────────────────────────────────────────────
-- Usada pelo portal-welcome-path (service_role). Sem a linha de config, vale o
-- modo restrito: na dúvida, fecha.
CREATE OR REPLACE FUNCTION wp_trilha_liberada(p_professor_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT COALESCE((SELECT so_liberados FROM welcome_path_config WHERE id), true)
      OR EXISTS (SELECT 1 FROM welcome_path_liberacoes WHERE professor_id = p_professor_id)
      OR EXISTS (SELECT 1 FROM welcome_path_dispensas  WHERE professor_id = p_professor_id);
$$;
REVOKE EXECUTE ON FUNCTION wp_trilha_liberada(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION wp_trilha_liberada(UUID) TO service_role;


-- ── 6. Ações da tela ────────────────────────────────────────────────────────

-- Libera vários de uma vez. Quem já estava liberado só troca de rótulo
-- (mantém quem liberou e quando).
CREATE OR REPLACE FUNCTION wp_liberar_professores(
  p_ids    UUID[],
  p_rotulo TEXT DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rotulo TEXT := NULLIF(btrim(COALESCE(p_rotulo, '')), '');
  v_n      INTEGER;
BEGIN
  IF NOT pode_gerir_welcome_path() THEN
    RAISE EXCEPTION 'Sem permissão para liberar a trilha.';
  END IF;
  IF char_length(v_rotulo) > 60 THEN
    RAISE EXCEPTION 'O rótulo pode ter até 60 caracteres.';
  END IF;

  INSERT INTO welcome_path_liberacoes (professor_id, rotulo, liberado_por)
  SELECT p.id, v_rotulo, auth.uid()
    FROM professores p
   WHERE p.id = ANY(p_ids) AND p.status = 'ativo'
  ON CONFLICT (professor_id) DO UPDATE SET rotulo = EXCLUDED.rotulo;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION wp_liberar_professores(UUID[], TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION wp_liberar_professores(UUID[], TEXT) TO authenticated;

-- Tira da trilha. Jornada, progresso e respostas ficam: liberar de novo
-- devolve tudo como estava.
CREATE OR REPLACE FUNCTION wp_retirar_liberacao(p_professor_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pode_gerir_welcome_path() THEN
    RAISE EXCEPTION 'Sem permissão para tirar da trilha.';
  END IF;
  DELETE FROM welcome_path_liberacoes WHERE professor_id = p_professor_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION wp_retirar_liberacao(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION wp_retirar_liberacao(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION wp_definir_acesso(p_so_liberados BOOLEAN) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pode_gerir_welcome_path() THEN
    RAISE EXCEPTION 'Sem permissão para mudar o acesso à trilha.';
  END IF;
  INSERT INTO welcome_path_config (id, so_liberados, alterado_por, alterado_em)
  VALUES (true, p_so_liberados, auth.uid(), NOW())
  ON CONFLICT (id) DO UPDATE
    SET so_liberados = EXCLUDED.so_liberados,
        alterado_por = EXCLUDED.alterado_por,
        alterado_em  = EXCLUDED.alterado_em;
END;
$$;
REVOKE EXECUTE ON FUNCTION wp_definir_acesso(BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION wp_definir_acesso(BOOLEAN) TO authenticated;

-- Quem ainda não foi liberado, para a aba Acesso. Sem busca: os que chegaram
-- nos últimos 30 dias (ou começam nos próximos), mais novos primeiro. Com
-- busca: nome ou e-mail, entre todos os ativos.
CREATE OR REPLACE FUNCTION wp_candidatos_trilha(p_busca TEXT DEFAULT NULL)
RETURNS TABLE (
  professor_id  UUID,
  nome          TEXT,
  email         TEXT,
  data_inicio   DATE,
  grupo         TEXT,
  chegou_em     TIMESTAMPTZ,
  convite_em    TIMESTAMPTZ,
  abriu_trilha  BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH q AS (SELECT NULLIF(btrim(COALESCE(p_busca, '')), '') AS termo)
  SELECT p.id, p.nome, p.email, p.data_inicio, g.nome, p.created_at, p.convite_trilha_em,
         EXISTS (SELECT 1 FROM welcome_path_jornada j WHERE j.professor_id = p.id)
    FROM professores p
    CROSS JOIN q
    LEFT JOIN grupos g ON g.id = p.grupo_id
   WHERE pode_gerir_welcome_path()
     AND p.status = 'ativo'
     AND NOT EXISTS (SELECT 1 FROM welcome_path_liberacoes l WHERE l.professor_id = p.id)
     AND CASE
           WHEN q.termo IS NULL THEN
                p.created_at >= NOW() - INTERVAL '30 days'
             OR p.data_inicio >= CURRENT_DATE - 30
           ELSE p.nome ILIKE '%' || q.termo || '%' OR p.email ILIKE '%' || q.termo || '%'
         END
   ORDER BY CASE WHEN q.termo IS NULL THEN p.created_at END DESC NULLS LAST, p.nome
   LIMIT 60;
$$;
REVOKE EXECUTE ON FUNCTION wp_candidatos_trilha(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION wp_candidatos_trilha(TEXT) TO authenticated;


-- ── 7. Acompanhamento ───────────────────────────────────────────────────────
-- Colunas novas no fim; o tipo de retorno mudou, então DROP antes.
DROP FUNCTION IF EXISTS wp_acompanhamento();

CREATE FUNCTION wp_acompanhamento()
RETURNS TABLE (
  professor_id         UUID,
  nome                 TEXT,
  telefone             TEXT,
  data_inicio          DATE,
  grupo                TEXT,
  coordenador          TEXT,
  primeiro_acesso_em   TIMESTAMPTZ,
  prazo_em             TIMESTAMPTZ,
  concluida_em         TIMESTAMPTZ,
  ultima_atividade_em  TIMESTAMPTZ,
  desbloqueios         INTEGER,
  etapas_obrigatorias  INTEGER,
  etapas_concluidas    INTEGER,
  etapas_visiveis      INTEGER,
  etapa_atual_numero   INTEGER,
  etapa_atual_titulo   TEXT,
  tempo_segundos       INTEGER,
  nota_media           NUMERIC,
  revisao_pendente     BOOLEAN,
  so_falta_revisao     BOOLEAN,
  primeira_reuniao_em  TIMESTAMPTZ,
  reuniao_marcada_em   TIMESTAMPTZ,
  dispensado_em        TIMESTAMPTZ,
  dispensado_por       TEXT,
  motivo_dispensa      TEXT,
  email                TEXT,
  liberado_em          TIMESTAMPTZ,
  liberado_por         TEXT,
  rotulo               TEXT,
  convite_em           TIMESTAMPTZ,
  convite_manual       BOOLEAN,
  convite_por          TEXT,
  revisoes_pendentes   INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ativas AS (
    SELECT e.id, e.titulo, e.obrigatoria,
           ROW_NUMBER() OVER (ORDER BY e.ordem)::INTEGER AS numero
      FROM welcome_path_etapas e
     WHERE e.ativa
  ),
  modo AS (
    SELECT COALESCE((SELECT so_liberados FROM welcome_path_config WHERE id), true) AS so_liberados
  ),
  alvo AS (
    SELECT p.*
      FROM professores p
      CROSS JOIN modo m
     WHERE p.status = 'ativo'
       AND (
             EXISTS (SELECT 1 FROM welcome_path_liberacoes l WHERE l.professor_id = p.id)
          OR EXISTS (SELECT 1 FROM welcome_path_dispensas  d WHERE d.professor_id = p.id)
          OR (NOT m.so_liberados AND (
                (p.data_inicio >= DATE '2026-10-07' AND p.data_inicio <= CURRENT_DATE + 30)
             OR EXISTS (SELECT 1 FROM welcome_path_jornada   j WHERE j.professor_id = p.id)
             OR EXISTS (SELECT 1 FROM welcome_path_progresso w WHERE w.professor_id = p.id)
          ))
       )
  )
  SELECT
    a.id,
    a.nome,
    a.telefone,
    a.data_inicio,
    g.nome,
    pp.nome,
    j.primeiro_acesso_em,
    j.prazo_em,
    j.concluida_em,
    j.ultima_atividade_em,
    COALESCE(j.desbloqueios, 0)::INTEGER,
    (SELECT COUNT(*) FROM ativas WHERE obrigatoria)::INTEGER,
    (SELECT COUNT(*) FROM ativas x
       JOIN welcome_path_progresso w ON w.etapa_id = x.id AND w.professor_id = a.id
      WHERE x.obrigatoria AND w.concluida_em IS NOT NULL)::INTEGER,
    (SELECT COUNT(*) FROM ativas)::INTEGER,
    atual.numero,
    atual.titulo,
    COALESCE((SELECT SUM(w.tempo_segundos) FROM welcome_path_progresso w WHERE w.professor_id = a.id), 0)::INTEGER,
    (SELECT ROUND(AVG(w.nota), 1) FROM welcome_path_progresso w
      WHERE w.professor_id = a.id AND w.nota IS NOT NULL),
    EXISTS (SELECT 1 FROM welcome_path_progresso w WHERE w.professor_id = a.id AND w.revisao_pendente),
    -- Tudo que falta já foi enviado e espera correção: aí o relógio não trava
    -- (a demora é da coordenação, não do professor). Mesma regra da Edge Function.
    (EXISTS (SELECT 1 FROM ativas x WHERE x.obrigatoria)
     AND NOT EXISTS (
       SELECT 1 FROM ativas x
         LEFT JOIN welcome_path_progresso w ON w.etapa_id = x.id AND w.professor_id = a.id
        WHERE x.obrigatoria
          AND w.concluida_em IS NULL
          AND NOT COALESCE(w.revisao_pendente, false)
     )
     AND EXISTS (
       SELECT 1 FROM ativas x
         JOIN welcome_path_progresso w ON w.etapa_id = x.id AND w.professor_id = a.id
        WHERE x.obrigatoria AND w.concluida_em IS NULL AND w.revisao_pendente
     )),
    (SELECT MIN(r.data) FROM reuniao_professores rp
       JOIN reunioes r ON r.id = rp.reuniao_id
      WHERE rp.professor_id = a.id AND rp.status = 'realizada'),
    (SELECT MIN(r.data) FROM reuniao_professores rp
       JOIN reunioes r ON r.id = rp.reuniao_id
      WHERE rp.professor_id = a.id AND rp.status = 'pendente' AND r.data >= NOW()),
    dsp.created_at,
    dp.nome,
    dsp.motivo,
    a.email,
    lib.created_at,
    lp.nome,
    lib.rotulo,
    a.convite_trilha_em,
    cv.professor_id IS NOT NULL,
    cp.nome,
    (SELECT COUNT(*) FROM welcome_path_progresso w
      WHERE w.professor_id = a.id AND w.revisao_pendente)::INTEGER
  FROM alvo a
  LEFT JOIN welcome_path_jornada j ON j.professor_id = a.id
  LEFT JOIN grupos g               ON g.id = a.grupo_id
  LEFT JOIN perfis_publicos pp     ON pp.id = a.coordenador_id
  LEFT JOIN welcome_path_dispensas dsp ON dsp.professor_id = a.id
  LEFT JOIN perfis_publicos dp     ON dp.id = dsp.dispensado_por
  LEFT JOIN welcome_path_liberacoes lib ON lib.professor_id = a.id
  LEFT JOIN perfis_publicos lp     ON lp.id = lib.liberado_por
  LEFT JOIN LATERAL (
    SELECT c.professor_id, c.enviado_por
      FROM welcome_path_convites c
     WHERE c.professor_id = a.id
     ORDER BY c.created_at DESC
     LIMIT 1
  ) cv ON true
  LEFT JOIN perfis_publicos cp     ON cp.id = cv.enviado_por
  LEFT JOIN LATERAL (
    SELECT x.numero, x.titulo
      FROM ativas x
      LEFT JOIN welcome_path_progresso w ON w.etapa_id = x.id AND w.professor_id = a.id
     WHERE w.concluida_em IS NULL
     ORDER BY x.numero
     LIMIT 1
  ) atual ON true
  WHERE pode_gerir_welcome_path();
$$;
REVOKE EXECUTE ON FUNCTION wp_acompanhamento() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION wp_acompanhamento() TO authenticated;


-- ── 8. Convite automático só para liberado ──────────────────────────────────
-- O job king-convite-trilha está pausado (20260808). Se alguém religar no modo
-- restrito, ele não manda para quem não foi liberado.
CREATE OR REPLACE FUNCTION convites_trilha_pendentes()
RETURNS TABLE (id UUID, nome TEXT, email TEXT, tentativas SMALLINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.email, p.convite_trilha_tentativas
  FROM professores p
  WHERE p.convite_trilha_em IS NULL
    AND p.convite_trilha_tentativas < 3
    AND p.status = 'ativo'
    AND p.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    AND p.created_at >= GREATEST('2026-10-22 13:00+00'::timestamptz, now() - interval '3 days')
    AND (p.data_inicio IS NULL OR p.data_inicio >= current_date - 30)
    AND NOT EXISTS (SELECT 1 FROM welcome_path_jornada j WHERE j.professor_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM welcome_path_dispensas d WHERE d.professor_id = p.id)
    AND (
          NOT COALESCE((SELECT so_liberados FROM welcome_path_config WHERE id), true)
       OR EXISTS (SELECT 1 FROM welcome_path_liberacoes l WHERE l.professor_id = p.id)
    )
  ORDER BY p.created_at
  LIMIT 20;
$$;


-- ── 9. Quem já começa liberado ──────────────────────────────────────────────
INSERT INTO welcome_path_liberacoes (professor_id, rotulo)
SELECT p.id, 'Aguardando o RH'
  FROM professores p
 WHERE p.convite_trilha_em IS NOT NULL
ON CONFLICT (professor_id) DO NOTHING;

INSERT INTO welcome_path_liberacoes (professor_id, rotulo)
SELECT p.id, 'Teste'
  FROM professores p
 WHERE p.nome ILIKE '%teste%'
   AND (EXISTS (SELECT 1 FROM welcome_path_progresso w WHERE w.professor_id = p.id)
     OR EXISTS (SELECT 1 FROM welcome_path_jornada   j WHERE j.professor_id = p.id))
ON CONFLICT (professor_id) DO NOTHING;

COMMIT;
