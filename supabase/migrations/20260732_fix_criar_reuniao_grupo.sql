-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: reserva de reunião em grupo falhava SEMPRE ("Erro ao confirmar
-- participação" no portal /agendar). A RPC criar_reuniao_grupo (20260726 →
-- 20260727) nunca chegou a rodar com sucesso porque tinha TRÊS defeitos, todos
-- latentes desde o deploy (a feature nunca tinha sido testada com uma reserva
-- real). O primeiro professor a tentar reservar (2026-07-15) esbarrou neles.
-- Os erros aparecem na ordem 42702 → 42703 → 42P10 conforme cada um é corrigido.
--
--   Bug 1 — column reference "reuniao_id" is ambiguous (SQLSTATE 42702):
--     a função é RETURNS TABLE (reuniao_id UUID, ...), então `reuniao_id` é uma
--     variável OUT no corpo. O primeiro comando —
--       SELECT reuniao_id, capacidade INTO ... FROM agenda_horarios
--     — referencia `reuniao_id` sem qualificar, e o Postgres não sabe se é a
--     variável OUT ou a coluna agenda_horarios.reuniao_id → erro em tempo de
--     execução. Como esse SELECT fica FORA dos blocos EXCEPTION internos, o erro
--     sai direto pra create-booking. Correção: qualificar com alias (h.reuniao_id).
--
--   Bug 3 — column "tipo" of relation "reunioes" does not exist (SQLSTATE 42703):
--     o INSERT INTO reunioes listava a coluna `tipo`, que nunca existiu na
--     tabela (só `tipo_reuniao`, adicionada em 20260712). Removida do INSERT.
--
--   Bug 2 — ON CONFLICT (reuniao_id, professor_id) sem arbiter (SQLSTATE 42P10):
--     o único índice único em (reuniao_id, professor_id) era PARCIAL
--     (idx_reuniao_prof_unique ... WHERE professor_id IS NOT NULL, criado em
--     20260629). Postgres só usa índice parcial como arbiter do ON CONFLICT se a
--     cláusula repetir o predicado — a RPC não repete → "no unique or exclusion
--     constraint matching". Mesmo problema já resolvido em 20260704 (kms_id) e
--     20260705 (google_event_id): troca o índice parcial por uma UNIQUE
--     constraint normal. Postgres trata múltiplos NULLs como distintos, então
--     reuniões internas (professor_id NULL) continuam permitindo várias linhas —
--     comportamento idêntico ao índice parcial.
--
-- Idempotente. As três correções já foram aplicadas manualmente em produção
-- em 2026-07-15 ([[ktm-supabase-migration-workflow]]) e validadas ponta-a-ponta
-- (RPC roda, cria reunião tipo_reuniao='grupo', agrega participantes); esta
-- migration é o registro reproduzível.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Bug 2: índice parcial → UNIQUE constraint normal ─────────────────────────
DROP INDEX IF EXISTS idx_reuniao_prof_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'reuniao_professores'::regclass
      AND conname  = 'reuniao_professores_reuniao_professor_key'
  ) THEN
    ALTER TABLE reuniao_professores
      ADD CONSTRAINT reuniao_professores_reuniao_professor_key UNIQUE (reuniao_id, professor_id);
  END IF;
END $$;


-- ── Bug 1: qualifica a coluna ambígua na RPC ─────────────────────────────────
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
-- A coluna OUT `reuniao_id` (RETURNS TABLE) tem o mesmo nome de colunas das
-- tabelas usadas aqui (agenda_horarios.reuniao_id, reuniao_professores.reuniao_id).
-- Em SET/INSERT-column-list/ON CONFLICT não dá pra qualificar por alias, então
-- resolvemos toda colisão nome-variável↔coluna a favor da COLUNA. Seguro: os
-- nomes OUT nunca são lidos como variável no corpo (usamos v_reuniao_id).
#variable_conflict use_column
DECLARE
  v_reuniao_id UUID;
  v_professor_row RECORD;
  v_capacidade INT;
  v_tipo_reuniao TEXT;
BEGIN
  -- 1. Reunião já existe para este horário? Também lê a capacidade do slot:
  --    capacidade > 1 é o que caracteriza uma reunião de GRUPO — feedback
  --    individual (capacidade 1) continua sendo 1:1 (tipo_reuniao='professor').
  --    `h.` é obrigatório: sem o alias, `reuniao_id` colide com a coluna OUT
  --    homônima desta função (RETURNS TABLE) → 42702.
  SELECT h.reuniao_id, h.capacidade INTO v_reuniao_id, v_capacidade
  FROM agenda_horarios h
  WHERE h.id = p_horario_id;

  v_tipo_reuniao := CASE WHEN COALESCE(v_capacidade, 1) > 1 THEN 'grupo' ELSE 'professor' END;

  -- 2. Não existe: cria reunião + liga horário + insere participantes
  IF v_reuniao_id IS NULL THEN
    BEGIN
      -- NB: a tabela reunioes NÃO tem coluna `tipo` (só `tipo_reuniao`, de
      -- 20260712). As versões 20260726/20260727 desta RPC inseriam `tipo` →
      -- 42703 em runtime. Removido aqui.
      INSERT INTO reunioes (
        titulo, data, coordenador_id, status, tipo_reuniao, notas
      ) VALUES (
        p_agenda_titulo, p_data_hora, p_coordenador_id, 'pendente', v_tipo_reuniao, NULL
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
