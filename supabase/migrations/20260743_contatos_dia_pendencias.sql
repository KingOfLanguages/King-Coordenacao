-- ─────────────────────────────────────────────────────────────────────────────
-- Mensagens do dia × Central de Pendências (2026-07-23).
--
-- A lista diária de contatos passa a reagir ao bloqueio de agenda por pendência
-- de lançamento (motor no back-end King). Regras acordadas:
--   • Estágio 2 (bloqueada 3–4 dias, "dentro do prazo") → PRIORIDADE dentro dos
--     20 do próprio coordenador (sobem pro topo).
--   • Estágio 3 (bloqueada 5+ dias, "fora do prazo")     → EXTRA além dos 20,
--     sorteado globalmente entre os coordenadores (~1/3 cada, preferindo o dono
--     do grupo, teto +10). Quem entra como extra NÃO repete nos 20 normais.
--
-- A régua e a fila vêm da API King (só alcançável de Edge Function). Por isso a
-- geração migra de "lazy por coordenador" (RPC gerar_contatos_dia, que continua
-- como rede de segurança) para um batch diário (Edge Function contatos-dia-gerar,
-- via cron) que chama `gerar_contatos_dia_batch` por coordenador com os dados de
-- pendência já resolvidos.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Colunas de proveniência/pendência na lista diária ──────────────────────
ALTER TABLE contatos_diarios
  ADD COLUMN IF NOT EXISTS origem          TEXT     NOT NULL DEFAULT 'normal'
                                           CHECK (origem IN ('normal', 'pendencia_prioridade', 'pendencia_extra')),
  ADD COLUMN IF NOT EXISTS estagio         SMALLINT CHECK (estagio IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS dias_bloqueio   INTEGER,
  ADD COLUMN IF NOT EXISTS aulas_pendentes INTEGER;

COMMENT ON COLUMN contatos_diarios.origem IS
  'Como o professor entrou na lista: normal (regra dos 20) | pendencia_prioridade (estágio 2, no topo dos 20) | pendencia_extra (estágio 3, além dos 20, sorteio global).';
COMMENT ON COLUMN contatos_diarios.dias_bloqueio IS
  'Dias com agenda bloqueada (campo `dias` da fila da API King) — só para linhas de pendência.';

-- ── 2. Geração em batch (chamada pela Edge Function com service_role) ──────────
-- Idempotente por (coordenador, dia). Recebe os grupos de pendência já resolvidos
-- pela Edge Function (que é quem fala com a API King e faz o sorteio global):
--   p_extras     — estágio 3 atribuídos a ESTE coordenador (entram além dos 20)
--   p_prioridade — estágio 2 do grupo DESTE coordenador (entram no topo dos 20)
--   p_excluir_normal — todos os professor_id bloqueados da rede (est. 2 e 3): a
--                      lista normal nunca surfaceia um bloqueado (evita repetir
--                      entre coordenadores e entre extra/normal).
--   p_limite     — teto da lista normal (20). Prioridade conta nesse teto; extra não.
CREATE OR REPLACE FUNCTION gerar_contatos_dia_batch(
  p_coordenador_id uuid,
  p_extras         jsonb,
  p_prioridade     jsonb,
  p_excluir_normal uuid[],
  p_limite         int
) RETURNS SETOF contatos_diarios
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existe     int;
  v_prio_count int;
BEGIN
  -- Idempotente: se já há lista para hoje, devolve e sai (não recalcula).
  SELECT count(*) INTO v_existe
    FROM contatos_diarios
   WHERE coordenador_id = p_coordenador_id AND data = CURRENT_DATE;
  IF v_existe > 0 THEN
    RETURN QUERY
      SELECT * FROM contatos_diarios
       WHERE coordenador_id = p_coordenador_id AND data = CURRENT_DATE;
    RETURN;
  END IF;

  -- (a) Extras (estágio 3 sorteados): ALÉM dos 20.
  INSERT INTO contatos_diarios
    (coordenador_id, professor_id, data, origem, estagio, dias_bloqueio, aulas_pendentes)
  SELECT p_coordenador_id, (e->>'professor_id')::uuid, CURRENT_DATE, 'pendencia_extra',
         (e->>'estagio')::smallint, (e->>'dias')::int, (e->>'aulas')::int
    FROM jsonb_array_elements(COALESCE(p_extras, '[]'::jsonb)) e
  ON CONFLICT (coordenador_id, professor_id, data) DO NOTHING;

  -- (b) Prioridade (estágio 2 do próprio grupo): topo dos 20.
  INSERT INTO contatos_diarios
    (coordenador_id, professor_id, data, origem, estagio, dias_bloqueio, aulas_pendentes)
  SELECT p_coordenador_id, (pr->>'professor_id')::uuid, CURRENT_DATE, 'pendencia_prioridade',
         (pr->>'estagio')::smallint, (pr->>'dias')::int, (pr->>'aulas')::int
    FROM jsonb_array_elements(COALESCE(p_prioridade, '[]'::jsonb)) pr
  ON CONFLICT (coordenador_id, professor_id, data) DO NOTHING;

  SELECT count(*) INTO v_prio_count
    FROM contatos_diarios
   WHERE coordenador_id = p_coordenador_id AND data = CURRENT_DATE
     AND origem = 'pendencia_prioridade';

  -- (c) Preenche o restante dos 20 com a regra normal — mais tempo sem contato,
  --     excluindo bloqueados (p_excluir_normal), quem já entrou hoje e quem teve
  --     agendamento nos últimos 30 dias (mesmos 3 sinais de gerar_contatos_dia).
  IF p_limite - v_prio_count > 0 THEN
    INSERT INTO contatos_diarios (coordenador_id, professor_id, data, origem)
    SELECT p_coordenador_id, p.id, CURRENT_DATE, 'normal'
    FROM professores p
    WHERE p.status = 'ativo' AND p.coordenador_id = p_coordenador_id
      AND NOT (p.id = ANY (COALESCE(p_excluir_normal, '{}'::uuid[])))
      AND NOT EXISTS (
        SELECT 1 FROM contatos_diarios cd0
        WHERE cd0.coordenador_id = p_coordenador_id AND cd0.data = CURRENT_DATE
          AND cd0.professor_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM reuniao_professores rp
        JOIN reunioes r ON r.id = rp.reuniao_id
        WHERE rp.professor_id = p.id
          AND rp.status = 'realizada'
          AND r.data >= (CURRENT_DATE - INTERVAL '30 days')
      )
      AND NOT EXISTS (
        SELECT 1 FROM professor_acompanhamento pa
        WHERE pa.professor_id = p.id
          AND pa.reuniao_ultima IS NOT NULL
          AND pa.reuniao_ultima >= (CURRENT_DATE - INTERVAL '30 days')
      )
      AND NOT EXISTS (
        SELECT 1 FROM agenda_inscricoes ai
        JOIN agenda_horarios ah ON ah.id = ai.horario_id
        WHERE ai.professor_id = p.id
          AND ai.status = 'confirmada'
          AND ah.data_hora >= (CURRENT_DATE - INTERVAL '30 days')
      )
    ORDER BY (
      SELECT max(cd.data) FROM contatos_diarios cd
       WHERE cd.professor_id = p.id AND cd.enviado
    ) ASC NULLS FIRST, p.nome ASC
    LIMIT (p_limite - v_prio_count)
    ON CONFLICT (coordenador_id, professor_id, data) DO NOTHING;
  END IF;

  RETURN QUERY
    SELECT * FROM contatos_diarios
     WHERE coordenador_id = p_coordenador_id AND data = CURRENT_DATE;
END;
$$;

-- Só a Edge Function (service_role) chama o batch. O fluxo do browser continua
-- usando gerar_contatos_dia (rede de segurança, sem dados de pendência).
REVOKE ALL ON FUNCTION gerar_contatos_dia_batch(uuid, jsonb, jsonb, uuid[], int) FROM public;
GRANT EXECUTE ON FUNCTION gerar_contatos_dia_batch(uuid, jsonb, jsonb, uuid[], int) TO service_role;
