-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3: RPC Transacional criar_reuniao_grupo
--
-- Chamada por create-booking após confirmar inscrição em agenda_inscricoes.
-- Garante atomicidade: ou tudo insere (reunioes + agenda_horarios.reuniao_id +
-- reuniao_professores para cada inscrito), ou nada (ROLLBACK).
--
-- Fluxo:
--   1. Buscar se reuniao_id já existe para este horario_id
--   2. Se NÃO existe:
--      a. INSERT em reunioes (status='pendente', tipo='professor' por padrão)
--      b. UPDATE agenda_horarios SET reuniao_id = novo
--      c. Para CADA professor já inscrito (agenda_inscricoes + novo):
--         INSERT em reuniao_professores (status='pendente')
--   3. Se JÁ existe: apenas INSERT em reuniao_professores para o novo professor
--
-- Exceções: LOG + RAISE, cliente trata 500
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_count_inscritos INT;
BEGIN
  -- ── 1. Verificar se reuniao já existe para este horario ─────────────────────
  SELECT reuniao_id INTO v_reuniao_id
  FROM agenda_horarios
  WHERE id = p_horario_id;

  -- ── 2. Se não existe, criar nova reunião + atualizar horário ────────────────
  IF v_reuniao_id IS NULL THEN
    BEGIN
      -- 2a. Inserir em reunioes
      INSERT INTO reunioes (
        titulo,
        data,
        coordenador_id,
        status,
        tipo,
        notas
      ) VALUES (
        p_agenda_titulo,
        p_data_hora,
        p_coordenador_id,
        'pendente',
        'professor',  -- tipo padrão para grupos
        NULL
      )
      RETURNING reunioes.id INTO v_reuniao_id;

      -- 2b. Atualizar agenda_horarios com reuniao_id
      UPDATE agenda_horarios
      SET reuniao_id = v_reuniao_id
      WHERE id = p_horario_id;

      -- 2c. Inserir reuniao_professores para TODOS os inscritos confirmados + novo
      -- Busca todos os professores já inscrito confirmados
      FOR v_professor_row IN
        SELECT DISTINCT professor_id
        FROM agenda_inscricoes
        WHERE horario_id = p_horario_id
          AND status = 'confirmada'
        UNION ALL
        SELECT p_professor_id  -- Inclui o novo professor que está se inscrevendo agora
      LOOP
        INSERT INTO reuniao_professores (
          reuniao_id,
          professor_id,
          status
        ) VALUES (
          v_reuniao_id,
          v_professor_row.professor_id,
          'pendente'
        )
        ON CONFLICT (reuniao_id, professor_id) DO NOTHING;
      END LOOP;

      -- Log de sucesso
      RAISE NOTICE '[criar_reuniao_grupo] nova reuniao criada: reuniao_id=%, horario_id=%', v_reuniao_id, p_horario_id;

    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Erro ao criar reunião de grupo: % - %', SQLSTATE, SQLERRM;
    END;
  ELSE
    -- Reunião já existe; apenas inserir este professor se ainda não está
    BEGIN
      INSERT INTO reuniao_professores (
        reuniao_id,
        professor_id,
        status
      ) VALUES (
        v_reuniao_id,
        p_professor_id,
        'pendente'
      )
      ON CONFLICT (reuniao_id, professor_id) DO NOTHING;

      RAISE NOTICE '[criar_reuniao_grupo] professor adicionado a grupo existente: reuniao_id=%, professor_id=%', v_reuniao_id, p_professor_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Erro ao adicionar professor à reunião existente: % - %', SQLSTATE, SQLERRM;
    END;
  END IF;

  -- Retorna resultado
  RETURN QUERY SELECT
    v_reuniao_id,
    TRUE,
    'Reunião de grupo criada/atualizada com sucesso'::TEXT;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION criar_reuniao_grupo(UUID, UUID, UUID, TEXT, TIMESTAMPTZ, UUID)
  TO authenticated, service_role;

COMMENT ON FUNCTION criar_reuniao_grupo IS
  'RPC transacional: cria reunião de grupo + insere reuniao_professores para cada inscrito. Chamada por create-booking após confirmar inscrição.';
