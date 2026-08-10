-- ─────────────────────────────────────────────────────────────────────────────
-- Data de início do onboarding acompanha a data do King.
--
-- PROBLEMA: `onboarding_professores.data_inicio` era uma cópia tirada no momento
-- da semeadura (gerar_onboarding_professores fazia INSERT ... ON CONFLICT DO
-- NOTHING) e nunca mais era tocada. Quando a escola corrige a data de entrada do
-- professor no King, o kms-api-sync atualiza `professores.data_inicio` — e o
-- acompanhamento ficava preso na data velha. Em 10/08/2026: 5 de 148 linhas
-- divergentes, todas já com checklist preenchido.
--
-- SOLUÇÃO, em três camadas:
--   1. gatilho em professores → propaga a mudança na hora (pega o sync e
--      qualquer edição manual),
--   2. gerar_onboarding_professores() reconcilia o que escapou, toda vez que a
--      tela abre (auto-cura, idempotente),
--   3. backfill das linhas que já estão divergentes hoje.
--
-- Mudar a data debaixo de quem já marcou mensagens enviadas desloca o
-- calendário inteiro do checklist — por isso a mudança fica REGISTRADA
-- (data_inicio_anterior + data_inicio_alterada_em) e a tela avisa, até alguém
-- dar ciência. Sinaliza só quando há trabalho em risco: linha com alguma
-- marcação e ainda não concluída. Sem marcação nenhuma, ou já 7/7, a data é
-- corrigida em silêncio.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Colunas do aviso ───────────────────────────────────────────────────────

ALTER TABLE onboarding_professores
  ADD COLUMN IF NOT EXISTS data_inicio_anterior    DATE,
  ADD COLUMN IF NOT EXISTS data_inicio_alterada_em TIMESTAMPTZ;

COMMENT ON COLUMN onboarding_professores.data_inicio_anterior IS
  'Data de início que o acompanhamento usava antes da última mudança vinda do King. NULL = sem mudança pendente de ciência.';
COMMENT ON COLUMN onboarding_professores.data_inicio_alterada_em IS
  'Quando a data de início mudou. A tela mostra o aviso enquanto não for NULL; dar ciência zera as duas colunas.';


-- ── 2. Regra única de "vale avisar?" ──────────────────────────────────────────
-- Há marcação (alguém já trabalhou nesta linha) e ainda não terminou os 7 dias.

CREATE OR REPLACE FUNCTION onboarding_merece_aviso(p_dias SMALLINT[])
RETURNS BOOLEAN AS $$
  SELECT p_dias IS NOT NULL
     AND p_dias <> ARRAY[0,0,0,0,0,0,0]::SMALLINT[]
     AND p_dias <> ARRAY[2,2,2,2,2,2,2]::SMALLINT[];
$$ LANGUAGE sql IMMUTABLE;


-- ── 3. Gatilho: professores.data_inicio → onboarding_professores ──────────────
-- AFTER UPDATE OF ... dispara mesmo quando a coluna é reescrita com o mesmo
-- valor (o upsert do kms-api-sync reescreve a linha toda a cada rodada), por
-- isso o WHEN com IS DISTINCT FROM — sem ele, todo sync tocaria 1800 linhas.

CREATE OR REPLACE FUNCTION propagar_data_inicio_onboarding()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE onboarding_professores o
     SET data_inicio             = NEW.data_inicio,
         -- Guarda a data contra a qual o checklist foi preenchido (a da linha,
         -- não a de professores — elas podem já estar divergentes).
         data_inicio_anterior    = CASE WHEN onboarding_merece_aviso(o.dias)
                                        THEN o.data_inicio END,
         data_inicio_alterada_em = CASE WHEN onboarding_merece_aviso(o.dias)
                                        THEN NOW() END
   WHERE o.professor_id = NEW.id
     AND o.data_inicio IS DISTINCT FROM NEW.data_inicio;
  RETURN NULL; -- AFTER trigger: valor de retorno é ignorado
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_professor_data_inicio_onboarding ON professores;
CREATE TRIGGER trg_professor_data_inicio_onboarding
  AFTER UPDATE OF data_inicio ON professores
  FOR EACH ROW
  WHEN (NEW.data_inicio IS DISTINCT FROM OLD.data_inicio)
  EXECUTE FUNCTION propagar_data_inicio_onboarding();


-- ── 4. Semeadura + reconciliação (auto-cura a cada abertura da tela) ──────────
-- Mesma semeadura de 20260717, agora com um passo de reconciliação antes: se o
-- gatilho não pegou (migration aplicada depois da mudança, carga direta no
-- banco, restore), a tela conserta sozinha.

CREATE OR REPLACE FUNCTION gerar_onboarding_professores()
RETURNS VOID AS $$
BEGIN
  IF NOT (
    sou_admin()
    OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerar o acompanhamento de onboarding.';
  END IF;

  -- Reconciliação: alinha quem ficou pra trás.
  UPDATE onboarding_professores o
     SET data_inicio             = p.data_inicio,
         data_inicio_anterior    = CASE WHEN onboarding_merece_aviso(o.dias)
                                        THEN o.data_inicio END,
         data_inicio_alterada_em = CASE WHEN onboarding_merece_aviso(o.dias)
                                        THEN NOW() END
    FROM professores p
   WHERE p.id = o.professor_id
     AND p.data_inicio IS NOT NULL
     AND o.data_inicio IS DISTINCT FROM p.data_inicio;

  -- Semeadura: quem começou nos últimos 10 dias ou começa nos próximos 14.
  INSERT INTO onboarding_professores (professor_id, data_inicio)
  SELECT p.id, p.data_inicio
  FROM professores p
  WHERE p.status <> 'desligado'
    AND p.data_inicio IS NOT NULL
    AND p.data_inicio >= CURRENT_DATE - INTERVAL '10 days'
    AND p.data_inicio <= CURRENT_DATE + INTERVAL '14 days'
  ON CONFLICT (professor_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION gerar_onboarding_professores() TO authenticated;


-- ── 5. Dar ciência do aviso ───────────────────────────────────────────────────
-- Some com o aviso da linha sem mexer na data nem no checklist.

CREATE OR REPLACE FUNCTION confirmar_mudanca_inicio_onboarding(p_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT (
    sou_admin()
    OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
  ) THEN
    RAISE EXCEPTION 'Sem permissão para editar o acompanhamento de onboarding.';
  END IF;

  UPDATE onboarding_professores
     SET data_inicio_anterior = NULL, data_inicio_alterada_em = NULL
   WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION confirmar_mudanca_inicio_onboarding(uuid) TO authenticated;


-- ── 6. Backfill das divergências que já existem ───────────────────────────────

UPDATE onboarding_professores o
   SET data_inicio             = p.data_inicio,
       data_inicio_anterior    = CASE WHEN onboarding_merece_aviso(o.dias)
                                      THEN o.data_inicio END,
       data_inicio_alterada_em = CASE WHEN onboarding_merece_aviso(o.dias)
                                      THEN NOW() END
  FROM professores p
 WHERE p.id = o.professor_id
   AND p.data_inicio IS NOT NULL
   AND o.data_inicio IS DISTINCT FROM p.data_inicio;
