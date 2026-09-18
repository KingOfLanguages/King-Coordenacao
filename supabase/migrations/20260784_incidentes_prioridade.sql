-- ─────────────────────────────────────────────────────────────────────────────
-- Prioridade de incidentes e informes (2026-09-18).
--
-- Medido antes de mexer (desafios desde julho):
--   • 44 de 120 desafios eram "Crítico" (37%), 32 deles Bugs: com um terço
--     marcado como crítico, o nível deixou de separar alguma coisa;
--   • no prazo: Crítico 41%, Alta 33%, Média 6% (a Média levava 6 dias, na
--     mediana, até a PRIMEIRA ação, com prazo de 3 para resolver);
--   • dos 22 desafios abertos, 11 vencidos e NENHUM assumido;
--   • 326 informes "abertos" enchiam a lista de ativos (informe nunca fecha).
--
-- O que muda aqui (a tela mora em src/lib/incidentePrioridade.ts):
--   1. Quatro níveis: Baixa, Média, Alta, Urgente. "Crítico"/"Crítica" viram
--      Urgente, e Urgente exige uma frase de justificativa (freio da inflação).
--   2. Dois prazos por nível, em dias úteis: 1ª ação e resolução. A 1ª ação é
--      calculada aqui (o front só exibe); a resolução continua sugerida pela
--      tela e editável, com fallback aqui quando vem vazia.
--   3. primeira_acao_em: quando alguém assumiu ou concluiu pela primeira vez.
--   4. Informe ganha ciência (Novo → Ciente) e perde prazo: prioridade de
--      informe é importância de leitura, não compromisso de resolução.
--   5. Histórico de toda mudança de prioridade (quem, quando, de → para, por quê).
--   6. Avisos no sino: Urgente na hora (criado OU elevado depois); 1ª ação e
--      resolução que acabaram de vencer, uma vez por chamado (cron 15 em 15 min).
--
-- Cuidado com o nexus-sync: ele faz upsert de TODAS as linhas vindas do Nexus a
-- cada 30 min, reescrevendo `urgency` com o mesmo valor. Todo gatilho de UPDATE
-- aqui compara OLD × NEW — "UPDATE OF urgency" dispara mesmo sem mudança.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Colunas ───────────────────────────────────────────────────────────────

ALTER TABLE nexus_incidents
  ADD COLUMN IF NOT EXISTS urgencia_justificativa TEXT,
  ADD COLUMN IF NOT EXISTS prazo_primeira_acao    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS primeira_acao_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ciente_por             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ciente_em              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alerta_primeira_acao_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alerta_atraso_em       TIMESTAMPTZ;

COMMENT ON COLUMN nexus_incidents.urgencia_justificativa IS
  'Por que o chamado é Urgente. Obrigatória ao marcar Urgente; limpa quando a prioridade desce.';
COMMENT ON COLUMN nexus_incidents.prazo_primeira_acao IS
  'Até quando alguém precisa assumir (ou concluir). Calculado por incidente_prazo_primeira_acao() a partir da prioridade.';
COMMENT ON COLUMN nexus_incidents.primeira_acao_em IS
  'Primeira vez que alguém assumiu ou concluiu. Largar não apaga.';
COMMENT ON COLUMN nexus_incidents.ciente_por IS
  'Informe: quem marcou como ciente (leu). NULL = informe novo.';
COMMENT ON COLUMN nexus_incidents.alerta_primeira_acao_em IS
  'Trava de idempotência: aviso de "ninguém assumiu no prazo" já enviado.';
COMMENT ON COLUMN nexus_incidents.alerta_atraso_em IS
  'Trava de idempotência: aviso de "prazo de resolução vencido" já enviado.';

-- ── 2. Prazos em dias úteis ──────────────────────────────────────────────────
-- Horário de trabalho 08:00–18:00, segunda a sexta, no fuso de São Paulo (o
-- banco roda em UTC). Sem feriados, pelo mesmo motivo de dias_uteis_entre.

/** Fim (23:59:59, São Paulo) de uma data local. */
CREATE OR REPLACE FUNCTION fim_do_dia_sp(p_dia DATE) RETURNS TIMESTAMPTZ
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT (p_dia + TIME '23:59:59') AT TIME ZONE 'America/Sao_Paulo';
$fn$;

