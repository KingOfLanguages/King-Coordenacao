-- ─────────────────────────────────────────────────────────────────────────────
-- Reunião de ACOMPANHAMENTO × reunião de DÚVIDA (2026-08-21).
--
-- A regra da coordenação: todo professor até o 3º mês de casa deve ter pelo
-- menos UMA reunião de acompanhamento oficial por mês. Fora isso, ele pode
-- marcar quantas reuniões quiser só para tirar dúvida — e essas "não implicam
-- em nada".
--
-- Até aqui o sistema não sabia diferenciar as duas: qualquer participação
-- lançada como realizada zerava o relógio de 30 dias do portal, entrava na meta
-- do dia do coordenador e tirava o professor da lista de sugestões. Na prática,
-- quem tirava uma dúvida no dia 5 ficava "em dia" até o dia 35 sem nunca ter
-- feito o acompanhamento do mês — e o professor que quisesse tirar a dúvida era
-- barrado pelo portal, que tratava o relógio como trava.
--
-- `natureza` é a distinção, e o padrão é 'acompanhamento': tudo que já existe e
-- tudo que a importação do Google Calendar criar continua contando como antes.
-- Marcar como dúvida é um ato explícito do coordenador ao lançar a reunião.
--
-- Ela NÃO se aplica a reunião interna (não tem professor) nem a reunião de
-- grupo (que segue regra própria, de score, e nunca foi acompanhamento
-- individual). Nesses dois casos a coluna fica no padrão e ninguém lê.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reunioes
  ADD COLUMN IF NOT EXISTS natureza TEXT NOT NULL DEFAULT 'acompanhamento'
    CHECK (natureza IN ('acompanhamento', 'duvida'));

COMMENT ON COLUMN reunioes.natureza IS
  'acompanhamento = reunião oficial (conta na cadência mensal, na meta do coordenador e tira o professor das sugestões); duvida = encontro extra a pedido do professor, que não conta em nada. Só faz sentido em tipo_reuniao=''professor''.';

-- As consultas de cadência/sugestão sempre perguntam pelas oficiais; a dúvida é
-- a exceção rara. Índice parcial só sobre elas mantém o índice pequeno.
CREATE INDEX IF NOT EXISTS idx_reunioes_duvida
  ON reunioes (data) WHERE natureza = 'duvida';

-- ── A 1ª reunião não pode ser uma dúvida ─────────────────────────────────────
-- `assumir_professor_primeira_reuniao` (20260764→20260766) move o professor para
-- o grupo de quem conduziu a primeira reunião realizada. Uma conversa de 10
-- minutos para tirar dúvida não é a reunião de boas-vindas e não pode decidir de
-- quem é o professor — então ela deixa de contar como "a primeira".
--
-- Recriada por inteiro a partir da 20260766: a única mudança é a Guarda 0.

CREATE OR REPLACE FUNCTION assumir_professor_primeira_reuniao() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_coord   UUID;
  v_grupo   UUID;
  v_dias    INT;
  v_entrada DATE;
BEGIN
  IF NEW.professor_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Guarda 0 — reunião de dúvida não é reunião de boas-vindas.
  IF EXISTS (
    SELECT 1 FROM reunioes r
     WHERE r.id = NEW.reuniao_id AND r.natureza = 'duvida'
  ) THEN
    RETURN NULL;
  END IF;

  -- Guarda 1 — é a primeira reunião realizada deste professor?
  IF EXISTS (
    SELECT 1 FROM reuniao_professores rp
     WHERE rp.professor_id = NEW.professor_id
       AND rp.status       = 'realizada'
       AND rp.id          <> NEW.id
  ) THEN
    RETURN NULL;
  END IF;

  -- Guarda 2 — cadastrado a partir do corte E ainda nos 30 primeiros dias.
  SELECT p.data_inicio::date, (CURRENT_DATE - p.data_inicio::date)
    INTO v_entrada, v_dias
    FROM professores p WHERE p.id = NEW.professor_id;
  IF v_entrada IS NULL OR v_entrada < DATE '2026-08-17' THEN
    RETURN NULL;
  END IF;
  IF v_dias IS NULL OR v_dias > 30 THEN
    RETURN NULL;
  END IF;

  -- Quem conduziu a reunião.
  SELECT r.coordenador_id INTO v_coord FROM reunioes r WHERE r.id = NEW.reuniao_id;
  v_coord := COALESCE(v_coord, NEW.confirmado_por);
  IF v_coord IS NULL THEN
    RETURN NULL;
  END IF;

  -- Guarda 3 — esse coordenador tem grupo ativo?
  SELECT g.id INTO v_grupo
    FROM grupos g
   WHERE g.coordenador_id = v_coord AND g.ativo
   ORDER BY g.created_at
   LIMIT 1;
  IF v_grupo IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE professores
     SET grupo_id       = v_grupo,
         coordenador_id = v_coord
   WHERE id = NEW.professor_id
     AND (grupo_id IS DISTINCT FROM v_grupo OR coordenador_id IS DISTINCT FROM v_coord);

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION assumir_professor_primeira_reuniao() IS
  'Na 1ª reunião de ACOMPANHAMENTO realizada de professor cadastrado a partir de 2026-08-17 e ainda nos 30 primeiros dias de casa, move-o para o grupo do coordenador que conduziu a reunião. Reunião de dúvida (reunioes.natureza) nunca conta como a primeira.';
