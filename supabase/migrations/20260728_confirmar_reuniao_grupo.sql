-- ─────────────────────────────────────────────────────────────────────────────
-- Fase B: confirmação de presença de reunião de grupo (fonte única)
--
-- Antes, a web (useConfirmarParticipacao) numerava o monitoramento (`numero`) mas
-- a extensão (handleConfirmarGrupo) só setava status='realizada' sem numerar — a
-- presença marcada no Meet não contava no monitoramento. Esta RPC unifica a
-- lógica: web e extensão chamam a MESMA função, garantindo numeração consistente.
--
-- Regra:
--   • presentes  → status='realizada', numero = próxima posição do professor
--   • pendentes que sobraram → status='cancelada' (não compareceram)
--   • observação comum vai para reunioes.notas
--   • data_ultima_reuniao dos presentes é atualizada
--
-- Idempotente por natureza: reprocessar reconfirma os mesmos presentes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION confirmar_reuniao_grupo(
  p_reuniao_id    UUID,
  p_presentes     UUID[],   -- ids de reuniao_professores presentes
  p_observacao    TEXT,
  p_confirmado_por UUID
)
RETURNS VOID AS $$
DECLARE
  v_rp        RECORD;
  v_numero    INT;
  v_agora     TIMESTAMPTZ := NOW();
BEGIN
  FOR v_rp IN
    SELECT id, professor_id, status
    FROM reuniao_professores
    WHERE reuniao_id = p_reuniao_id
  LOOP
    IF v_rp.id = ANY (p_presentes) THEN
      -- Próximo número de monitoramento do professor (mesma conta da web).
      SELECT COUNT(*) + 1 INTO v_numero
      FROM reuniao_professores
      WHERE professor_id = v_rp.professor_id
        AND status = 'realizada'
        AND id <> v_rp.id;

      UPDATE reuniao_professores
      SET status = 'realizada',
          numero = v_numero,
          confirmado_em = v_agora,
          confirmado_por = p_confirmado_por
      WHERE id = v_rp.id;

      IF v_rp.professor_id IS NOT NULL THEN
        UPDATE professores SET data_ultima_reuniao = v_agora WHERE id = v_rp.professor_id;
      END IF;

    ELSIF v_rp.status = 'pendente' THEN
      -- Sobrou pendente e não está entre os presentes → não compareceu.
      UPDATE reuniao_professores
      SET status = 'cancelada',
          confirmado_em = v_agora,
          confirmado_por = p_confirmado_por
      WHERE id = v_rp.id;
    END IF;
  END LOOP;

  UPDATE reunioes
  SET notas = NULLIF(BTRIM(COALESCE(p_observacao, '')), '')
  WHERE id = p_reuniao_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION confirmar_reuniao_grupo(UUID, UUID[], TEXT, UUID)
  TO authenticated, service_role;

COMMENT ON FUNCTION confirmar_reuniao_grupo IS
  'Confirma presença de uma reunião de grupo: presentes viram realizada (com numeração de monitoramento), pendentes restantes viram cancelada, observação vai para reunioes.notas. Fonte única para web e extensão.';