/** Soma horas ÚTEIS (seg–sex, 08–18h São Paulo) a um instante. */
CREATE OR REPLACE FUNCTION somar_horas_uteis(p_de TIMESTAMPTZ, p_horas NUMERIC)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_cur   TIMESTAMP := p_de AT TIME ZONE 'America/Sao_Paulo';
  v_resto INTERVAL  := p_horas * INTERVAL '1 hour';
  v_fim   TIMESTAMP;
BEGIN
  LOOP
    -- Leva o cursor para dentro do expediente.
    IF EXTRACT(ISODOW FROM v_cur) >= 6 THEN
      v_cur := date_trunc('day', v_cur) + INTERVAL '1 day' + TIME '08:00';
      CONTINUE;
    END IF;
    IF v_cur::time < TIME '08:00' THEN
      v_cur := date_trunc('day', v_cur) + TIME '08:00';
    ELSIF v_cur::time >= TIME '18:00' THEN
      v_cur := date_trunc('day', v_cur) + INTERVAL '1 day' + TIME '08:00';
      CONTINUE;
    END IF;

    v_fim := date_trunc('day', v_cur) + TIME '18:00';
    IF v_cur + v_resto <= v_fim THEN
      RETURN (v_cur + v_resto) AT TIME ZONE 'America/Sao_Paulo';
    END IF;
    v_resto := v_resto - (v_fim - v_cur);
    v_cur   := date_trunc('day', v_cur) + INTERVAL '1 day' + TIME '08:00';
  END LOOP;
END;
$fn$;

/**
 * Prazo da 1ª ação por prioridade, contado de p_de:
 *   Urgente → 2 horas úteis
 *   Alta    → fim do mesmo dia útil (registrado fora do expediente: fim do próximo)
 *   Média   → fim do 2º dia útil seguinte
 *   Baixa   → fim do 5º dia útil seguinte
 * Espelha PRIORIDADES em src/lib/incidentePrioridade.ts.
 */
