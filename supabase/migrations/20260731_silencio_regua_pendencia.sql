-- ─────────────────────────────────────────────────────────────────────────────
-- Controle de Pendências — nova lógica de acompanhamento (2026-07-14)
--
-- Regras novas:
--  1. O professor permanece na régua APENAS enquanto está irregular, onde
--     "irregular" = aulas_pendentes >= 2 × nº de alunos (severidade >= 2).
--     Regularizou (pendências abaixo de 2× alunos) → sai da listagem, encerra o
--     fluxo de notificações. Consequência: quem regulariza após a 1ª msg não
--     chega na 2ª; após a 2ª, não chega na 3ª. Só quem segue irregular avança.
--  2. Ao alcançar a 3ª etapa (reuniao) ainda irregular, o sistema:
--     - marca o episódio com "precisa_mes_analise" (status de recomendação);
--     - gera automaticamente um incidente de auditoria (nexus_incidents) com
--       pendências, período, etapa, datas das mensagens e situação atual.
--     NÃO coloca no Mês de Análise automaticamente — um humano decide.
--
-- O estágio (qual mensagem) segue por dias: >=6 alerta, >=9 reforço, >=12 reunião.
-- O piso de ~6 dias é a carência do KMS (só marca pendência após ~1 semana), então
-- quando as pendências são significativas o atraso mais antigo já é >= 6 dias.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Colunas do episódio: recomendação de Mês de Análise + link do incidente ─
ALTER TABLE acompanhamento_silencio
  ADD COLUMN IF NOT EXISTS precisa_mes_analise    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE acompanhamento_silencio
  ADD COLUMN IF NOT EXISTS precisa_mes_analise_em TIMESTAMPTZ;
ALTER TABLE acompanhamento_silencio
  ADD COLUMN IF NOT EXISTS incidente_id           UUID;   -- incidente de auditoria gerado (idempotência)

COMMENT ON COLUMN acompanhamento_silencio.precisa_mes_analise IS
  'True quando o professor chegou à 3ª etapa sem regularizar — recomendação de colocar em Mês de Análise. Não coloca automaticamente.';


-- ── 2. Job diário — régua por severidade + escalada da 3ª etapa ────────────────
-- Assinatura muda (nova coluna `escalados`) → precisa dropar antes do replace.
-- O cron chama pelo nome em runtime, então dropar/recriar não quebra o agendamento.
DROP FUNCTION IF EXISTS rodar_deteccao_silencio();

CREATE OR REPLACE FUNCTION rodar_deteccao_silencio()
RETURNS TABLE(abertos INT, atualizados INT, fechados INT, escalados INT) AS $$
DECLARE
  -- Limiares de DIAS (estágio / qual mensagem). Ajuste conforme calibrar.
  T1 CONSTANT INT := 6;   -- alerta        (1ª msg)
  T2 CONSTANT INT := 9;   -- aviso_saida   (2ª msg)
  T3 CONSTANT INT := 12;  -- reuniao       (3ª msg)
  v_semana DATE := date_trunc('week', CURRENT_DATE)::date;
  v_abertos INT := 0; v_atualizados INT := 0; v_fechados INT := 0; v_escalados INT := 0;
  v_ep RECORD;
  v_inc_id UUID;
  v_limite INT;
  v_desc TEXT;
