-- ─────────────────────────────────────────────────────────────────────────────
-- Minha Área unificada (2026-09-21)
--
-- Tarefas, Projetos e Minha Área viraram uma tela só, com uma lista "Para
-- fazer". Medido antes (30 dias): das 36 tarefas desde julho só 1 foi escrita à
-- mão; 209 das 212 convocações estavam paradas em "aguardando contato", sem
-- nenhuma mensagem registrada desde 20/08; e 11 das 13 tarefas "Encerrar pausa"
-- abertas eram de pausas já encerradas. Decisões do João:
--   1. Convocações: tirar a aba e parar a criação automática (os registros ficam).
--   2. Tarefa ganha um "para quando" opcional.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. "Para quando" da tarefa ───────────────────────────────────────────────
-- Opcional. Ordena a lista Para fazer (Atrasado / Hoje / Próximos / Sem prazo).
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS prazo DATE;

-- ── 2. Tarefa de fim de pausa nasce com prazo = data de retorno ─────────────
CREATE OR REPLACE FUNCTION cobrar_fim_pausas() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r         RECORD;
  v_criador UUID;
  v_tarefa  UUID;
  v_qtd     INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.id, p.data_fim, p.motivo, pr.nome AS professor_nome, pr.coordenador_id
      FROM pausas p
      JOIN professores pr ON pr.id = p.professor_id
     WHERE p.ativada_em   IS NOT NULL
       AND p.encerrada_em IS NULL
       AND p.tarefa_fim_id IS NULL
       AND p.data_fim <= CURRENT_DATE
  LOOP
    -- tarefas.criado_por é NOT NULL. Sem coordenador definido, cai num admin
    -- ativo e a tarefa vai para o time da coordenação.
    v_criador := COALESCE(
      r.coordenador_id,
      (SELECT id FROM profiles WHERE (is_admin OR role = 'admin') AND ativo ORDER BY created_at LIMIT 1)
    );
    CONTINUE WHEN v_criador IS NULL;

    INSERT INTO tarefas (titulo, descricao, criado_por, atribuido_a, atribuido_time, status, prazo)
    VALUES (
      'Encerrar pausa: ' || r.professor_nome,
      'A pausa terminou em ' || to_char(r.data_fim, 'DD/MM/YYYY') ||
      '. Motivo registrado: ' || r.motivo ||
      '. Entre em contato com o professor para encerrar a pausa oficialmente.',
      v_criador,
      r.coordenador_id,
      CASE WHEN r.coordenador_id IS NULL THEN 'coordenacao' ELSE NULL END,
      'aberto',
      r.data_fim
    )
    RETURNING id INTO v_tarefa;

    UPDATE pausas SET tarefa_fim_id = v_tarefa WHERE id = r.id;

    IF r.coordenador_id IS NOT NULL THEN
      INSERT INTO notificacoes (user_id, tipo, titulo, corpo)
      VALUES (
        r.coordenador_id,
        'pausa_fim',
        'Pausa de ' || r.professor_nome || ' chegou ao fim',
        'Prevista para ' || to_char(r.data_fim, 'DD/MM/YYYY') ||
        '. A pausa só encerra depois do seu contato com o professor.'
      );
    END IF;

    v_qtd := v_qtd + 1;
  END LOOP;
  RETURN v_qtd;
END;
$$;

UPDATE tarefas t
   SET prazo = p.data_fim
  FROM pausas p
 WHERE p.tarefa_fim_id = t.id
   AND t.prazo IS NULL;

-- ── 3. Encerrar a pausa conclui a tarefa "Encerrar pausa" ────────────────────
-- Antes a pausa era encerrada em Solicitações e a tarefa ficava aberta para
-- sempre (11 de 13 abertas em 2026-09-21 eram de pausas já encerradas).
CREATE OR REPLACE FUNCTION encerrar_pausa(p_professor_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pode_encerrar_pausa() THEN
    RAISE EXCEPTION 'Só a coordenação pode encerrar uma pausa.';
  END IF;

  -- Mesma armadilha da ativação: a trava está ligada (foi ativar_pausa que
  -- ligou), e ela reverteria esta mudança de status. Solta primeiro, grava
  -- depois — aí a trava volta, agora protegendo o "ativo" contra o KMS
  -- re-pausar o professor.
  UPDATE professores SET status_manual = false WHERE id = p_professor_id;

  UPDATE professores
     SET status         = 'ativo',
         status_manual  = true,
         despausado_em  = NOW(),
         despausado_por = auth.uid()
   WHERE id = p_professor_id;

  -- A tarefa de cobrança do fim da pausa é o próprio pedido deste contato.
  UPDATE tarefas
     SET status        = 'concluido',
         concluido_em  = NOW(),
         concluido_por = auth.uid()
   WHERE status <> 'concluido'
     AND id IN (
       SELECT tarefa_fim_id FROM pausas
        WHERE professor_id = p_professor_id
          AND ativada_em IS NOT NULL
          AND encerrada_em IS NULL
          AND tarefa_fim_id IS NOT NULL
     );

  UPDATE pausas
     SET encerrada_em = NOW(), encerrada_por = auth.uid()
   WHERE professor_id = p_professor_id
     AND ativada_em IS NOT NULL
     AND encerrada_em IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION encerrar_pausa(UUID) TO authenticated;

-- As que ficaram para trás: conclui com a data e o autor do encerramento.
UPDATE tarefas t
   SET status        = 'concluido',
       concluido_em  = p.encerrada_em,
       concluido_por = p.encerrada_por
  FROM pausas p
 WHERE p.tarefa_fim_id = t.id
   AND p.encerrada_em IS NOT NULL
   AND t.status <> 'concluido';

-- ── 4. Convocações: para de criar automaticamente ───────────────────────────
-- A tabela e os registros ficam (a ficha do professor e a extensão mostram o
-- histórico). Para voltar, reaplicar o trecho de 20260745_convocacoes.sql.
DROP TRIGGER IF EXISTS trg_incidente_convocacao ON nexus_incidents;
DROP TRIGGER IF EXISTS trg_observacao_convocacao ON observacoes;
DROP FUNCTION IF EXISTS trg_incidente_convocacao();
DROP FUNCTION IF EXISTS trg_observacao_convocacao();
DROP FUNCTION IF EXISTS criar_convocacao_auto(UUID, TEXT, TEXT, UUID, UUID, UUID);

-- ── 5. Pedido de informação de projeto → lista Para fazer ───────────────────
-- A pergunta aparece em "Para fazer", com a resposta ali mesmo.
CREATE OR REPLACE FUNCTION notificar_projeto_info_pedido() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_titulo TEXT;
BEGIN
  IF NEW.destinatario_id IS NULL OR NEW.destinatario_id = NEW.solicitado_por THEN
    RETURN NEW;
  END IF;
  SELECT titulo INTO v_titulo FROM projetos WHERE id = NEW.projeto_id;

  INSERT INTO notificacoes (user_id, tipo, titulo, corpo, link)
  VALUES (NEW.destinatario_id, 'projeto_info_pedido',
          'Pedido de informação: ' || COALESCE(v_titulo, 'projeto'),
          left(NEW.pergunta, 160), '/minha-area');
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notificar_projeto_info_pedido: %', SQLERRM;
    RETURN NEW;
END; $$;