CREATE OR REPLACE FUNCTION incidente_prazo_primeira_acao(p_urgencia TEXT, p_de TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_local TIMESTAMP := p_de AT TIME ZONE 'America/Sao_Paulo';
  v_dia   DATE      := v_local::date;
BEGIN
  CASE p_urgencia
    WHEN 'Urgente' THEN
      RETURN somar_horas_uteis(p_de, 2);
    WHEN 'Alta' THEN
      IF EXTRACT(ISODOW FROM v_dia) < 6 AND v_local::time < TIME '18:00' THEN
        RETURN fim_do_dia_sp(v_dia);
      END IF;
      RETURN fim_do_dia_sp(dias_uteis_depois(v_dia + 1, 1));
    WHEN 'Baixa' THEN
      RETURN fim_do_dia_sp(dias_uteis_depois(v_dia + 1, 5));
    ELSE  -- Média e qualquer valor desconhecido
      RETURN fim_do_dia_sp(dias_uteis_depois(v_dia + 1, 2));
  END CASE;
END;
$fn$;

/**
 * Prazo de resolução padrão (fim do N-ésimo dia útil após o registro):
 * Urgente 1 · Alta 2 · Média 5 · Baixa 10. É o mesmo mapa que a tela sugere;
 * aqui só entra quando o chamado chega sem prazo.
 */
CREATE OR REPLACE FUNCTION incidente_prazo_resolucao(p_urgencia TEXT, p_de TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT fim_do_dia_sp(dias_uteis_depois(
    (p_de AT TIME ZONE 'America/Sao_Paulo')::date + 1,
    CASE p_urgencia WHEN 'Urgente' THEN 1 WHEN 'Alta' THEN 2 WHEN 'Baixa' THEN 10 ELSE 5 END
  ));
$fn$;

GRANT EXECUTE ON FUNCTION fim_do_dia_sp(DATE)                              TO authenticated;
GRANT EXECUTE ON FUNCTION somar_horas_uteis(TIMESTAMPTZ, NUMERIC)          TO authenticated;
GRANT EXECUTE ON FUNCTION incidente_prazo_primeira_acao(TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION incidente_prazo_resolucao(TEXT, TIMESTAMPTZ)     TO authenticated;

-- ── 3. Dados existentes ──────────────────────────────────────────────────────
-- Antes de criar os gatilhos, para o acerto em massa não virar histórico nem aviso.

-- Crítico/Crítica → Urgente. Os 45 legados ficam com uma justificativa que diz
-- de onde vieram, para ninguém achar que alguém burlou a regra.
UPDATE nexus_incidents
   SET urgency = 'Urgente',
       urgencia_justificativa = COALESCE(urgencia_justificativa,
         '(marcado como "Crítico" antes de a justificativa ser obrigatória)')
 WHERE urgency IN ('Crítico', 'Crítica');

-- 1ª ação de quem já foi assumido ou concluído.
UPDATE nexus_incidents
   SET primeira_acao_em = COALESCE(assumido_em, resolved_at)
 WHERE primeira_acao_em IS NULL
   AND (assumido_em IS NOT NULL OR resolved_at IS NOT NULL);

-- Prazo de 1ª ação dos desafios desde julho (quando nasceu a separação
-- desafio × informe): é o que dá histórico ao painel de desempenho.
-- Mais os abertos antigos (natureza NULL = desafio legado), que precisam de
-- prazo para entrar na fila por prioridade.
UPDATE nexus_incidents
   SET prazo_primeira_acao = incidente_prazo_primeira_acao(urgency, created_at)
 WHERE COALESCE(natureza, 'desafio') = 'desafio'
   AND problem_type <> 'Mês de análise'
   AND (created_at >= '2026-07-01' OR resolved = false)
   AND prazo_primeira_acao IS NULL;

-- Informe não tem prazo. Os 137 que tinham só geravam "vencido" falso.
UPDATE nexus_incidents
   SET prazo_resolucao = NULL, prazo_primeira_acao = NULL
 WHERE natureza = 'informe';

-- Ciência retroativa: informes com mais de 7 dias contam como lidos. Sem isso a
-- aba de informes nasceria com 300 "novos" e ninguém olharia nenhum.
UPDATE nexus_incidents
   SET ciente_em = created_at
 WHERE natureza = 'informe'
   AND ciente_em IS NULL
   AND created_at < NOW() - INTERVAL '7 days';

-- O que já está vencido hoje aparece no placar da tela; o aviso existe para o
-- que ACABOU de vencer (mesma regra da transferência atrasada).
UPDATE nexus_incidents
   SET alerta_primeira_acao_em = NOW()
 WHERE resolved = false AND primeira_acao_em IS NULL
   AND prazo_primeira_acao < NOW();
UPDATE nexus_incidents
   SET alerta_atraso_em = NOW()
 WHERE resolved = false AND prazo_resolucao < NOW();

-- ── 4. Histórico de prioridade ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS incidente_prioridade_historico (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  incidente_id  UUID        NOT NULL REFERENCES nexus_incidents(id) ON DELETE CASCADE,
  de            TEXT,                 -- NULL = registrado já com `para`
  para          TEXT        NOT NULL,
  justificativa TEXT,
  alterado_por  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  alterado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE incidente_prioridade_historico IS
  'Toda definição/mudança de prioridade de um incidente. Inserido só pelo gatilho; leitura segue a RLS do incidente.';

CREATE INDEX IF NOT EXISTS idx_prioridade_hist_incidente
  ON incidente_prioridade_historico (incidente_id, alterado_em);

ALTER TABLE incidente_prioridade_historico ENABLE ROW LEVEL SECURITY;

-- Quem enxerga o incidente enxerga o histórico dele (o EXISTS passa pela RLS
-- de nexus_incidents, que esconde as categorias só da coordenação).
DROP POLICY IF EXISTS "prioridade_hist_select" ON incidente_prioridade_historico;
CREATE POLICY "prioridade_hist_select" ON incidente_prioridade_historico
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM nexus_incidents i WHERE i.id = incidente_id));

GRANT SELECT ON incidente_prioridade_historico TO authenticated;

-- ── 5. Gatilho BEFORE: normaliza, exige justificativa, calcula prazos ────────

CREATE OR REPLACE FUNCTION incidente_prioridade_antes() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  v_legado   BOOLEAN := false;
  v_informe  BOOLEAN := COALESCE(NEW.natureza, 'desafio') = 'informe';
  v_mudou    BOOLEAN;
BEGIN
  -- Uma aba aberta antes do deploy ainda manda "Crítico". Aceita e converte:
  -- perder um chamado urgente por causa de um rótulo seria pior que a regra.
  IF NEW.urgency IN ('Crítico', 'Crítica') THEN
    NEW.urgency := 'Urgente';
    v_legado := true;
  END IF;

  v_mudou := TG_OP = 'INSERT' OR NEW.urgency IS DISTINCT FROM OLD.urgency;

  IF NEW.urgency = 'Urgente' THEN
    IF v_mudou AND COALESCE(btrim(NEW.urgencia_justificativa), '') = '' THEN
      IF v_legado THEN
        NEW.urgencia_justificativa := '(sem justificativa: enviado por uma versão antiga da tela)';
      ELSE
        RAISE EXCEPTION 'Prioridade Urgente precisa de uma justificativa.'
          USING ERRCODE = 'check_violation',
                HINT = 'Diga em uma frase quem está impedido agora e por quê.';
      END IF;
    END IF;
  ELSE
    NEW.urgencia_justificativa := NULL;
  END IF;

  -- 1ª ação: a primeira vez que alguém assumiu ou concluiu. Usa o carimbo da
  -- própria linha (e não now()) para o upsert do nexus-sync não inventar data.
  IF NEW.primeira_acao_em IS NULL AND (NEW.assumido_por IS NOT NULL OR NEW.resolved) THEN
    NEW.primeira_acao_em := COALESCE(NEW.assumido_em, NEW.resolved_at, NOW());
  END IF;

  IF v_informe OR NEW.problem_type = 'Mês de análise' THEN
    -- Informe não tem prazo; Mês de Análise tem fluxo e prazo próprios.
    IF v_informe THEN
      NEW.prazo_primeira_acao := NULL;
      NEW.prazo_resolucao := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.prazo_primeira_acao := incidente_prazo_primeira_acao(NEW.urgency, COALESCE(NEW.created_at, NOW()));
    IF NEW.prazo_resolucao IS NULL AND NOT NEW.resolved THEN
      NEW.prazo_resolucao := incidente_prazo_resolucao(NEW.urgency, COALESCE(NEW.created_at, NOW()));
    END IF;
  ELSIF NOT NEW.resolved AND NEW.primeira_acao_em IS NULL
        AND (v_mudou OR COALESCE(OLD.natureza, 'desafio') = 'informe') THEN
    -- Prioridade mudou (ou informe virou desafio) antes de alguém agir: o
    -- relógio da 1ª ação recomeça AGORA. Contar de created_at faria um chamado
    -- elevado a Urgente três dias depois já nascer vencido.
    NEW.prazo_primeira_acao := incidente_prazo_primeira_acao(NEW.urgency, NOW());
    NEW.alerta_primeira_acao_em := NULL;
  END IF;

  -- Informe que virou desafio sem prazo informado ganha o padrão, contado de agora.
  IF TG_OP = 'UPDATE' AND NOT NEW.resolved AND NEW.prazo_resolucao IS NULL
     AND COALESCE(OLD.natureza, 'desafio') = 'informe' THEN
    NEW.prazo_resolucao := incidente_prazo_resolucao(NEW.urgency, NOW());
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.prazo_resolucao IS DISTINCT FROM OLD.prazo_resolucao THEN
    NEW.alerta_atraso_em := NULL;  -- prazo novo, aviso novo se vencer de novo
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS nexus_incidents_prioridade_antes ON nexus_incidents;
CREATE TRIGGER nexus_incidents_prioridade_antes
  BEFORE INSERT OR UPDATE ON nexus_incidents
  FOR EACH ROW EXECUTE FUNCTION incidente_prioridade_antes();

-- ── 6. Gatilho AFTER: histórico + aviso de Urgente elevado depois ─────────────

/** Liderança da coordenação: role=coordenacao com is_lider; sem ninguém, admins. */
CREATE OR REPLACE FUNCTION lideranca_coordenacao()
RETURNS TABLE (perfil_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH lideres AS (
    SELECT p.id FROM profiles p
     WHERE p.ativo AND p.is_lider = true AND p.role = 'coordenacao'
  )
  SELECT l.id FROM lideres l
  UNION
  SELECT p.id FROM profiles p
   WHERE p.ativo AND (p.is_admin = true OR p.role = 'admin')
     AND NOT EXISTS (SELECT 1 FROM lideres);
$fn$;

COMMENT ON FUNCTION lideranca_coordenacao() IS
  'Quem recebe o escalonamento dos incidentes: coordenação com is_lider; sem nenhum marcado, os admins.';

CREATE OR REPLACE FUNCTION incidente_prioridade_depois() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_ref   TEXT := NEW.teacher_name;
  v_corpo TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.urgency IS NOT DISTINCT FROM OLD.urgency THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO incidente_prioridade_historico (incidente_id, de, para, justificativa, alterado_por)
    VALUES (
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.urgency END,
      NEW.urgency,
      NEW.urgencia_justificativa,
      COALESCE(auth.uid(), CASE WHEN TG_OP = 'INSERT' THEN NEW.created_by END)
    );

    -- Elevado a Urgente depois de criado: mesmo aviso do Urgente na criação
    -- (o de criação mora em notificar_incidente_novo). Informe e concluído não.
    IF TG_OP = 'UPDATE' AND NEW.urgency = 'Urgente'
       AND COALESCE(NEW.natureza, 'desafio') = 'desafio' AND NOT NEW.resolved THEN
      v_corpo := NEW.problem_type || ' — ' || COALESCE(NEW.urgencia_justificativa, left(NEW.description, 140));
      INSERT INTO notificacoes (user_id, tipo, titulo, corpo, incidente_id)
      SELECT DISTINCT d.id, 'incidente_critico', 'Chamado virou urgente: ' || v_ref, v_corpo, NEW.id
        FROM (
          SELECT pr.id FROM profiles pr
           WHERE pr.ativo AND (pr.role = 'coordenacao' OR pr.is_admin = true OR pr.role = 'admin')
          UNION SELECT NEW.responsavel_id
          UNION SELECT NEW.assumido_por
        ) d
       WHERE d.id IS NOT NULL AND d.id IS DISTINCT FROM auth.uid();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'incidente_prioridade_depois: %', SQLERRM;  -- nunca bloqueia a edição
  END;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS nexus_incidents_prioridade_depois ON nexus_incidents;
CREATE TRIGGER nexus_incidents_prioridade_depois
  AFTER INSERT OR UPDATE OF urgency ON nexus_incidents
  FOR EACH ROW EXECUTE FUNCTION incidente_prioridade_depois();

-- ── 7. Aviso de criação: Crítico → Urgente, com a justificativa no corpo ─────

CREATE OR REPLACE FUNCTION notificar_incidente_novo() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref     TEXT := NEW.teacher_name;
  v_urgente BOOLEAN := (NEW.urgency = 'Urgente');
  v_corpo   TEXT := NEW.problem_type || ' — ' ||
                    CASE WHEN NEW.urgency = 'Urgente' AND NEW.urgencia_justificativa IS NOT NULL
                         THEN NEW.urgencia_justificativa
                         ELSE left(COALESCE(NEW.description, ''), 140) END;
BEGIN
  BEGIN
    -- Informe é registro passivo — não notifica.
    IF COALESCE(NEW.natureza, 'desafio') = 'informe' THEN
      RETURN NEW;
    END IF;

    -- (1) Responsável fica sabendo do novo chamado (menos se foi ele quem registrou).
    IF NEW.responsavel_id IS NOT NULL AND NEW.responsavel_id IS DISTINCT FROM NEW.created_by THEN
      INSERT INTO notificacoes (user_id, tipo, titulo, corpo, incidente_id)
      VALUES (
        NEW.responsavel_id,
        CASE WHEN v_urgente THEN 'incidente_critico' ELSE 'incidente_novo' END,
        CASE WHEN v_urgente THEN 'Chamado urgente: ' ELSE 'Novo chamado: ' END || v_ref,
        v_corpo, NEW.id
      );
    END IF;

    -- (2) Urgente escala pra coordenação + admins (menos criador e responsável já avisado).
    IF v_urgente THEN
      INSERT INTO notificacoes (user_id, tipo, titulo, corpo, incidente_id)
      SELECT pr.id, 'incidente_critico', 'Chamado urgente: ' || v_ref, v_corpo, NEW.id
      FROM profiles pr
      WHERE pr.ativo = true
        AND (pr.role = 'coordenacao' OR pr.is_admin = true OR pr.role = 'admin')
        AND pr.id IS DISTINCT FROM NEW.created_by
        AND pr.id IS DISTINCT FROM NEW.responsavel_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- best-effort: aviso nunca bloqueia a criação do incidente
  END;
  RETURN NEW;
END;
$$;

-- ── 8. Varredura de prazos (cron) ────────────────────────────────────────────

/**
 * Avisa, UMA vez por chamado, quando:
 *   (a) a 1ª ação venceu sem ninguém assumir → responsável; sem responsável,
 *       ou se for Urgente, também a liderança da coordenação;
 *   (b) o prazo de resolução venceu → quem assumiu + responsável; Urgente e
 *       Alta também sobem para a liderança.
 * O estoque de vencidos fica no placar da tela; o sino é para o que acabou de vencer.
 */
CREATE OR REPLACE FUNCTION notificar_incidentes_prazo() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r     RECORD;
  v_qtd INTEGER := 0;
BEGIN
  -- (a) Ninguém assumiu no prazo.
  FOR r IN
    SELECT i.id, i.teacher_name, i.problem_type, i.urgency, i.responsavel_id
      FROM nexus_incidents i
     WHERE NOT i.resolved
       AND COALESCE(i.natureza, 'desafio') = 'desafio'
       AND i.problem_type <> 'Mês de análise'
       AND i.primeira_acao_em IS NULL
       AND i.alerta_primeira_acao_em IS NULL
       AND i.prazo_primeira_acao < NOW()
  LOOP
    INSERT INTO notificacoes (user_id, tipo, titulo, corpo, incidente_id)
    SELECT DISTINCT d.id, 'incidente_sem_acao',
           'Ninguém assumiu (' || r.urgency || '): ' || r.teacher_name,
           r.problem_type || ' — o prazo para a primeira ação venceu.',
           r.id
      FROM (
        SELECT r.responsavel_id AS id
        UNION
        SELECT l.perfil_id FROM lideranca_coordenacao() l
         WHERE r.responsavel_id IS NULL OR r.urgency = 'Urgente'
      ) d
     WHERE d.id IS NOT NULL;

    UPDATE nexus_incidents SET alerta_primeira_acao_em = NOW() WHERE id = r.id;
    v_qtd := v_qtd + 1;
  END LOOP;

  -- (b) Prazo de resolução vencido.
  FOR r IN
    SELECT i.id, i.teacher_name, i.problem_type, i.urgency, i.responsavel_id, i.assumido_por, i.prazo_resolucao
      FROM nexus_incidents i
     WHERE NOT i.resolved
       AND COALESCE(i.natureza, 'desafio') = 'desafio'
       AND i.problem_type <> 'Mês de análise'
       AND i.alerta_atraso_em IS NULL
       AND i.prazo_resolucao < NOW()
  LOOP
    INSERT INTO notificacoes (user_id, tipo, titulo, corpo, incidente_id)
    SELECT DISTINCT d.id, 'incidente_atrasado',
           'Chamado atrasado (' || r.urgency || '): ' || r.teacher_name,
           r.problem_type || ' — o prazo de resolução venceu em ' ||
             to_char(r.prazo_resolucao AT TIME ZONE 'America/Sao_Paulo', 'DD/MM') || '.',
           r.id
      FROM (
        SELECT r.assumido_por AS id
        UNION SELECT r.responsavel_id
        UNION
        SELECT l.perfil_id FROM lideranca_coordenacao() l
         WHERE r.urgency IN ('Urgente', 'Alta')
            OR (r.assumido_por IS NULL AND r.responsavel_id IS NULL)
      ) d
     WHERE d.id IS NOT NULL;

    UPDATE nexus_incidents SET alerta_atraso_em = NOW() WHERE id = r.id;
    v_qtd := v_qtd + 1;
  END LOOP;

  RETURN v_qtd;
END;
$fn$;

COMMENT ON FUNCTION notificar_incidentes_prazo() IS
  'Avisa 1ª ação e resolução que acabaram de vencer, uma vez por chamado. Cron king-incidentes-prazo (15 em 15 min).';

REVOKE ALL ON FUNCTION notificar_incidentes_prazo() FROM PUBLIC;

-- De 15 em 15 minutos: o Urgente tem 2 horas úteis para a 1ª ação, uma
-- varredura diária chegaria tarde demais. A consulta é barata (poucos abertos).
SELECT cron.unschedule('king-incidentes-prazo')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-incidentes-prazo');

SELECT cron.schedule(
  'king-incidentes-prazo',
  '*/15 * * * *',
  $cron$ SELECT notificar_incidentes_prazo(); $cron$
);
