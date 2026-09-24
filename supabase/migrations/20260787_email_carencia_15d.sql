-- ─────────────────────────────────────────────────────────────────────────────
-- Carência de 15 dias entre e-mails para o mesmo professor (2026-09-24).
--
-- Quem recebeu e-mail da coordenação no dia X só volta a poder receber outro
-- convite por e-mail no dia X + 15. Antes disto não havia trava nenhuma: nos 15
-- dias até 24/09, 415 dos 523 professores que receberam e-mail receberam mais de
-- um (houve quem recebesse 20), com intervalo mediano de ~1 dia entre eles.
--
-- Vale para os dois caminhos que mandam e-mail a professor:
--   • o disparo do Índice de atenção (enviar-email-massa), nos DOIS modos —
--     "Personalizada" foi 76% dos envios e quase tudo era convite de reunião;
--   • o botão de e-mail das Mensagens do dia (enviar-convite-email), que até
--     aqui não deixava rastro em email_disparos e passa a deixar.
--
-- Fonte única: email_disparos (sucesso = true). A carência é por professor E
-- por endereço — dois cadastros com o mesmo e-mail são a mesma caixa de entrada.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. De onde saiu cada e-mail ───────────────────────────────────────────────
-- 'disparo'          = sistema de disparo do Índice (é o que conta no limite de
--                      200/dia da função email-quota-hoje);
-- 'mensagens_do_dia' = convite 1-a-1 da Minha Área (fora do limite de 200).
ALTER TABLE email_disparos
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'disparo'
    CHECK (origem IN ('disparo', 'mensagens_do_dia'));

COMMENT ON COLUMN email_disparos.origem IS
  'disparo = Índice de atenção (conta no limite de 200/dia) | mensagens_do_dia = convite 1-a-1 da Minha Área.';

