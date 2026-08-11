-- ─────────────────────────────────────────────────────────────────────────────
-- Transferência de aluno: o PRAZO substitui a urgência declarada (2026-08-11).
--
-- Antes: o professor marcava "normal" ou "urgente" — autodeclaração que não
-- dizia nada de concreto e que todo mundo tende a marcar como urgente.
--
-- Agora: ele informa a DATA DA ÚLTIMA AULA que vai dar para o aluno, e a
-- urgência é DERIVADA dela. O compromisso da operação é transferir em até
-- 7 dias úteis a partir do envio do formulário; quem avisa com menos que isso
-- está pedindo algo fora do acordado, e isso vira informe negativo no perfil.
--
-- Regras:
--   • mínimo 1 dia de antecedência (validado na Edge Function);
--   • prazo >= 7 dias úteis  → observação 'ocorrencia' (registro normal);
--   • prazo <  7 dias úteis  → observação 'feedback_negativo'.
--
-- ⚠ CONSEQUÊNCIA EM CADEIA, de propósito: `feedback_negativo` já dispara
-- `trg_observacao_convocacao` (20260745), que cria uma convocação automática
-- do professor. Ou seja, pedido fora do prazo não só marca o perfil — ele
-- chama o professor para conversar. É o comportamento que já vale para
-- qualquer feedback negativo no sistema; se um dia isso inundar a Central de
-- Convocações, o lugar de afrouxar é aqui (trocar o tipo da observação), não lá.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Dias úteis em SQL ─────────────────────────────────────────────────────

/**
 * Dias úteis (seg–sex) entre duas datas, contando as DUAS pontas — mesma
 * semântica de `diasUteisEntre` em src/lib/diasUteis.ts, para o banco e o front
 * nunca discordarem sobre quem está fora do prazo.
 *
 * Sem feriados: não existe calendário de feriados no sistema (ver o cabeçalho de
 * diasUteis.ts). O desvio de um feriado isolado é aceitável; o de todo sábado e
 * domingo não era.
 */
CREATE OR REPLACE FUNCTION dias_uteis_entre(p_de DATE, p_ate DATE) RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_ate IS NULL OR p_de IS NULL OR p_ate < p_de THEN 0 ELSE (
    SELECT count(*)::int
      FROM generate_series(p_de, p_ate, INTERVAL '1 day') d
     WHERE EXTRACT(ISODOW FROM d) < 6
  ) END;
$$;

COMMENT ON FUNCTION dias_uteis_entre(DATE, DATE) IS
  'Dias úteis seg-sex entre duas datas, ambas as pontas incluídas. Espelha diasUteisEntre() do front.';

-- ── 2. Coluna nova + saída da urgência ───────────────────────────────────────

ALTER TABLE transferencias_aluno
  ADD COLUMN IF NOT EXISTS data_ultima_aula DATE;

COMMENT ON COLUMN transferencias_aluno.data_ultima_aula IS
  'Último dia em que o aluno terá aula com este professor. Define a urgência do pedido (não há mais urgência declarada).';

-- Backfill defensivo: em produção a tabela está vazia, mas se alguém aplicar
-- esta migration sobre dados existentes, o NOT NULL abaixo não pode explodir.
-- 7 dias úteis a partir da criação = exatamente o prazo padrão da operação.
UPDATE transferencias_aluno
   SET data_ultima_aula = (created_at::date + 9)
 WHERE data_ultima_aula IS NULL;

ALTER TABLE transferencias_aluno ALTER COLUMN data_ultima_aula SET NOT NULL;

-- A urgência agora é função da data — manter a coluna seria manter duas
-- verdades sobre a mesma coisa.
ALTER TABLE transferencias_aluno DROP COLUMN IF EXISTS urgencia;

-- Fila ordenada pelo que de fato importa: a data em que o aluno para.
CREATE INDEX IF NOT EXISTS idx_transf_prazo
  ON transferencias_aluno (data_ultima_aula) WHERE status IN ('pendente', 'em_atendimento');

-- ── 3. Snapshot passa a congelar o prazo ─────────────────────────────────────
-- Recriada por inteiro (a de 20260760 não conhecia data_ultima_aula). Fora os
-- três campos de prazo no fim, é idêntica à anterior.

CREATE OR REPLACE FUNCTION capturar_snapshot_transferencia()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_aluno    professor_alunos_kms%ROWTYPE;
  v_prof     RECORD;
  v_qtd      INTEGER := 0;
  v_pedidos  INTEGER := 0;
  v_saidas   INTEGER := 0;
  v_prazo    INTEGER := 0;
