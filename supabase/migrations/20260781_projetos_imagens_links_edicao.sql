-- ─────────────────────────────────────────────────────────────────────────────
-- Projetos: imagens por parte da ficha, área de links e liberação de edição.
--
-- O que a primeira ficha real mostrou (2026-09-08): 8 etapas, todos os campos
-- de texto preenchidos e **zero anexos**. O anexo só aceitava PDF, e o material
-- que a pessoa tem na mão é print com seta e link de protótipo/Drive — não um
-- PDF montado. Daí as três mudanças aqui:
--
--   1. Anexo ganha `secao`: a imagem gruda NA PARTE da ficha que ela explica
--      (o caminho, a descrição, as etapas…), em vez de virar um monte solto no
--      fim. É o que faz a ficha ser LIDA junto com a evidência.
--   2. `projeto_links`: protótipo externo, pasta do Drive, planilha. Link é
--      diferente de arquivo — muda sozinho, não tem dono aqui e não deve ser
--      baixado; misturar os dois numa lista só esconde os dois.
--   3. `edicao_liberada`: depois de APROVADO o texto congela (a aprovação
--      precisa valer para algo), mas a liderança pode destravar quando o
--      projeto precisa mesmo ser corrigido. Antes disso não havia saída:
--      aprovou, congelou para sempre.
--
-- Editar DEPOIS DE ENVIADO e antes da decisão já funcionava (o congelamento só
-- começa fora de rascunho/proposto) — nada a fazer nesta parte.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Imagens/PDFs por parte da ficha ───────────────────────────────────────

-- NB: `projeto_anexos.caminho` é o caminho DO ARQUIVO no bucket; `secao` com o
-- valor 'caminho' se refere ao campo `projetos.caminho` (a trilha até o
-- problema). Nomes parecidos, coisas diferentes.
ALTER TABLE projeto_anexos
  ADD COLUMN IF NOT EXISTS secao TEXT NOT NULL DEFAULT 'geral',
  -- Guardado no INSERT pra tela saber se renderiza <img> ou cartão de arquivo
  -- sem ter que adivinhar pela extensão.
  ADD COLUMN IF NOT EXISTS mime  TEXT;

ALTER TABLE projeto_anexos DROP CONSTRAINT IF EXISTS projeto_anexos_secao_check;
ALTER TABLE projeto_anexos ADD  CONSTRAINT projeto_anexos_secao_check
  CHECK (secao IN (
    'caminho', 'objetivo', 'descricao', 'diferenca_hoje',
    'etapas', 'passo_a_passo', 'resultado_esperado', 'geral'
  ));

CREATE INDEX IF NOT EXISTS idx_projeto_anexos_secao ON projeto_anexos (projeto_id, secao);

COMMENT ON COLUMN projeto_anexos.secao IS
  'Parte da ficha que este arquivo ilustra. geral = anexo do projeto como um todo.';

-- O bucket só aceitava PDF; imagem é o formato que a pessoa realmente tem.
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'
       ]
 WHERE id = 'projetos';

-- ── 2. Links externos ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projeto_links (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id UUID        NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  titulo     TEXT        NOT NULL,
  url        TEXT        NOT NULL,
  autor_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Só http(s): sem isso um `javascript:` colado vira link clicável na tela.
  CONSTRAINT projeto_links_url_check CHECK (url ~* '^https?://')
);

COMMENT ON TABLE projeto_links IS
  'Protótipo externo, pasta do Drive, planilha — onde o projeto pode ser visto por inteiro.';

CREATE INDEX IF NOT EXISTS idx_projeto_links ON projeto_links (projeto_id, created_at);

ALTER TABLE projeto_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projeto_links_select" ON projeto_links;
CREATE POLICY "projeto_links_select" ON projeto_links FOR SELECT TO authenticated
  USING (pode_ver_projeto(projeto_id));

DROP POLICY IF EXISTS "projeto_links_write" ON projeto_links;
CREATE POLICY "projeto_links_write" ON projeto_links FOR ALL TO authenticated
  USING      (pode_editar_projeto(projeto_id))
  WITH CHECK (pode_editar_projeto(projeto_id));

-- ── 3. Liberação de edição pela liderança ────────────────────────────────────

ALTER TABLE projetos
  ADD COLUMN IF NOT EXISTS edicao_liberada     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edicao_liberada_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edicao_liberada_em  TIMESTAMPTZ;

COMMENT ON COLUMN projetos.edicao_liberada IS
  'Liderança destravou a ficha de um projeto já decidido. Só líder/admin altera.';