-- ── 2. Quem está em carência ──────────────────────────────────────────────────
-- Uma linha por professor que recebeu e-mail nos últimos 15 dias (fuso de São
-- Paulo, por dia): quando foi o último e em que dia volta a poder receber.
-- p_professor_ids = NULL devolve todos.
CREATE OR REPLACE FUNCTION email_carencia(p_professor_ids uuid[] DEFAULT NULL)
RETURNS TABLE (professor_id uuid, ultimo_envio timestamptz, libera_em date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cfg AS (
    SELECT 15 AS dias,                                          -- ← a carência
           (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
  ),
  recentes AS (
    SELECT d.professor_id, lower(trim(d.email)) AS email, d.created_at
      FROM email_disparos d, cfg
     WHERE d.sucesso
       -- enviado no dia X ⇒ bloqueado enquanto hoje < X + dias
       AND d.created_at >= ((cfg.hoje - (cfg.dias - 1))::timestamp AT TIME ZONE 'America/Sao_Paulo')
  ),
  por_professor AS (
    SELECT r.professor_id, r.created_at FROM recentes r WHERE r.professor_id IS NOT NULL
    UNION ALL
    SELECT p.id, r.created_at
      FROM recentes r
      JOIN professores p ON lower(trim(p.email)) = r.email
  )
  SELECT pp.professor_id,
         max(pp.created_at),
         (max(pp.created_at) AT TIME ZONE 'America/Sao_Paulo')::date + (SELECT dias FROM cfg)
    FROM por_professor pp
   WHERE p_professor_ids IS NULL OR pp.professor_id = ANY (p_professor_ids)
   GROUP BY pp.professor_id;
$$;

COMMENT ON FUNCTION email_carencia(uuid[]) IS
  'Professores que receberam e-mail nos últimos 15 dias (por id ou pelo mesmo endereço), com o dia em que voltam a poder receber.';

-- Só datas, sem endereço nem conteúdo: qualquer logado pode ler (a tela marca
-- quem está em carência). As Edge Functions chamam com service_role.
-- O Supabase concede EXECUTE a anon/authenticated EXPLICITAMENTE em toda função
-- nova — tirar de `public` não basta, tem que nomear o anon.
REVOKE ALL ON FUNCTION email_carencia(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION email_carencia(uuid[]) TO authenticated, service_role;

-- ── 3. Mensagens do dia: quem está em carência não entra na lista normal ──────
-- Mesmas definições de 20260733 (gerar_contatos_dia) e 20260743
-- (gerar_contatos_dia_batch) — conferidas contra o banco em 2026-09-24 — com um
-- filtro a mais na regra dos 20. As linhas de pendência (estágios 2 e 3, agenda
-- bloqueada) continuam entrando: o WhatsApp segue livre, e o e-mail é barrado
-- pela própria enviar-convite-email.

CREATE OR REPLACE FUNCTION gerar_contatos_dia(p_coordenador_id UUID)
RETURNS SETOF contatos_diarios AS $$
DECLARE
  v_existe   INT;
  v_carencia uuid[];
BEGIN
  IF auth.uid() <> p_coordenador_id AND NOT sou_admin() THEN
    RAISE EXCEPTION 'Sem permissão para gerar contatos deste coordenador.';
  END IF;

  SELECT count(*) INTO v_existe
    FROM contatos_diarios
   WHERE coordenador_id = p_coordenador_id AND data = CURRENT_DATE;

  IF v_existe = 0 THEN
    v_carencia := ARRAY(SELECT ec.professor_id FROM email_carencia() ec);

    INSERT INTO contatos_diarios (coordenador_id, professor_id, data)
    SELECT p_coordenador_id, p.id, CURRENT_DATE
    FROM professores p
    WHERE p.status = 'ativo' AND p.coordenador_id = p_coordenador_id
      -- (0) recebeu e-mail nos últimos 15 dias (email_carencia)
      AND NOT (p.id = ANY (v_carencia))
      -- (a) reunião de monitoramento 1:1 realizada nos últimos 30 dias
      AND NOT EXISTS (
        SELECT 1 FROM reuniao_professores rp
        JOIN reunioes r ON r.id = rp.reuniao_id
        WHERE rp.professor_id = p.id
          AND rp.status = 'realizada'
          AND r.data >= (CURRENT_DATE - INTERVAL '30 days')
      )
      -- (b) última reunião reportada pelo KMS nos últimos 30 dias
      AND NOT EXISTS (
        SELECT 1 FROM professor_acompanhamento pa
        WHERE pa.professor_id = p.id
          AND pa.reuniao_ultima IS NOT NULL
          AND pa.reuniao_ultima >= (CURRENT_DATE - INTERVAL '30 days')
      )
      -- (c) inscrição confirmada em agenda coletiva (horário recente ou futuro)
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
    LIMIT 20
    ON CONFLICT (coordenador_id, professor_id, data) DO NOTHING;
  END IF;

  RETURN QUERY
    SELECT * FROM contatos_diarios
     WHERE coordenador_id = p_coordenador_id AND data = CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Sem login, auth.uid() é NULL e o `<>` do IF acima dá NULL — não barra. O
-- navegador sempre chama logado; anon não tem o que fazer aqui.
REVOKE ALL ON FUNCTION gerar_contatos_dia(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION gerar_contatos_dia(uuid) TO authenticated;

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
  v_carencia   uuid[];
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
  --     excluindo bloqueados (p_excluir_normal), quem já entrou hoje, quem
  --     recebeu e-mail nos últimos 15 dias (email_carencia) e quem teve
  --     agendamento nos últimos 30 dias (mesmos 3 sinais de gerar_contatos_dia).
  IF p_limite - v_prio_count > 0 THEN
    v_carencia := ARRAY(SELECT ec.professor_id FROM email_carencia() ec);

    INSERT INTO contatos_diarios (coordenador_id, professor_id, data, origem)
    SELECT p_coordenador_id, p.id, CURRENT_DATE, 'normal'
    FROM professores p
    WHERE p.status = 'ativo' AND p.coordenador_id = p_coordenador_id
      AND NOT (p.id = ANY (COALESCE(p_excluir_normal, '{}'::uuid[])))
      AND NOT (p.id = ANY (v_carencia))
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

-- 20260743 queria "só service_role", mas o REVOKE FROM public deixou os grants
-- explícitos do Supabase a anon/authenticated de pé: a função (SECURITY DEFINER,
-- sem checagem de quem chama) estava aberta à chave pública. Fecha aqui.
REVOKE ALL ON FUNCTION gerar_contatos_dia_batch(uuid, jsonb, jsonb, uuid[], int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION gerar_contatos_dia_batch(uuid, jsonb, jsonb, uuid[], int) TO service_role;
