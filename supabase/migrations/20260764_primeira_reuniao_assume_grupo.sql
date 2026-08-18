-- ─────────────────────────────────────────────────────────────────────────────
-- 1ª reunião define a coordenação — quem deu a reunião assume o professor.
--
-- Regra nova (2026-08-17): a alocação automática de grupo (balanceamento por
-- `pick_grupo_novo_professor`) passa a ser só o palpite inicial. O que vale de
-- verdade é a PRIMEIRA reunião do professor — aquela que acontece logo depois
-- que ele entra na King: no momento em que essa reunião é dada como REALIZADA,
-- o coordenador que a conduziu assume o professor no seu grupo de coordenação.
--
-- Por que no banco e não na tela: "dar como realizada" acontece em quatro
-- superfícies diferentes — Reuniões do Dia (useConfirmarParticipacao), a RPC
-- confirmar_reuniao_grupo (web + extensão), a edição manual da participação
-- (EditarReuniaoProfessorDialog) e qualquer correção feita direto no banco.
-- Um trigger em `reuniao_professores` é o único ponto que cobre todas.
--
-- Quem é "o coordenador que fez a reunião": `reunioes.coordenador_id` — o
-- daily-import preenche pelo dono da agenda em que o evento apareceu e o
-- create-booking pelo dono da agenda de grupo, então é o dado certo mesmo
-- quando quem confirma na tela é outra pessoa (suporte, por exemplo). Se
-- estiver nulo (reunião cadastrada na mão sem coordenador), cai pra quem
-- confirmou (`confirmado_por`).
--
-- Guardas — o trigger só age quando é mesmo a reunião de boas-vindas:
--   1. É a primeira participação 'realizada' do professor (nenhuma outra).
--   2. O professor tem no máximo 90 dias de casa (`professores.data_inicio`).
--      Sem isso, um veterano que nunca teve reunião registrada seria realocado
--      na primeira que registrasse — o que bagunçaria a coordenação dele.
--      data_inicio nulo → não age (não dá pra provar que é recém-chegado).
--   3. O coordenador resolvido coordena um grupo ATIVO. Sem grupo não há o que
--      assumir, e mexer só em coordenador_id deixaria grupo e coordenador
--      divergentes (todo o resto do sistema assume que andam juntos).
--
-- SECURITY DEFINER de propósito: a RLS de `professores` só deixa admin e
-- coordenação escreverem, e quem confirma a reunião pode ser do suporte — o
-- UPDATE viraria zero linhas em silêncio.
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

  -- Guarda 2 — recém-chegado (janela generosa: a reunião de boas-vindas às
  -- vezes só acontece/é registrada semanas depois da entrada).
  SELECT (CURRENT_DATE - p.data_inicio::date) INTO v_dias
    FROM professores p WHERE p.id = NEW.professor_id;
  IF v_dias IS NULL OR v_dias > 90 THEN
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
  'Na 1ª reunião realizada de um professor recém-chegado (<= 90 dias de casa), move-o para o grupo do coordenador que conduziu a reunião (reunioes.coordenador_id, com fallback em confirmado_por). Sobrepõe a alocação automática por balanceamento.';

DROP TRIGGER IF EXISTS trg_assumir_professor_primeira_reuniao ON reuniao_professores;
CREATE TRIGGER trg_assumir_professor_primeira_reuniao
  AFTER INSERT OR UPDATE OF status ON reuniao_professores
  FOR EACH ROW
  WHEN (NEW.status = 'realizada')
  EXECUTE FUNCTION assumir_professor_primeira_reuniao();