BEGIN
  IF NEW.aluno_id IS NOT NULL THEN
    SELECT * INTO v_aluno
      FROM professor_alunos_kms
     WHERE professor_id = NEW.professor_id AND aluno_id = NEW.aluno_id;

    SELECT count(*) INTO v_saidas
      FROM professor_ciclo_vida_alunos WHERE aluno_id = NEW.aluno_id;
  END IF;

  SELECT p.nome, p.status, p.data_inicio, p.grupo_id,
         g.nome AS grupo_nome, pf.nome AS coordenador_nome,
         a.score_atual, a.score_faixa
    INTO v_prof
    FROM professores p
    LEFT JOIN grupos   g  ON g.id  = p.grupo_id
    LEFT JOIN profiles pf ON pf.id = p.coordenador_id
    LEFT JOIN professor_acompanhamento a ON a.professor_id = p.id
   WHERE p.id = NEW.professor_id;

  SELECT count(*) INTO v_qtd
    FROM professor_alunos_kms WHERE professor_id = NEW.professor_id;

  SELECT count(*) INTO v_pedidos
    FROM transferencias_aluno WHERE professor_id = NEW.professor_id;

  -- Prazo dado pelo professor, congelado: daqui a um mês "faltam 3 dias úteis"
  -- não quer dizer nada, mas "avisou com 3 dias úteis" continua valendo.
  v_prazo := dias_uteis_entre(CURRENT_DATE, NEW.data_ultima_aula);

  NEW.snapshot := jsonb_build_object(
    'capturado_em',            NOW(),
    'aluno_encontrado',        v_aluno.aluno_id IS NOT NULL,
    'aluno_primeiro_nome',     v_aluno.primeiro_nome,
    'aluno_data_adicao',       v_aluno.data_adicao,
    'aluno_dias_com_professor',
        CASE WHEN v_aluno.data_adicao IS NOT NULL
             THEN (CURRENT_DATE - v_aluno.data_adicao) END,
    'aluno_data_matricula_escola', v_aluno.data_matricula_escola,
    'aluno_status',            v_aluno.status_aluno,
    'aluno_status_vinculo',    COALESCE(v_aluno.status_vinculo_codigo, v_aluno.status_vinculo),
    'aluno_tipo_vinculo',      v_aluno.tipo_vinculo,
    'aluno_saidas_historicas', v_saidas,
    'professor_nome',          v_prof.nome,
    'professor_status',        v_prof.status,
    'professor_data_inicio',   v_prof.data_inicio,
    'professor_grupo',         v_prof.grupo_nome,
    'professor_coordenador',   v_prof.coordenador_nome,
    'professor_score',         v_prof.score_atual,
    'professor_score_faixa',   v_prof.score_faixa,
    'professor_qtd_alunos',    v_qtd,
    'professor_pedidos_antes', v_pedidos,
    -- prazo (congelado no envio)
    'prazo_dias_uteis',        v_prazo,
    'prazo_minimo',            7,
    'dentro_do_prazo',         v_prazo >= 7
  );

  RETURN NEW;
END;
$$;

-- ── 4. Observação: tipo depende do prazo ─────────────────────────────────────

/**
 * Registro no perfil do professor, criado junto com o pedido.
 *
 * O TIPO da observação é a régua: dentro do prazo é 'ocorrencia' (registro
 * neutro); fora do prazo é 'feedback_negativo' — que, além de marcar o perfil,
 * dispara a convocação automática de 20260745. Ver o aviso no topo do arquivo.
 */
CREATE OR REPLACE FUNCTION registrar_observacao_transferencia()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_autor UUID;
  v_obs   UUID;
  v_prazo INTEGER;
  v_tipo  TEXT;
  v_texto TEXT;
BEGIN
  SELECT COALESCE(
           pr.coordenador_id,
           (SELECT id FROM profiles
             WHERE (is_admin OR role = 'admin') AND ativo
             ORDER BY created_at LIMIT 1)
         )
    INTO v_autor
    FROM professores pr WHERE pr.id = NEW.professor_id;

  v_prazo := dias_uteis_entre(CURRENT_DATE, NEW.data_ultima_aula);
  v_tipo  := CASE WHEN v_prazo >= 7 THEN 'ocorrencia' ELSE 'feedback_negativo' END;

  v_texto :=
    'Solicitou transferência do aluno ' || NEW.aluno_nome ||
    '. Última aula em ' || to_char(NEW.data_ultima_aula, 'DD/MM/YYYY') ||
    ' (' || v_prazo || ' dia' || CASE WHEN v_prazo = 1 THEN '' ELSE 's' END || ' útil' ||
    CASE WHEN v_prazo = 1 THEN '' ELSE 'eis' END || ' de antecedência)' ||
    CASE WHEN v_prazo < 7
         THEN ' — ABAIXO do prazo de 7 dias úteis acordado.'
         ELSE '.' END ||
    ' Motivo: ' || NEW.motivo ||
    '. Relato: ' || NEW.detalhe;

  BEGIN
    INSERT INTO observacoes (professor_id, coordenador_id, tipo, texto)
    VALUES (NEW.professor_id, v_autor, v_tipo, v_texto)
    RETURNING id INTO v_obs;

    UPDATE transferencias_aluno SET observacao_id = v_obs WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Transferência %: observação no perfil falhou (%). O pedido foi mantido.',
      NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
