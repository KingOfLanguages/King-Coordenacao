-- ─────────────────────────────────────────────────────────────────────────────
-- Welcome Path: dispensar um professor da trilha (João, 2026-10-15)
--
-- A coordenação decide que um professor não precisa fazer a trilha (ex.: quem
-- volta à King, quem já foi treinado de outro jeito). Dispensado:
--   • sai da conta da aba Welcome Path (não aparece como "não acessou",
--     "bloqueado" etc.; tem a situação própria "Dispensado");
--   • no portal, vê um aviso de que foi dispensado e o conteúdo fica aberto
--     para consulta, sem relógio de 120h e sem ordem entre as etapas — a Edge
--     Function `portal-welcome-path` não liga (nem toca) a jornada dele;
--   • a dispensa se desfaz pela mesma tela (apaga a linha); o progresso e a
--     jornada que ele já tinha continuam intactos.
--
-- Quem pode: os mesmos do desbloqueio de prazo (pode_gerir_welcome_path():
-- admin, coordenação, suporte). Quem já concluiu não pode ser dispensado.
-- Aplicar com: supabase db query --linked -f <este arquivo>  (NUNCA db push)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Dispensas: uma linha por professor dispensado ─────────────────────────

CREATE TABLE IF NOT EXISTS welcome_path_dispensas (
  professor_id   UUID        PRIMARY KEY REFERENCES professores(id) ON DELETE CASCADE,
  motivo         TEXT,
  dispensado_por UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE welcome_path_dispensas IS
  'Professores que a coordenação dispensou da trilha. Escrita só por wp_dispensar_trilha / wp_cancelar_dispensa.';

ALTER TABLE welcome_path_dispensas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wp_dispensas_select" ON welcome_path_dispensas;
CREATE POLICY "wp_dispensas_select" ON welcome_path_dispensas
  FOR SELECT TO authenticated USING (true);


-- ── 2. Dispensar e desfazer ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION wp_dispensar_trilha(
  p_professor_id UUID,
  p_motivo       TEXT DEFAULT NULL
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_em TIMESTAMPTZ;
BEGIN
  IF NOT pode_gerir_welcome_path() THEN
    RAISE EXCEPTION 'Sem permissão para dispensar da trilha.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM professores WHERE id = p_professor_id) THEN
    RAISE EXCEPTION 'Professor não encontrado.';
  END IF;
  IF EXISTS (SELECT 1 FROM welcome_path_jornada
              WHERE professor_id = p_professor_id AND concluida_em IS NOT NULL) THEN
    RAISE EXCEPTION 'Este professor já concluiu a trilha.';
  END IF;

  INSERT INTO welcome_path_dispensas (professor_id, motivo, dispensado_por)
  VALUES (p_professor_id, NULLIF(btrim(COALESCE(p_motivo, '')), ''), auth.uid())
  ON CONFLICT (professor_id) DO UPDATE
    SET motivo = EXCLUDED.motivo
  RETURNING created_at INTO v_em;

  RETURN v_em;
END;
$$;
REVOKE EXECUTE ON FUNCTION wp_dispensar_trilha(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION wp_dispensar_trilha(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION wp_cancelar_dispensa(p_professor_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pode_gerir_welcome_path() THEN
    RAISE EXCEPTION 'Sem permissão para desfazer a dispensa.';
  END IF;
  DELETE FROM welcome_path_dispensas WHERE professor_id = p_professor_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION wp_cancelar_dispensa(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION wp_cancelar_dispensa(UUID) TO authenticated;


-- ── 3. Acompanhamento com a dispensa ─────────────────────────────────────────
-- Mesma função de 20260794 com três colunas a mais (quando, por quem e o
-- motivo). Mudou o tipo de retorno, então precisa DROP antes do CREATE.

DROP FUNCTION IF EXISTS wp_acompanhamento();

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
  reuniao_marcada_em   TIMESTAMPTZ,
  dispensado_em        TIMESTAMPTZ,
  dispensado_por       TEXT,
  motivo_dispensa      TEXT
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
          OR EXISTS (SELECT 1 FROM welcome_path_dispensas d WHERE d.professor_id = p.id)
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
    dsp.motivo
  FROM alvo a
  LEFT JOIN welcome_path_jornada j ON j.professor_id = a.id
  LEFT JOIN grupos g               ON g.id = a.grupo_id
  LEFT JOIN perfis_publicos pp     ON pp.id = a.coordenador_id
  LEFT JOIN welcome_path_dispensas dsp ON dsp.professor_id = a.id
  LEFT JOIN perfis_publicos dp     ON dp.id = dsp.dispensado_por
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

COMMIT;