BEGIN
  -- 2a. Fecha episódios de quem NÃO está mais irregular: desligado, sem sinal, ou
  --     pendências abaixo de 2× alunos (regularizou). Grava o incidente permanente.
  WITH ctx AS (
    SELECT
      s.*,
      p.status AS prof_status,
      pa.aulas_pendentes_qtd AS qtd_now,
      pa.aulas_pendentes_data_mais_antiga AS data_now,
      (SELECT count(*) FROM professor_alunos_kms a WHERE a.professor_id = s.professor_id) AS n_alunos
    FROM acompanhamento_silencio s
    JOIN professores p ON p.id = s.professor_id
    LEFT JOIN professor_acompanhamento pa ON pa.professor_id = s.professor_id
  ), voltaram AS (
    SELECT * FROM ctx
    WHERE prof_status = 'desligado'
       OR data_now IS NULL
       OR (CURRENT_DATE - data_now) < T1
       OR COALESCE(qtd_now, 0) < 2 * GREATEST(n_alunos, 1)   -- regularizou (severidade < 2)
  ), gravados AS (
    INSERT INTO silencio_incidente (professor_id, aberto_em, dias_pico, aulas_pendentes_pico, status_final)
    SELECT professor_id, aberto_em, dias_pico, aulas_pendentes, status FROM voltaram
    RETURNING professor_id
  )
  DELETE FROM acompanhamento_silencio s USING gravados g WHERE s.professor_id = g.professor_id;
  GET DIAGNOSTICS v_fechados = ROW_COUNT;

  -- 2b. Abre/atualiza episódios de quem está IRREGULAR: pendências >= 2× alunos
  --     E atraso >= T1 (ativos + pausa). Preserva as flags de mensagem e a
  --     recomendação de Mês de Análise (não são tocadas aqui).
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
  ), irregulares AS (
    SELECT * FROM atual WHERE COALESCE(qtd, 0) >= 2 * GREATEST(n_alunos, 1)
  ), upsert AS (
    INSERT INTO acompanhamento_silencio AS s
      (professor_id, status, dias_pendente, dias_pico, aulas_pendentes, qtd_alunos, severidade_nx, data_mais_antiga, atualizado_em)
    SELECT
      professor_id,
      CASE WHEN dias >= T3 THEN 'reuniao' WHEN dias >= T2 THEN 'aviso_saida' ELSE 'alerta' END,
      dias, dias, qtd, n_alunos,
      CASE WHEN n_alunos = 0 THEN NULL ELSE round(qtd::numeric / n_alunos, 1) END,
      data_antiga, NOW()
    FROM irregulares
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
    RETURNING (xmax = 0) AS inseriu
  )
  SELECT count(*) FILTER (WHERE inseriu), count(*) FILTER (WHERE NOT inseriu)
  INTO v_abertos, v_atualizados
  FROM upsert;

  -- 2c. Snapshot semanal (uma linha por professor/semana; guarda o pico).
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

  -- 2d. Escalada: quem chegou à 3ª etapa (reuniao) ainda irregular e sem
  --     recomendação registrada → marca precisa_mes_analise + gera incidente
  --     de auditoria. Idempotente (só onde precisa_mes_analise = false).
  FOR v_ep IN
    SELECT s.professor_id, s.aulas_pendentes, s.qtd_alunos, s.dias_pendente, s.dias_pico,
           s.data_mais_antiga, s.aberto_em, s.msg_resolucao_em, s.msg_saida_alunos_em,
           s.reuniao_solicitada_em, p.nome
    FROM acompanhamento_silencio s
    JOIN professores p ON p.id = s.professor_id
    WHERE s.status = 'reuniao' AND s.precisa_mes_analise = false
  LOOP
    v_limite := 2 * GREATEST(COALESCE(v_ep.qtd_alunos, 0), 1);
    v_inc_id := gen_random_uuid();

    v_desc := format(
      E'[Detecção de pendências] %s atingiu a 3ª notificação (aplicação da medida) sem regularizar.\n\n'
      || E'• Pendências acumuladas: %s aula(s)\n'
      || E'• Alunos vinculados: %s (regulariza abaixo de %s pendências)\n'
      || E'• Dias sem lançar (aula pendente mais antiga): %s\n'
      || E'• Aula pendente mais antiga: %s\n'
      || E'• Episódio aberto em: %s (há %s dias)\n'
      || E'• Etapa da régua: 3ª notificação (reunião / aplicação da medida)\n'
      || E'• Data de geração do incidente: %s\n'
      || E'• Mensagens enviadas — 1ª (alerta): %s · 2ª (reforço): %s · 3ª (aplicação): %s\n\n'
      || E'Recomendação: avaliar colocação em Mês de Análise.',
      v_ep.nome,
      v_ep.aulas_pendentes,
      COALESCE(v_ep.qtd_alunos::text, '—'), v_limite,
      v_ep.dias_pendente,
      COALESCE(to_char(v_ep.data_mais_antiga, 'DD/MM/YYYY'), '—'),
      to_char(v_ep.aberto_em, 'DD/MM/YYYY'),
      GREATEST((CURRENT_DATE - v_ep.aberto_em::date), 0),
      to_char(NOW(), 'DD/MM/YYYY HH24:MI'),
      COALESCE(to_char(v_ep.msg_resolucao_em, 'DD/MM/YYYY'), 'não registrada'),
      COALESCE(to_char(v_ep.msg_saida_alunos_em, 'DD/MM/YYYY'), 'não registrada'),
      COALESCE(to_char(v_ep.reuniao_solicitada_em, 'DD/MM/YYYY'), 'não registrada')
    );

    INSERT INTO nexus_incidents (
      id, teacher_name, aluno_nome, coordinator, problem_type, urgency, description,
      solution, needs_follow_up, resolved, resolved_at, under_analysis, incident_mode,
      image_urls, natureza, ti_status, created_at, professor_id
    ) VALUES (
      v_inc_id, v_ep.nome, NULL, 'KTM · Detecção de pendências', 'Pendências de lançamento',
      'Alta', v_desc, '', true, false, NULL, false, 'professor',
      '{}'::text[], 'desafio', NULL, NOW(), v_ep.professor_id
    );

    UPDATE acompanhamento_silencio
    SET precisa_mes_analise = true, precisa_mes_analise_em = NOW(), incidente_id = v_inc_id
    WHERE professor_id = v_ep.professor_id;

    v_escalados := v_escalados + 1;
  END LOOP;

  RETURN QUERY SELECT v_abertos, v_atualizados, v_fechados, v_escalados;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rodar_deteccao_silencio() TO service_role;

-- O cron 'king-deteccao-silencio' já chama rodar_deteccao_silencio() — o
-- CREATE OR REPLACE acima basta, sem reagendar.
