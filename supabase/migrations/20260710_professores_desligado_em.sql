-- ─────────────────────────────────────────────────────────────────────────────
-- Objetivo (Fase 5 do roadmap): rastrear QUANDO um professor foi desligado, pra
-- montar o gráfico de saídas por período no Dashboard Geral.
--
-- Hoje só existe status='desligado' (sem data). Adicionamos desligado_em e
-- passamos a carimbá-lo no trigger sync_professor_status() — o único ponto por
-- onde o status muda (tanto o kms-api-sync quanto ações manuais passam por ele),
-- então a data é preenchida seja qual for a origem do desligamento.
--
-- Histórico: professores já desligados ANTES desta migration ficam com
-- desligado_em NULL (não sabemos a data real) e simplesmente não aparecem na
-- série temporal de saídas. Só desligamentos daqui pra frente são datados.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE professores
  ADD COLUMN IF NOT EXISTS desligado_em TIMESTAMPTZ;

COMMENT ON COLUMN professores.desligado_em IS
  'Quando o professor foi desligado (status→desligado). Carimbado pelo trigger sync_professor_status. NULL em desligamentos legados anteriores a 2026-07-10.';

CREATE INDEX IF NOT EXISTS idx_professores_desligado_em
  ON professores (desligado_em DESC) WHERE desligado_em IS NOT NULL;

-- ── Trigger: mantém desligado_em em sincronia com o status ────────────────────
-- Reproduz o corpo de 20260718_professor_status_manual.sql (trava manual +
-- reconciliação legada) e ACRESCENTA, no fim, a manutenção de desligado_em já
-- com o status final (depois da trava, caso ela tenha revertido a mudança).

CREATE OR REPLACE FUNCTION sync_professor_status() RETURNS TRIGGER AS $$
BEGIN
  -- ── Trava de status manual ───────────────────────────────────────────────────
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

  -- ── Manutenção de desligado_em (usa o status já finalizado acima) ────────────
  IF NEW.status = 'desligado' THEN
    -- Passou a desligado agora (INSERT já desligado, ou UPDATE que virou desligado):
    -- carimba a data, respeitando um valor já fornecido explicitamente.
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'desligado' THEN
      NEW.desligado_em := COALESCE(NEW.desligado_em, now());
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'desligado' THEN
    -- Reativado (voltou de desligado pra ativo/pausa): limpa a data.
    NEW.desligado_em := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
