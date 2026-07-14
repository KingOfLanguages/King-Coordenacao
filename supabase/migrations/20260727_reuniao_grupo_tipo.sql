-- ─────────────────────────────────────────────────────────────────────────────
-- Fase A: "reunião em grupo" vira um tipo_reuniao de primeira classe ('grupo')
--
-- Antes, criar_reuniao_grupo gravava só o `tipo` antigo ('professor') e deixava
-- `tipo_reuniao` no default 'professor' — então a web não distinguia grupo de 1:1
-- e a mesma reunião aparecia 2× (card Feedback + card 1:1). Aqui:
--   1. Libera 'grupo' no CHECK de reunioes.tipo_reuniao
--   2. criar_reuniao_grupo passa a marcar tipo_reuniao = 'grupo'
--   3. Backfill: reuniões já ligadas a um horário de agenda viram 'grupo'
--
-- Idempotente — pode rodar mais de uma vez sem efeito colateral.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Pré-requisitos da Fase 3 (idempotentes) ───────────────────────────────
-- A Fase 3 (coluna agenda_horarios.reuniao_id + RLS de insert em reunioes + a
-- RPC) pode NÃO ter sido aplicada ainda — garantimos as dependências aqui pra
-- esta migration ser auto-suficiente. Se a Fase 3 já rodou, tudo isto é no-op.

ALTER TABLE agenda_horarios
  ADD COLUMN IF NOT EXISTS reuniao_id UUID REFERENCES reunioes(id) ON DELETE SET NULL;

COMMENT ON COLUMN agenda_horarios.reuniao_id IS
  'Reunião de grupo (reunioes) criada quando o primeiro professor confirma inscrição neste horário. NULL se ainda não gerou reunião.';

CREATE INDEX IF NOT EXISTS idx_agenda_horarios_reuniao_id
  ON agenda_horarios (reuniao_id);

-- Permite admin/coordenacao/suporte inserir reunioes (a RPC roda como SECURITY
-- DEFINER e dispensa isto, mas a criação manual de reunião pela web/extensão usa).
DROP POLICY IF EXISTS "reunioes_create_by_role" ON reunioes;
CREATE POLICY "reunioes_create_by_role" ON reunioes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      sou_admin()
      OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
    )
  );


-- ── 1. CHECK aceita 'grupo' ──────────────────────────────────────────────────
ALTER TABLE reunioes DROP CONSTRAINT IF EXISTS reunioes_tipo_reuniao_check;
ALTER TABLE reunioes ADD CONSTRAINT reunioes_tipo_reuniao_check
  CHECK (tipo_reuniao IN ('professor', 'interna', 'grupo'));


-- ── 2. RPC marca tipo_reuniao = 'grupo' ──────────────────────────────────────
CREATE OR REPLACE FUNCTION criar_reuniao_grupo(
  p_horario_id UUID,
  p_professor_id UUID,
  p_agenda_id UUID,
  p_agenda_titulo TEXT,
  p_data_hora TIMESTAMPTZ,
  p_coordenador_id UUID
)
RETURNS TABLE (
  reuniao_id UUID,
  sucesso BOOLEAN,
  mensagem TEXT
) AS $$
DECLARE
  v_reuniao_id UUID;
  v_professor_row RECORD;
  v_capacidade INT;
  v_tipo_reuniao TEXT;
BEGIN
  -- 1. Reunião já existe para este horário? Também lê a capacidade do slot:
  --    capacidade > 1 é o que caracteriza uma reunião de GRUPO — feedback
  --    individual (capacidade 1) continua sendo 1:1 (tipo_reuniao='professor').
  SELECT reuniao_id, capacidade INTO v_reuniao_id, v_capacidade
  FROM agenda_horarios
  WHERE id = p_horario_id;

  v_tipo_reuniao := CASE WHEN COALESCE(v_capacidade, 1) > 1 THEN 'grupo' ELSE 'professor' END;

  -- 2. Não existe: cria reunião + liga horário + insere participantes
  IF v_reuniao_id IS NULL THEN
    BEGIN
      INSERT INTO reunioes (
        titulo, data, coordenador_id, status, tipo, tipo_reuniao, notas
      ) VALUES (
        p_agenda_titulo, p_data_hora, p_coordenador_id, 'pendente', 'professor', v_tipo_reuniao, NULL
      )
      RETURNING reunioes.id INTO v_reuniao_id;

      UPDATE agenda_horarios
      SET reuniao_id = v_reuniao_id
      WHERE id = p_horario_id;

      -- Participantes: todos os inscritos confirmados + o novo professor
      FOR v_professor_row IN
        SELECT DISTINCT professor_id
        FROM agenda_inscricoes
        WHERE horario_id = p_horario_id
          AND status = 'confirmada'
        UNION ALL
        SELECT p_professor_id
      LOOP
        INSERT INTO reuniao_professores (reuniao_id, professor_id, status)
        VALUES (v_reuniao_id, v_professor_row.professor_id, 'pendente')
        ON CONFLICT (reuniao_id, professor_id) DO NOTHING;
      END LOOP;

      RAISE NOTICE '[criar_reuniao_grupo] nova reuniao criada: reuniao_id=%, horario_id=%', v_reuniao_id, p_horario_id;

    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Erro ao criar reunião de grupo: % - %', SQLSTATE, SQLERRM;
    END;
  ELSE
    -- 3. Já existe: garante a tipagem correta (grupo se o slot comporta +de 1) e adiciona o professor
    BEGIN
      UPDATE reunioes
      SET tipo_reuniao = v_tipo_reuniao
      WHERE id = v_reuniao_id
        AND tipo_reuniao <> v_tipo_reuniao
        AND tipo_reuniao <> 'interna';

      INSERT INTO reuniao_professores (reuniao_id, professor_id, status)
      VALUES (v_reuniao_id, p_professor_id, 'pendente')
      ON CONFLICT (reuniao_id, professor_id) DO NOTHING;

      RAISE NOTICE '[criar_reuniao_grupo] professor adicionado a grupo existente: reuniao_id=%, professor_id=%', v_reuniao_id, p_professor_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Erro ao adicionar professor à reunião existente: % - %', SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN QUERY SELECT
    v_reuniao_id,
    TRUE,
    'Reunião de grupo criada/atualizada com sucesso'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION criar_reuniao_grupo(UUID, UUID, UUID, TEXT, TIMESTAMPTZ, UUID)
  TO authenticated, service_role;

COMMENT ON FUNCTION criar_reuniao_grupo IS
  'RPC transacional: cria/atualiza reunião de grupo (tipo_reuniao=grupo) + insere reuniao_professores para cada inscrito. Chamada por create-booking.';


-- ── 3. Backfill: reuniões ligadas a um horário de capacidade > 1 são de grupo ─
UPDATE reunioes r
SET tipo_reuniao = 'grupo'
FROM agenda_horarios h
WHERE h.reuniao_id = r.id
  AND h.capacidade > 1
  AND r.tipo_reuniao IS DISTINCT FROM 'grupo';
