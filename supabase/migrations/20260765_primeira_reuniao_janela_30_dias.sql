-- ─────────────────────────────────────────────────────────────────────────────
-- 1ª reunião define a coordenação — janela cai de 90 para 30 dias de casa.
--
-- Correção de rumo do João no mesmo dia em que a regra subiu (2026-08-17): a
-- troca de coordenação vale para quem está ENTRANDO agora. Quem já tem mais de
-- 30 dias de casa fica onde está, mesmo que a primeira reunião dele só seja
-- registrada depois — nesses casos a alocação por balanceamento continua sendo
-- a palavra final.
--
-- Os 90 dias originais eram uma janela generosa para o caso de a reunião de
-- boas-vindas demorar a acontecer; na prática ela abriria a porta para
-- remanejar gente que já está estabelecida com um coordenador. 30 dias cobre a
-- reunião de boas-vindas de verdade (o portal só oferece a "1ª reunião" nos 7
-- primeiros dias) e nada além dela.
--
-- Só muda a Guarda 2 — o resto (quem é o coordenador, SECURITY DEFINER, grupo
-- ativo, primeira participação realizada) segue igual à 20260764.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION assumir_professor_primeira_reuniao() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_coord UUID;
  v_grupo UUID;
  v_dias  INT;
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

  -- Guarda 2 — só quem está chegando agora: no máximo 30 dias de casa.
  SELECT (CURRENT_DATE - p.data_inicio::date) INTO v_dias
    FROM professores p WHERE p.id = NEW.professor_id;
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
  'Na 1ª reunião realizada de um professor que está chegando (<= 30 dias de casa), move-o para o grupo do coordenador que conduziu a reunião (reunioes.coordenador_id, com fallback em confirmado_por). Sobrepõe a alocação automática por balanceamento. Quem já passou de 30 dias de casa fica onde está.';
