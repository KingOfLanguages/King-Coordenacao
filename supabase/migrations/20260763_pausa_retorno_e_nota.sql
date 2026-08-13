-- ─────────────────────────────────────────────────────────────────────────────
-- Pausas: editar a data de retorno e anotar o acompanhamento (2026-08-13).
--
-- Duas lacunas na área de Pausas:
--
-- 1. A data de retorno (`data_fim` — o dia do contato da coordenação) só podia
--    ser definida pelo professor no portal, no momento do pedido. Quando ele
--    liga avisando que volta mais tarde (ou mais cedo), não havia onde mudar:
--    o card ficava marcando "contato atrasado" para sempre, e a cobrança do
--    fim de pausa disparava na data errada.
--
-- 2. Não havia onde escrever o que já foi combinado com o professor durante a
--    pausa. O motivo é o que ELE escreveu no pedido e não muda; quem cuida da
--    fila anotava fora do sistema.
--
-- A nota vive na linha da pausa e é exibida SÓ pelas listas da área de Pausas
-- (fila + vigentes) — as duas somem quando a pausa encerra, então a nota some
-- junto, como pedido, sem que a gente apague o histórico da linha.
--
-- Segurança: mesmo padrão de 20260738 — nada de escrita direta (`pausas` não
-- tem policy de UPDATE), só função SECURITY DEFINER com o gate `pode_gerir_pausa`
-- (coordenação, Suporte, Suporte ao Aluno e admin).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Colunas ───────────────────────────────────────────────────────────────

ALTER TABLE pausas ADD COLUMN IF NOT EXISTS nota        TEXT;
ALTER TABLE pausas ADD COLUMN IF NOT EXISTS nota_por    UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE pausas ADD COLUMN IF NOT EXISTS nota_em     TIMESTAMPTZ;
ALTER TABLE pausas ADD COLUMN IF NOT EXISTS data_fim_original DATE;

COMMENT ON COLUMN pausas.nota IS
  'Observação interna do acompanhamento da pausa. Aparece nos cards da área de Pausas enquanto a pausa está viva; some quando ela encerra (o card sai das listas).';
COMMENT ON COLUMN pausas.data_fim_original IS
  'Data de retorno que o professor pediu no portal. Preenchida na primeira edição de data_fim — o que ele pediu não se perde.';

-- ── 2. Editar a data de retorno ──────────────────────────────────────────────

/**
 * Muda a data de retorno (data_fim) de uma pausa que ainda está viva: na fila
 * (pendente/em_atendimento) ou já vigente e não encerrada.
 *
 * A cobrança do fim de pausa (`cobrar_fim_pausas`) só roda uma vez por pausa,
 * travada por `tarefa_fim_id` UNIQUE. Se a data foi empurrada para o futuro e a
 * cobrança JÁ tinha saído, a tarefa aberta virou ruído: fechamos ela e soltamos
 * a trava, para o cron cobrar de novo na data nova. Uma tarefa que alguém já
 * concluiu fica como está — só limpamos o vínculo.
 */
CREATE OR REPLACE FUNCTION atualizar_retorno_pausa(p_id UUID, p_data_fim DATE)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pausa pausas%ROWTYPE;
BEGIN
  IF NOT pode_gerir_pausa() THEN
    RAISE EXCEPTION 'Sem permissão para alterar a data de retorno.';
  END IF;

  IF p_data_fim IS NULL THEN
    RAISE EXCEPTION 'Informe a nova data de retorno.';
  END IF;

  SELECT * INTO v_pausa FROM pausas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pausa não encontrada.';
  END IF;
  IF v_pausa.encerrada_em IS NOT NULL OR v_pausa.status = 'recusada' THEN
    RAISE EXCEPTION 'Esta pausa já foi finalizada.';
  END IF;
  IF p_data_fim < v_pausa.data_inicio THEN
    RAISE EXCEPTION 'A data de retorno não pode ser anterior ao início da pausa (%).',
      to_char(v_pausa.data_inicio, 'DD/MM/YYYY');
  END IF;

  IF p_data_fim = v_pausa.data_fim THEN
    RETURN;  -- nada a fazer
  END IF;

  -- Cobrança já disparada e data agora no futuro → destrava para cobrar de novo.
  IF v_pausa.tarefa_fim_id IS NOT NULL AND p_data_fim > CURRENT_DATE THEN
    UPDATE tarefas
       SET status        = 'concluido',
           concluido_em  = NOW(),
           concluido_por = auth.uid()
     WHERE id = v_pausa.tarefa_fim_id AND status <> 'concluido';
  END IF;

  UPDATE pausas
     SET data_fim          = p_data_fim,
         data_fim_original = COALESCE(data_fim_original, v_pausa.data_fim),
         tarefa_fim_id     = CASE WHEN p_data_fim > CURRENT_DATE THEN NULL ELSE tarefa_fim_id END
   WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION atualizar_retorno_pausa(UUID, DATE) TO authenticated;

-- ── 3. Observação da pausa ───────────────────────────────────────────────────

/** Grava (ou apaga, com texto vazio) a observação de acompanhamento da pausa. */
CREATE OR REPLACE FUNCTION atualizar_nota_pausa(p_id UUID, p_nota TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_texto TEXT := NULLIF(btrim(COALESCE(p_nota, '')), '');
BEGIN
  IF NOT pode_gerir_pausa() THEN
    RAISE EXCEPTION 'Sem permissão para anotar nesta pausa.';
  END IF;

  UPDATE pausas
     SET nota     = v_texto,
         nota_por = CASE WHEN v_texto IS NULL THEN NULL ELSE auth.uid() END,
         nota_em  = CASE WHEN v_texto IS NULL THEN NULL ELSE NOW()      END
   WHERE id = p_id
     AND encerrada_em IS NULL
     AND status <> 'recusada';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta pausa já foi finalizada.';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION atualizar_nota_pausa(UUID, TEXT) TO authenticated;
