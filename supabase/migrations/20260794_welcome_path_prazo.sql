-- ─────────────────────────────────────────────────────────────────────────────
-- Welcome Path: prazo de 5 dias, desbloqueio e acompanhamento (João, 2026-10-07)
--
-- Regras decididas:
--   • o professor tem 120 horas corridas para concluir a trilha, contadas da
--     PRIMEIRA vez que a trilha carrega para ele (depois do código no e-mail).
--     A API do King não informa acesso ao KMS — esse é o único marco medível;
--   • acabou o prazo sem concluir → a trilha trava (a Edge Function
--     `portal-welcome-path` faz o bloqueio) e o professor pede desbloqueio no
--     WhatsApp; o progresso fica guardado;
--   • suporte, coordenação e admin desbloqueiam dando N dias a mais (a tela
--     sugere 2), e cada desbloqueio fica registrado;
--   • concluir = todas as etapas ATIVAS e OBRIGATÓRIAS aprovadas. A conclusão é
--     carimbada uma vez: ativar uma etapa nova depois não "desconclui" ninguém.
--
-- Não confundir com `welcome_path_etapas.prazo_dias`, prazo por etapa contado
-- de `data_inicio` que nunca foi usado (todo NULL em 07/10) e saiu do editor.
--
-- Segurança: mesmo desenho de `welcome_path_progresso` — leitura para quem está
-- logado, escrita só pela Edge Function (service_role) e por funções DEFINER.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Jornada: uma linha por professor ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS welcome_path_jornada (
  professor_id        UUID        PRIMARY KEY REFERENCES professores(id) ON DELETE CASCADE,
  primeiro_acesso_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prazo_em            TIMESTAMPTZ NOT NULL,
  concluida_em        TIMESTAMPTZ,
  ultima_atividade_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  desbloqueios        SMALLINT    NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  welcome_path_jornada                    IS
  'Relógio da trilha de cada professor: nasce no 1º acesso ao portal /welcome-path. Escrita só pela Edge Function e por funções DEFINER.';
COMMENT ON COLUMN welcome_path_jornada.prazo_em           IS
  '1º acesso + 120h; anda para a frente a cada desbloqueio (wp_desbloquear_prazo).';
COMMENT ON COLUMN welcome_path_jornada.concluida_em       IS
  'Quando a última etapa ativa e obrigatória foi aprovada. Carimbada uma vez (trg_wp_conclusao_jornada).';
COMMENT ON COLUMN welcome_path_jornada.ultima_atividade_em IS
  'Última ação do professor no portal (abrir a trilha, estudar, responder).';


-- ── 2. Histórico de desbloqueios ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS welcome_path_desbloqueios (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id   UUID        NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  dias           SMALLINT    NOT NULL CHECK (dias BETWEEN 1 AND 30),
  prazo_anterior TIMESTAMPTZ NOT NULL,
  prazo_novo     TIMESTAMPTZ NOT NULL,
  observacao     TEXT,
  feito_por      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE welcome_path_desbloqueios IS
  'Cada vez que suporte/coordenação deu mais prazo a um professor na trilha.';

CREATE INDEX IF NOT EXISTS idx_wp_desbloqueios_professor
  ON welcome_path_desbloqueios (professor_id, created_at DESC);


-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE welcome_path_jornada      ENABLE ROW LEVEL SECURITY;
ALTER TABLE welcome_path_desbloqueios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wp_jornada_select" ON welcome_path_jornada;
CREATE POLICY "wp_jornada_select" ON welcome_path_jornada
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "wp_desbloqueios_select" ON welcome_path_desbloqueios;
CREATE POLICY "wp_desbloqueios_select" ON welcome_path_desbloqueios
  FOR SELECT TO authenticated USING (true);


-- ── 4. Conclusão da trilha ───────────────────────────────────────────────────
-- Fonte única de "concluiu tudo". Chamada pelo gatilho abaixo (qualquer caminho
-- que aprove uma etapa: quiz, revisão de dissertativa, correção no banco) e na
-- abertura da jornada (quem já tinha terminado antes de existir o relógio).

CREATE OR REPLACE FUNCTION wp_verificar_conclusao(p_professor_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total    INTEGER;
  v_feitas   INTEGER;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE p.concluida_em IS NOT NULL)
    INTO v_total, v_feitas
    FROM welcome_path_etapas e
    LEFT JOIN welcome_path_progresso p
           ON p.etapa_id = e.id AND p.professor_id = p_professor_id
   WHERE e.ativa AND e.obrigatoria;

  IF v_total > 0 AND v_feitas = v_total THEN
    UPDATE welcome_path_jornada
       SET concluida_em = NOW()
     WHERE professor_id = p_professor_id
       AND concluida_em IS NULL;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION wp_verificar_conclusao(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION wp_verificar_conclusao(UUID) TO service_role;

CREATE OR REPLACE FUNCTION trg_wp_conclusao_jornada() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM wp_verificar_conclusao(NEW.professor_id);
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION trg_wp_conclusao_jornada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_wp_conclusao_jornada ON welcome_path_progresso;
CREATE TRIGGER trg_wp_conclusao_jornada
  AFTER UPDATE OF concluida_em ON welcome_path_progresso
  FOR EACH ROW
  WHEN (NEW.concluida_em IS NOT NULL AND OLD.concluida_em IS NULL)
  EXECUTE FUNCTION trg_wp_conclusao_jornada();


-- ── 5. Abertura da jornada (Edge Function, a cada carga da trilha) ───────────
-- Idempotente: na 1ª chamada nasce o relógio; nas seguintes só marca atividade.
-- O prazo de 120h mora AQUI e em nenhum outro lugar.

CREATE OR REPLACE FUNCTION wp_abrir_jornada(p_professor_id UUID)
RETURNS welcome_path_jornada
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_linha welcome_path_jornada;
BEGIN
  INSERT INTO welcome_path_jornada (professor_id, primeiro_acesso_em, prazo_em)
  VALUES (p_professor_id, NOW(), NOW() + INTERVAL '120 hours')
  ON CONFLICT (professor_id) DO UPDATE SET ultima_atividade_em = NOW();

  PERFORM wp_verificar_conclusao(p_professor_id);

  SELECT * INTO v_linha FROM welcome_path_jornada WHERE professor_id = p_professor_id;
  RETURN v_linha;
END;
$$;
REVOKE EXECUTE ON FUNCTION wp_abrir_jornada(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION wp_abrir_jornada(UUID) TO service_role;


-- ── 6. Desbloqueio (suporte, coordenação, admin) ─────────────────────────────
-- Prazo já vencido: conta os dias a partir de agora. Ainda correndo: soma ao
-- prazo atual (é uma extensão, não um castigo por pedir antes).

CREATE OR REPLACE FUNCTION wp_desbloquear_prazo(
  p_professor_id UUID,
  p_dias         INTEGER,
  p_observacao   TEXT DEFAULT NULL
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_j    welcome_path_jornada;
  v_novo TIMESTAMPTZ;
BEGIN
  IF NOT pode_gerir_welcome_path() THEN
    RAISE EXCEPTION 'Sem permissão para desbloquear a trilha.';
  END IF;
  IF p_dias IS NULL OR p_dias < 1 OR p_dias > 30 THEN
    RAISE EXCEPTION 'Escolha de 1 a 30 dias.';
  END IF;

  SELECT * INTO v_j FROM welcome_path_jornada WHERE professor_id = p_professor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este professor ainda não abriu a trilha — o prazo nem começou.';
  END IF;
  IF v_j.concluida_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este professor já concluiu a trilha.';
  END IF;

  v_novo := GREATEST(NOW(), v_j.prazo_em) + make_interval(days => p_dias);

  UPDATE welcome_path_jornada
     SET prazo_em = v_novo, desbloqueios = desbloqueios + 1
   WHERE professor_id = p_professor_id;

  INSERT INTO welcome_path_desbloqueios (professor_id, dias, prazo_anterior, prazo_novo, observacao, feito_por)
  VALUES (p_professor_id, p_dias, v_j.prazo_em, v_novo,
          NULLIF(btrim(COALESCE(p_observacao, '')), ''), auth.uid());

  RETURN v_novo;
END;
$$;
REVOKE EXECUTE ON FUNCTION wp_desbloquear_prazo(UUID, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION wp_desbloquear_prazo(UUID, INTEGER, TEXT) TO authenticated;


-- ── 7. Acompanhamento (aba Welcome Path do /onboarding) ──────────────────────
-- Uma linha por professor, tudo calculado — a tela só decide a situação, porque
-- ela depende do relógio de quem está olhando.
--
-- Quem entra: professor ATIVO que entrou na King a partir do lançamento desta
-- regra (2026-10-07) — aparece sozinho como "não acessou" — ou que já abriu a
-- trilha. O teto de 30 dias no futuro deixa de fora datas de entrada digitadas
-- erradas (há uma em 2060).

CREATE OR REPLACE FUNCTION wp_acompanhamento()
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
  reuniao_marcada_em   TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ativas AS (
    SELECT e.id, e.titulo, e.obrigatoria,
           ROW_NUMBER() OVER (ORDER BY e.ordem)::INTEGER AS numero
      FROM welcome_path_etapas e
     WHERE e.ativa
  ),
  alvo AS (
    SELECT p.*
      FROM professores p
     WHERE p.status = 'ativo'
       AND (
             (p.data_inicio >= DATE '2026-10-07' AND p.data_inicio <= CURRENT_DATE + 30)
          OR EXISTS (SELECT 1 FROM welcome_path_jornada   j WHERE j.professor_id = p.id)
          OR EXISTS (SELECT 1 FROM welcome_path_progresso w WHERE w.professor_id = p.id)
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
      WHERE rp.professor_id = a.id AND rp.status = 'pendente' AND r.data >= NOW())
  FROM alvo a
  LEFT JOIN welcome_path_jornada j ON j.professor_id = a.id
  LEFT JOIN grupos g               ON g.id = a.grupo_id
  LEFT JOIN perfis_publicos pp     ON pp.id = a.coordenador_id
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