CREATE OR REPLACE FUNCTION projetos_biu() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_lider  BOOLEAN := sou_lider() OR sou_admin();
  v_faltas TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.criado_por := COALESCE(NEW.criado_por, auth.uid());
    -- Nasce rascunho SEMPRE: etapas e anexos só podem existir depois do id, e
    -- sem eles a ficha nunca passaria na régua de envio.
    NEW.status          := 'rascunho';
    NEW.fase            := 'planejamento';
    NEW.decidido_por    := NULL;
    NEW.decidido_em     := NULL;
    NEW.concluido_em    := NULL;
    NEW.edicao_liberada := false;
    RETURN NEW;
  END IF;

  NEW.updated_at := NOW();

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'rascunho' AND NEW.status = 'proposto' THEN
      -- Envio para a liderança. Não é decisão: não grava decidido_por.
      IF NOT (v_lider OR OLD.criado_por = auth.uid()) THEN
        RAISE EXCEPTION 'Só quem escreveu o rascunho pode enviá-lo.';
      END IF;
      v_faltas := projeto_pendencias_ficha(NEW);
      IF array_length(v_faltas, 1) > 0 THEN
        RAISE EXCEPTION 'A ficha ainda está incompleta. Falta: %', array_to_string(v_faltas, '; ');
      END IF;
    ELSIF NEW.status = 'rascunho' THEN
      RAISE EXCEPTION 'Um projeto já enviado não volta a ser rascunho.';
    ELSE
      IF NOT v_lider THEN
        RAISE EXCEPTION 'Apenas a liderança pode aprovar, recusar ou cancelar um projeto.';
      END IF;
      NEW.decidido_por := auth.uid();
      NEW.decidido_em  := NOW();
    END IF;
  END IF;

  -- Destravar/travar a ficha é ato de liderança, e fica registrado.
  IF NEW.edicao_liberada IS DISTINCT FROM OLD.edicao_liberada THEN
    IF NOT v_lider THEN
      RAISE EXCEPTION 'Só a liderança libera a edição de um projeto já decidido.';
    END IF;
    NEW.edicao_liberada_por := CASE WHEN NEW.edicao_liberada THEN auth.uid() ELSE NULL END;
    NEW.edicao_liberada_em  := CASE WHEN NEW.edicao_liberada THEN NOW()      ELSE NULL END;
  END IF;

  IF NEW.fase IS DISTINCT FROM OLD.fase THEN
    IF NOT (v_lider OR OLD.responsavel_id = auth.uid()) THEN
      RAISE EXCEPTION 'Só a liderança ou o responsável pelo projeto muda a fase.';
    END IF;
    IF NEW.status <> 'aprovado' THEN
      RAISE EXCEPTION 'O projeto precisa estar aprovado para andar de fase.';
    END IF;
    NEW.concluido_em := CASE WHEN NEW.fase = 'concluido' THEN NOW() ELSE NULL END;
  END IF;

  IF (NEW.data_entrega, NEW.responsavel_id) IS DISTINCT FROM (OLD.data_entrega, OLD.responsavel_id)
     AND NOT (v_lider OR OLD.responsavel_id = auth.uid()) THEN
    RAISE EXCEPTION 'Só a liderança ou o responsável define prazo e responsável.';
  END IF;

  -- O texto da ficha congela quando o projeto é decidido — senão o "aprovado"
  -- da liderança passaria a valer para outra coisa. Enquanto é rascunho ou
  -- proposta, o autor corrige à vontade (inclusive respondendo a um pedido de
  -- informação); depois, só com a edição liberada por um líder.
  IF NOT v_lider
     AND OLD.status NOT IN ('rascunho','proposto')
     AND NOT OLD.edicao_liberada
     AND (NEW.titulo, NEW.descricao, NEW.tipo, NEW.prioridade, NEW.onde_aplicado,
          NEW.caminho, NEW.objetivo, NEW.natureza, NEW.diferenca_hoje,
          NEW.passo_a_passo, NEW.resultado_esperado)
         IS DISTINCT FROM
         (OLD.titulo, OLD.descricao, OLD.tipo, OLD.prioridade, OLD.onde_aplicado,
          OLD.caminho, OLD.objetivo, OLD.natureza, OLD.diferenca_hoje,
          OLD.passo_a_passo, OLD.resultado_esperado) THEN
    RAISE EXCEPTION 'Projeto já avaliado: peça a um líder para liberar a edição.';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_projetos_biu ON projetos;
CREATE TRIGGER trg_projetos_biu BEFORE INSERT OR UPDATE ON projetos
  FOR EACH ROW EXECUTE FUNCTION projetos_biu();

-- Etapas, imagens e links seguem a mesma trava: fazem parte da ficha.
CREATE OR REPLACE FUNCTION pode_editar_projeto(p_projeto_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT sou_admin() OR sou_lider() OR EXISTS (
    SELECT 1 FROM projetos p
     WHERE p.id = p_projeto_id
       AND (p.criado_por = auth.uid() OR p.responsavel_id = auth.uid())
       AND (p.status IN ('rascunho','proposto') OR p.edicao_liberada
            OR p.responsavel_id = auth.uid())
  )
$$;

-- O autor precisa saber que destravou — senão a liberação morre sem uso.
CREATE OR REPLACE FUNCTION notificar_projeto_edicao_liberada() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (NEW.edicao_liberada AND NOT OLD.edicao_liberada) THEN RETURN NEW; END IF;
  IF NEW.criado_por IS NULL OR NEW.criado_por = auth.uid() THEN RETURN NEW; END IF;

  INSERT INTO notificacoes (user_id, tipo, titulo, corpo, link)
  VALUES (NEW.criado_por, 'projeto_edicao_liberada',
          'Edição liberada: ' || NEW.titulo,
          'A liderança destravou a ficha para você ajustar.',
          '/projetos/' || NEW.id);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notificar_projeto_edicao_liberada: %', SQLERRM;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notificar_projeto_edicao_liberada ON projetos;
CREATE TRIGGER trg_notificar_projeto_edicao_liberada AFTER UPDATE ON projetos
  FOR EACH ROW EXECUTE FUNCTION notificar_projeto_edicao_liberada();
