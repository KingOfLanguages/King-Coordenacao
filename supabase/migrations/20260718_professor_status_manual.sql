-- ─────────────────────────────────────────────────────────────────────────────
-- Objetivo (2026-07-08): tirar professores do status de "pausa" manualmente, com
-- uma tela de acompanhamento dos que voltaram.
--
-- Problema: professores.status é sincronizado do KMS (kms-api-sync). Um un-pause
-- feito no KTM seria revertido no próximo ciclo do sync se o KMS ainda reportar
-- "pausado". Solução: uma TRAVA no próprio banco — quando o status é definido
-- manualmente (status_manual=true), o trigger ignora tentativas externas de
-- mudar o status (o sync re-pausando), mantendo o valor manual. Exceção:
-- 'desligado' do KMS sempre vence (um desligamento real não pode ser mascarado)
-- e libera a trava. Assim NÃO precisamos mexer na função de sync.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE professores
  ADD COLUMN IF NOT EXISTS status_manual  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS despausado_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS despausado_por UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN professores.status_manual  IS 'Status travado manualmente — o sync do KMS não sobrescreve (exceto desligado). Ver trigger sync_professor_status.';
COMMENT ON COLUMN professores.despausado_em  IS 'Quando o professor foi tirado da pausa manualmente. Base da tela de Retorno de Pausa.';
COMMENT ON COLUMN professores.despausado_por IS 'Quem tirou o professor da pausa.';

-- Índice parcial pra tela de acompanhamento (poucos registros).
CREATE INDEX IF NOT EXISTS idx_professores_despausados
  ON professores (despausado_em DESC) WHERE despausado_em IS NOT NULL;

-- ── Trigger: trava de status manual + reconciliação legada status<->pausa/saiu ─
-- A parte de reconciliação é idêntica à de 20260628_ktm_foundation.sql; só
-- prependamos o bloco da trava.

CREATE OR REPLACE FUNCTION sync_professor_status() RETURNS TRIGGER AS $$
BEGIN
  -- ── Trava de status manual ───────────────────────────────────────────────────
  -- Se o status foi travado manualmente e continua travado, uma tentativa de
  -- mudança externa (o sync do KMS re-pausando) é ignorada. Exceção: 'desligado'
  -- do KMS vence e libera a trava.
  IF TG_OP = 'UPDATE' AND OLD.status_manual AND NEW.status_manual
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'desligado' THEN
      NEW.status_manual  := false;
      NEW.despausado_em  := NULL;
      NEW.despausado_por := NULL;
    ELSE
      NEW.status := OLD.status;
    END IF;
  END IF;

  -- ── Reconciliação status <-> pausa/saiu (compatibilidade, legado) ────────────
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.pausa := (NEW.status = 'pausa');
    NEW.saiu  := (NEW.status = 'desligado');
  ELSIF TG_OP = 'UPDATE'
        AND (NEW.pausa IS DISTINCT FROM OLD.pausa OR NEW.saiu IS DISTINCT FROM OLD.saiu) THEN
    NEW.status := CASE WHEN NEW.saiu THEN 'desligado'
                       WHEN NEW.pausa THEN 'pausa'
                       ELSE 'ativo' END;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'ativo' THEN
      NEW.pausa := (NEW.status = 'pausa');
      NEW.saiu  := (NEW.status = 'desligado');
    ELSE
      NEW.status := CASE WHEN NEW.saiu THEN 'desligado'
                         WHEN NEW.pausa THEN 'pausa'
                         ELSE 'ativo' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
