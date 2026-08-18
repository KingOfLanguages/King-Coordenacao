-- ─────────────────────────────────────────────────────────────────────────────
-- 1ª reunião define a coordenação — só para quem entrar a partir de 2026-08-17.
--
-- Decisão final do João (2026-08-17): "só quem for cadastrado a partir de hoje
-- vive essa nova realidade". O time que já está na casa — inclusive os 24 que
-- entraram no último mês e ainda não tiveram a reunião de boas-vindas — fica
-- exatamente onde está, com a coordenação que a alocação por balanceamento deu.
--
-- Por isso a guarda vira uma data de corte fixa em `professores.data_inicio`,
-- e não uma janela móvel: uma janela deixaria a regra alcançar, aos poucos,
-- gente que já estava aqui antes dela existir.
--
-- Os 30 dias de casa da 20260765 continuam valendo POR CIMA do corte: a regra é
-- sobre a reunião de boas-vindas, não sobre qualquer primeira reunião que
-- apareça meses depois. Ou seja, agora são duas condições — entrou em
-- 2026-08-17 ou depois E está nos 30 primeiros dias.
--
-- O resto (quem é o coordenador, SECURITY DEFINER, grupo ativo, ser a primeira
-- participação realizada) segue igual à 20260764.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION assumir_professor_primeira_reuniao() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_coord   UUID;
  v_grupo   UUID;
  v_dias    INT;
  v_entrada DATE;
BEGIN
  IF NEW.professor_id IS NULL THEN
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
$$;

COMMENT ON FUNCTION assumir_professor_primeira_reuniao() IS
  'Na 1ª reunião realizada de professor cadastrado a partir de 2026-08-17 (data de corte da regra) e ainda nos 30 primeiros dias de casa, move-o para o grupo do coordenador que conduziu a reunião (reunioes.coordenador_id, com fallback em confirmado_por). Quem já estava na casa antes do corte nunca é remanejado por reunião.';
