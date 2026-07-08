-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding de professores recém-contratados — acompanhamento de 7 dias.
--
-- O suporte ao professor (Bianca, Débora) precisa garantir que todo professor
-- que entra na escola receba a sequência de mensagens de boas-vindas nos seus
-- primeiros 7 dias (Dia 1 = primeiro dia de casa). Esta migration:
--   1. adiciona professores.telefone (não vem da API do KMS; preenchido à mão),
--   2. cria onboarding_professores — uma linha por professor em acompanhamento,
--      com o status de cada um dos 7 dias,
--   3. cria gerar_onboarding_professores() — semeia a lista com quem começou
--      há pouco ou está prestes a começar (idempotente, chamada ao abrir a tela),
--   4. cria definir_telefone_professor() — deixa o suporte gravar o telefone
--      sem abrir a escrita geral da tabela professores (que é só admin/coord).
--
-- Papéis com acesso: admin, coordenacao, suporte, suporte_aluno.
-- Usa os helpers canônicos sou_admin()/minha_role() (SECURITY DEFINER, sem
-- recursão de RLS — ver 20260630_fix_minha_role_recursion.sql).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Telefone no cadastro do professor ──────────────────────────────────────

ALTER TABLE professores ADD COLUMN IF NOT EXISTS telefone TEXT;

COMMENT ON COLUMN professores.telefone IS
  'Telefone/WhatsApp do professor. Não vem da API do KMS — preenchido manualmente (ex.: no acompanhamento de onboarding).';


-- ── 2. Tabela de acompanhamento ───────────────────────────────────────────────
-- dias: 7 posições (Dia 1..Dia 7). Cada posição: 0 = vazio, 1 = agendado,
-- 2 = enviado. Uma linha por professor (UNIQUE) — o acompanhamento é único.

CREATE TABLE IF NOT EXISTS onboarding_professores (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id UUID        NOT NULL UNIQUE REFERENCES professores(id) ON DELETE CASCADE,
  data_inicio  DATE,
  dias         SMALLINT[]  NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0]
               CHECK (array_length(dias, 1) = 7),
  observacao   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  onboarding_professores      IS
  'Acompanhamento de 7 dias das mensagens de boas-vindas a professores recém-contratados.';
COMMENT ON COLUMN onboarding_professores.dias IS
  '7 posições (Dia 1..Dia 7). 0 = vazio, 1 = agendado, 2 = enviado.';

CREATE INDEX IF NOT EXISTS idx_onboarding_data_inicio ON onboarding_professores (data_inicio);

-- updated_at automático em cada UPDATE.
CREATE OR REPLACE FUNCTION touch_onboarding_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_onboarding_touch ON onboarding_professores;
CREATE TRIGGER trg_onboarding_touch
  BEFORE UPDATE ON onboarding_professores
  FOR EACH ROW EXECUTE FUNCTION touch_onboarding_updated_at();


-- ── 3. RLS: suporte + coordenação + admin leem e escrevem ─────────────────────

ALTER TABLE onboarding_professores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_select" ON onboarding_professores;
CREATE POLICY "onboarding_select" ON onboarding_professores FOR SELECT TO authenticated
  USING (
    sou_admin()
    OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
  );

DROP POLICY IF EXISTS "onboarding_write" ON onboarding_professores;
CREATE POLICY "onboarding_write" ON onboarding_professores FOR ALL TO authenticated
  USING (
    sou_admin()
    OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
  )
  WITH CHECK (
    sou_admin()
    OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
  );


-- ── 4. Semeadura idempotente da lista de acompanhamento ───────────────────────
-- Traz professores não-desligados cujo primeiro dia caiu nos últimos 10 dias OU
-- está agendado para os próximos 14 dias — e que ainda não estão na lista.
-- Idempotente: pode ser chamada a cada abertura da tela sem duplicar.

CREATE OR REPLACE FUNCTION gerar_onboarding_professores()
RETURNS VOID AS $$
BEGIN
  IF NOT (
    sou_admin()
    OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerar o acompanhamento de onboarding.';
  END IF;

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


-- ── 5. Gravar telefone do professor (suporte também pode) ─────────────────────
-- A escrita geral de professores é restrita a admin/coordenacao. O suporte
-- precisa só gravar o telefone no acompanhamento — este RPC abre exatamente
-- esse buraco, sem soltar o resto da tabela.

CREATE OR REPLACE FUNCTION definir_telefone_professor(p_professor_id UUID, p_telefone TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT (
    sou_admin()
    OR minha_role() = ANY (ARRAY['coordenacao', 'suporte', 'suporte_aluno']::role_usuario[])
  ) THEN
    RAISE EXCEPTION 'Sem permissão para editar o telefone do professor.';
  END IF;

  UPDATE professores
     SET telefone = NULLIF(btrim(p_telefone), '')
   WHERE id = p_professor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION definir_telefone_professor(uuid, text) TO authenticated;
