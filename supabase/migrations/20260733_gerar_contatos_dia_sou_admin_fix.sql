-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: gerar_contatos_dia voltou a checar permissão por `role = 'admin'` direto.
--
-- A migration 20260714 (filtro 30d) foi baseada na versão original de
-- 20260630 e, sem querer, REVERTEU a correção de 20260704 que trocou a
-- checagem de admin para sou_admin() (que também aceita is_admin = true,
-- desacoplado do role operacional). Efeito: um líder/admin-por-flag cujo
-- role é 'coordenacao' (ex.: João) recebe "Sem permissão" ao gerar a lista
-- de outro coordenador — a tela mostra "Nenhum professor ativo neste grupo".
--
-- Aqui reaplicamos a versão com filtro de 30 dias, trocando só a checagem
-- de permissão de volta para sou_admin(). A RLS de contatos_diarios já usa
-- sou_admin() desde 20260704 — só a função tinha regredido.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION gerar_contatos_dia(p_coordenador_id UUID)
RETURNS SETOF contatos_diarios AS $$
DECLARE
  v_existe INT;
BEGIN
  IF auth.uid() <> p_coordenador_id AND NOT sou_admin() THEN
    RAISE EXCEPTION 'Sem permissão para gerar contatos deste coordenador.';
  END IF;

  SELECT count(*) INTO v_existe
    FROM contatos_diarios
   WHERE coordenador_id = p_coordenador_id AND data = CURRENT_DATE;

  IF v_existe = 0 THEN
    INSERT INTO contatos_diarios (coordenador_id, professor_id, data)
    SELECT p_coordenador_id, p.id, CURRENT_DATE
    FROM professores p
    WHERE p.status = 'ativo' AND p.coordenador_id = p_coordenador_id
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

GRANT EXECUTE ON FUNCTION gerar_contatos_dia(uuid) TO authenticated;
