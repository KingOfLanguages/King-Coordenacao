-- ─────────────────────────────────────────────────────────────────────────────
-- Correção: a observação do pedido de transferência não estava sendo criada.
--
-- `observacoes.tipo` é o ENUM `tipo_observacao`, não TEXT. Em 20260761 o tipo
-- passou a ser escolhido em runtime (ocorrencia vs feedback_negativo, conforme
-- o prazo) e foi parar numa variável `TEXT` — que o Postgres NÃO converte
-- implicitamente para enum no INSERT. Em 20260760 funcionava por acidente: o
-- literal ia direto no VALUES, e literal sem tipo o Postgres coage sozinho.
--
-- O erro ficava invisível porque o bloco EXCEPTION (proposital, pra nunca
-- perder o pedido do professor) engolia a falha: o pedido era gravado e o
-- perfil ficava sem registro nenhum. O guard continua — mas agora o tipo é
-- declarado como o enum, então a conversão acontece na atribuição.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION registrar_observacao_transferencia()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_autor UUID;
  v_obs   UUID;
  v_prazo INTEGER;
  v_tipo  tipo_observacao;   -- ← era TEXT; enum não aceita text sem cast
  v_texto TEXT;
BEGIN
  SELECT COALESCE(
           pr.coordenador_id,
           (SELECT id FROM profiles
             WHERE (is_admin OR role = 'admin') AND ativo
             ORDER BY created_at LIMIT 1)
         )
    INTO v_autor
    FROM professores pr WHERE pr.id = NEW.professor_id;

  v_prazo := dias_uteis_entre(CURRENT_DATE, NEW.data_ultima_aula);
  v_tipo  := (CASE WHEN v_prazo >= 7 THEN 'ocorrencia' ELSE 'feedback_negativo' END)::tipo_observacao;

  v_texto :=
    'Solicitou transferência do aluno ' || NEW.aluno_nome ||
    '. Última aula em ' || to_char(NEW.data_ultima_aula, 'DD/MM/YYYY') ||
    -- "útil" → "úteis" perde o L: montar por pedaços dava "útileis".
    ' (' || v_prazo || CASE WHEN v_prazo = 1 THEN ' dia útil' ELSE ' dias úteis' END ||
    ' de antecedência)' ||
    CASE WHEN v_prazo < 7
         THEN ' — ABAIXO do prazo de 7 dias úteis acordado.'
         ELSE '.' END ||
    ' Motivo: ' || NEW.motivo ||
    '. Relato: ' || NEW.detalhe;

  BEGIN
    INSERT INTO observacoes (professor_id, coordenador_id, tipo, texto)
    VALUES (NEW.professor_id, v_autor, v_tipo, v_texto)
    RETURNING id INTO v_obs;

    UPDATE transferencias_aluno SET observacao_id = v_obs WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Transferência %: observação no perfil falhou (%). O pedido foi mantido.',
      NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
