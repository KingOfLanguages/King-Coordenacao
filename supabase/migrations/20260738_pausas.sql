-- ─────────────────────────────────────────────────────────────────────────────
-- Sistema de pausa de professores (2026-07-20).
--
-- Antes: pausa era só `professores.status = 'pausa'` chegando pronto do KMS —
-- sem motivo, sem data de início, sem data de fim. Ninguém sabia por que o
-- professor parou nem quando voltar a falar com ele, e tirar os alunos dele
-- dependia de alguém lembrar.
--
-- Agora: o professor oficializa a pausa por um link público (/pausa), a
-- solicitação entra numa fila que o Suporte ao Aluno processa ANTES da data de
-- início, e a pausa ativa sozinha quando a data chega.
--
-- Ciclo de vida da solicitação:
--   pendente --assumir--> em_atendimento --concluir--> concluida
--                     \--recusar--> recusada          (sai da fila)
--
-- A pausa vira status real no professor quando as DUAS condições valem:
-- concluída pelo suporte E data_inicio alcançada — o que vier por último.
-- Quem conclui depois da data ativa na hora; quem conclui antes espera o cron.
--
-- Encerramento é separado: "pausa só encerra a partir do contato com a
-- coordenação" (regra do negócio), então o KMS não pode despausar sozinho —
-- por isso a ativação liga `status_manual`, a trava de 20260718.
--
-- Segurança: nenhuma escrita direta na tabela. O Suporte ao Aluno NÃO tem
-- UPDATE em `professores` (RLS só libera coordenação/admin) e continua sem ter:
-- ele age só pelas funções SECURITY DEFINER abaixo, que mexem exclusivamente no
-- que diz respeito a pausa. Encerrar a pausa segue restrito à coordenação.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tabela ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pausas (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id   UUID        NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  motivo         TEXT        NOT NULL,
  data_inicio    DATE        NOT NULL,   -- último dia de aula (dia em que ele para)
  data_fim       DATE        NOT NULL,   -- dia do contato da coordenação
  status         TEXT        NOT NULL DEFAULT 'pendente'
                             CHECK (status IN ('pendente', 'em_atendimento', 'concluida', 'recusada')),

  assumido_por   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assumido_em    TIMESTAMPTZ,
  concluido_por  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  concluido_em   TIMESTAMPTZ,
  recusado_por   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  recusado_em    TIMESTAMPTZ,
  motivo_recusa  TEXT,

  ativada_em     TIMESTAMPTZ,  -- quando professores.status virou 'pausa' de fato
  encerrada_em   TIMESTAMPTZ,  -- quando a coordenação tirou da pausa
  encerrada_por  UUID REFERENCES profiles(id) ON DELETE SET NULL,

  observacao_id  UUID REFERENCES observacoes(id) ON DELETE SET NULL,
  tarefa_fim_id  UUID UNIQUE REFERENCES tarefas(id) ON DELETE SET NULL,

  origem         TEXT        NOT NULL DEFAULT 'portal',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE pausas IS
  'Solicitações de pausa dos professores (portal público /pausa) e seu processamento pelo Suporte ao Aluno. Escrita só pelas funções SECURITY DEFINER — não há policy de INSERT/UPDATE.';
COMMENT ON COLUMN pausas.data_inicio   IS 'Último dia de aula — a pausa ativa nesta data (se já concluída).';
COMMENT ON COLUMN pausas.data_fim      IS 'Dia em que a coordenação precisa entrar em contato para encerrar a pausa.';
COMMENT ON COLUMN pausas.ativada_em    IS 'Quando o professor efetivamente virou status=pausa. NULL = ainda não ativou.';
COMMENT ON COLUMN pausas.encerrada_em  IS 'Quando a coordenação tirou o professor da pausa. Encerrar é exclusivo da coordenação.';
COMMENT ON COLUMN pausas.observacao_id IS 'Observação criada no perfil do professor na ativação (motivo + as duas datas).';
COMMENT ON COLUMN pausas.tarefa_fim_id IS 'Tarefa de cobrança do contato de fim de pausa. UNIQUE: não duplica a cobrança.';

-- Ordenação da fila: as não-finalizadas, mais próximas do início primeiro.
CREATE INDEX IF NOT EXISTS idx_pausas_fila
  ON pausas (data_inicio) WHERE status IN ('pendente', 'em_atendimento');

CREATE INDEX IF NOT EXISTS idx_pausas_professor ON pausas (professor_id, created_at DESC);

-- Pausa vigente do professor (a que já ativou e ainda não encerrou) — usada na
-- lista de professores e no Índice de Prioridade.
CREATE INDEX IF NOT EXISTS idx_pausas_vigente
  ON pausas (professor_id) WHERE ativada_em IS NOT NULL AND encerrada_em IS NULL;

-- Um professor não pode ter duas solicitações abertas ao mesmo tempo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pausas_uma_aberta_por_professor
  ON pausas (professor_id) WHERE status IN ('pendente', 'em_atendimento');

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
-- Leitura para qualquer autenticado (mesma abertura de professores/observacoes).
-- Sem policy de INSERT/UPDATE/DELETE: escrita só via funções DEFINER (padrão de
-- `notificacoes`, 20260735).

ALTER TABLE pausas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pausas_select" ON pausas;
CREATE POLICY "pausas_select" ON pausas FOR SELECT TO authenticated USING (true);

-- ── 3. Helpers de cargo ──────────────────────────────────────────────────────

/** Quem trabalha a FILA de pausas: coordenação, suporte ao aluno e admin. */
CREATE OR REPLACE FUNCTION pode_gerir_pausa() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT is_admin OR role IN ('admin', 'coordenacao', 'suporte_aluno')
    FROM profiles WHERE id = auth.uid()
  ), false);
$$;
GRANT EXECUTE ON FUNCTION pode_gerir_pausa() TO authenticated;

/** Quem pode ENCERRAR uma pausa: só coordenação e admin — "a pausa só encerra a
 *  partir do contato com a coordenação". O suporte ao aluno processa a fila mas
 *  não tira ninguém da pausa. */
CREATE OR REPLACE FUNCTION pode_encerrar_pausa() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT is_admin OR role IN ('admin', 'coordenacao')
    FROM profiles WHERE id = auth.uid()
  ), false);
$$;
GRANT EXECUTE ON FUNCTION pode_encerrar_pausa() TO authenticated;

-- ── 4. Ativação (interna) ────────────────────────────────────────────────────

/**
 * Efetiva a pausa no professor: status='pausa' + trava contra o sync do KMS, e
 * registra a observação no perfil com motivo e as duas datas.
 *
 * `status_manual := true` no MESMO update não é barrado pela trava de
 * 20260718 porque aquele bloco exige `OLD.status_manual` já verdadeiro — aqui
 * OLD ainda é false. A partir do ciclo seguinte, o KMS não consegue despausar.
 *
 * Sem GRANT para authenticated: só é chamada por concluir_pausa() e pelo cron.
 */
CREATE OR REPLACE FUNCTION ativar_pausa(p_id UUID, p_ator UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pausa pausas%ROWTYPE;
  v_obs   UUID;
  v_autor UUID;
BEGIN
  SELECT * INTO v_pausa FROM pausas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_pausa.ativada_em IS NOT NULL THEN
    RETURN;  -- idempotente: cron pode rodar duas vezes no mesmo dia
  END IF;

  -- Autor da observação: quem concluiu a solicitação. Quando quem ativa é o
  -- cron (p_ator NULL), atribui ao coordenador do professor — fica melhor
  -- creditado e evita depender de `observacoes.coordenador_id` aceitar NULL.
  SELECT COALESCE(p_ator, pr.coordenador_id) INTO v_autor
    FROM professores pr WHERE pr.id = v_pausa.professor_id;

  -- Dois UPDATEs de propósito. A trava de 20260718 reverte qualquer mudança de
  -- status quando `status_manual` já estava ligado — e ela estaria, se este
  -- professor tivesse sido tirado da pausa antes. Soltamos a trava primeiro
  -- (limpando também o retorno de pausa anterior, que deixou de valer) e só
  -- então gravamos a pausa nova, agora com OLD.status_manual = false.
  UPDATE professores
     SET status_manual  = false,
         despausado_em  = NULL,
         despausado_por = NULL
   WHERE id = v_pausa.professor_id;

  UPDATE professores
     SET status        = 'pausa',
         status_manual = true
   WHERE id = v_pausa.professor_id;

  -- Observação no perfil (o trigger de snapshot preenche o resto sozinho).
  INSERT INTO observacoes (professor_id, coordenador_id, tipo, texto)
  VALUES (
    v_pausa.professor_id,
    v_autor,
    'ocorrencia',
    'Pausa oficializada. Motivo: ' || v_pausa.motivo ||
    '. Início: '     || to_char(v_pausa.data_inicio, 'DD/MM/YYYY') ||
    '. Fim previsto: ' || to_char(v_pausa.data_fim,  'DD/MM/YYYY') || '.'
  )
  RETURNING id INTO v_obs;

  UPDATE pausas
     SET ativada_em = NOW(), observacao_id = v_obs
   WHERE id = p_id;
END;
$$;

-- ── 5. Ações da fila ─────────────────────────────────────────────────────────

/** Assume a solicitação (pendente → em_atendimento). Falha se já tem dono —
 *  é o que impede duas pessoas processarem a mesma pausa. */
CREATE OR REPLACE FUNCTION assumir_pausa(p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dono UUID;
BEGIN
  IF NOT pode_gerir_pausa() THEN
    RAISE EXCEPTION 'Sem permissão para assumir solicitações de pausa.';
  END IF;

  SELECT assumido_por INTO v_dono FROM pausas WHERE id = p_id AND status = 'pendente' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não está pendente.';
  END IF;
  IF v_dono IS NOT NULL THEN
    RAISE EXCEPTION 'Solicitação já assumida por outra pessoa.';
  END IF;

  UPDATE pausas
     SET status = 'em_atendimento', assumido_por = auth.uid(), assumido_em = NOW()
   WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION assumir_pausa(UUID) TO authenticated;

/** Devolve a solicitação para a fila (em_atendimento → pendente). */
CREATE OR REPLACE FUNCTION largar_pausa(p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pode_gerir_pausa() THEN
    RAISE EXCEPTION 'Sem permissão para alterar solicitações de pausa.';
  END IF;

  UPDATE pausas
     SET status = 'pendente', assumido_por = NULL, assumido_em = NULL
   WHERE id = p_id AND status = 'em_atendimento';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não está em atendimento.';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION largar_pausa(UUID) TO authenticated;

/** Conclui: os alunos já foram retirados. Ativa a pausa na hora se a data de
 *  início já chegou; senão o cron `king-ativar-pausas` ativa no dia certo. */
CREATE OR REPLACE FUNCTION concluir_pausa(p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inicio DATE;
BEGIN
  IF NOT pode_gerir_pausa() THEN
    RAISE EXCEPTION 'Sem permissão para concluir solicitações de pausa.';
  END IF;

  SELECT data_inicio INTO v_inicio
    FROM pausas WHERE id = p_id AND status IN ('pendente', 'em_atendimento') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação já finalizada.';
  END IF;

  UPDATE pausas
     SET status = 'concluida', concluido_por = auth.uid(), concluido_em = NOW()
   WHERE id = p_id;

  IF v_inicio <= CURRENT_DATE THEN
    PERFORM ativar_pausa(p_id, auth.uid());
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION concluir_pausa(UUID) TO authenticated;

/** Recusa: tira da fila sem pausar o professor. */
CREATE OR REPLACE FUNCTION recusar_pausa(p_id UUID, p_motivo TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pode_gerir_pausa() THEN
    RAISE EXCEPTION 'Sem permissão para recusar solicitações de pausa.';
  END IF;

  UPDATE pausas
     SET status = 'recusada', recusado_por = auth.uid(), recusado_em = NOW(),
         motivo_recusa = NULLIF(btrim(COALESCE(p_motivo, '')), '')
   WHERE id = p_id AND status IN ('pendente', 'em_atendimento');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação já finalizada.';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION recusar_pausa(UUID, TEXT) TO authenticated;

/** Encerra a pausa vigente do professor — o contato da coordenação aconteceu.
 *  Tira da pausa (mantendo a trava contra o KMS, igual ao "Tirar da pausa" que
 *  já existia) e fecha a linha de pausa. Só coordenação/admin. */
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

  UPDATE pausas
     SET encerrada_em = NOW(), encerrada_por = auth.uid()
   WHERE professor_id = p_professor_id
     AND ativada_em IS NOT NULL
     AND encerrada_em IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION encerrar_pausa(UUID) TO authenticated;

-- ── 6. Rotinas diárias ───────────────────────────────────────────────────────
-- Ambas em SQL puro, de propósito: sem net.http_post e sem service_role key.
-- (O commit c63b9de tirou uma service_role key hardcoded justamente de uma
-- migration de cron; um job que não faz HTTP não precisa de chave nenhuma.)

/** Ativa as pausas concluídas cuja data de início já chegou. Idempotente. */
CREATE OR REPLACE FUNCTION ativar_pausas_do_dia() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r     RECORD;
  v_qtd INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id FROM pausas
     WHERE status = 'concluida'
       AND ativada_em IS NULL
       AND data_inicio <= CURRENT_DATE
  LOOP
    PERFORM ativar_pausa(r.id, NULL);
    v_qtd := v_qtd + 1;
  END LOOP;
  RETURN v_qtd;
END;
$$;

/** Cobra o contato de fim de pausa: cria a tarefa para o coordenador do
 *  professor e o aviso no sino. Uma vez por pausa (tarefa_fim_id é UNIQUE). */
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

    INSERT INTO tarefas (titulo, descricao, criado_por, atribuido_a, atribuido_time, status)
    VALUES (
      'Encerrar pausa: ' || r.professor_nome,
      'A pausa terminou em ' || to_char(r.data_fim, 'DD/MM/YYYY') ||
      '. Motivo registrado: ' || r.motivo ||
      '. Entre em contato com o professor para encerrar a pausa oficialmente.',
      v_criador,
      r.coordenador_id,
      CASE WHEN r.coordenador_id IS NULL THEN 'coordenacao' ELSE NULL END,
      'aberto'
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

SELECT cron.unschedule('king-ativar-pausas')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-ativar-pausas');
SELECT cron.schedule('king-ativar-pausas', '10 3 * * *', $$ SELECT ativar_pausas_do_dia(); $$);

SELECT cron.unschedule('king-cobrar-fim-pausa')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-cobrar-fim-pausa');
SELECT cron.schedule('king-cobrar-fim-pausa', '20 3 * * *', $$ SELECT cobrar_fim_pausas(); $$);
