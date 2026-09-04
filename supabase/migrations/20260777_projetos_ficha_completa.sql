-- ─────────────────────────────────────────────────────────────────────────────
-- Projetos da King — a FICHA COMPLETA exigida pelo TI.
--
-- Orientação do TI (vale acima de qualquer outra regra desta tela): o projeto
-- só está pronto quando alguém de fora consegue executar sem perguntar nada —
-- o caminho até onde o problema aparece, o objetivo, as etapas, o resultado
-- esperado e o passo a passo de uso. Aqui isso deixa de ser recomendação e
-- vira condição de envio: a régua roda no BANCO, não só no botão da tela.
--
-- Consequência de desenho: um projeto NASCE 'rascunho'. Ele precisa existir
-- para receber etapas e anexos (que são tabelas filhas), e só depois é enviado
-- para a liderança — o envio é um UPDATE, e é ele que valida a ficha e avisa
-- quem aprova. Rascunho não aparece para ninguém além do autor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Campos da ficha ──────────────────────────────────────────────────────────

ALTER TABLE projetos
  -- Em que superfície a mudança encosta.
  ADD COLUMN IF NOT EXISTS onde_aplicado      TEXT,
  -- A trilha até onde o problema aparece: "Menu Professores → abre o professor
  -- → aba Reuniões → botão Convocar". É o item que o TI mais sente falta.
  ADD COLUMN IF NOT EXISTS caminho            TEXT,
  -- Uma frase: para que essa melhoria existe.
  ADD COLUMN IF NOT EXISTS objetivo           TEXT,
  -- Melhoria de algo que já existe × coisa que não existe hoje. Decide se
  -- "como é diferente de hoje" é obrigatório.
  ADD COLUMN IF NOT EXISTS natureza           TEXT NOT NULL DEFAULT 'melhoria',
  ADD COLUMN IF NOT EXISTS diferenca_hoje     TEXT,
  -- Como se usa depois de pronto.
  ADD COLUMN IF NOT EXISTS passo_a_passo      TEXT,
  ADD COLUMN IF NOT EXISTS resultado_esperado TEXT;

-- `impacto` era o "ganho esperado" opcional; vira o resultado esperado, que
-- agora é obrigatório. Copia o que houver e sai de cena — a tabela nasceu
-- ontem, não dá para justificar duas colunas dizendo a mesma coisa.
UPDATE projetos
   SET resultado_esperado = COALESCE(resultado_esperado, impacto)
 WHERE impacto IS NOT NULL;
ALTER TABLE projetos DROP COLUMN IF EXISTS impacto;

ALTER TABLE projetos DROP CONSTRAINT IF EXISTS projetos_onde_aplicado_check;
ALTER TABLE projetos ADD  CONSTRAINT projetos_onde_aplicado_check
  CHECK (onde_aplicado IS NULL OR onde_aplicado IN ('plataforma','extensao','portal','processo','outro'));

ALTER TABLE projetos DROP CONSTRAINT IF EXISTS projetos_natureza_check;
ALTER TABLE projetos ADD  CONSTRAINT projetos_natureza_check
  CHECK (natureza IN ('melhoria','novo'));

-- Urgência ganha o nível Crítico, no vocabulário já usado nos incidentes.
ALTER TABLE projetos DROP CONSTRAINT IF EXISTS projetos_prioridade_check;
ALTER TABLE projetos ADD  CONSTRAINT projetos_prioridade_check
  CHECK (prioridade IN ('baixa','media','alta','critica'));

-- Rascunho: a ficha é longa demais para preencher de uma sentada.
ALTER TABLE projetos DROP CONSTRAINT IF EXISTS projetos_status_check;
ALTER TABLE projetos ADD  CONSTRAINT projetos_status_check
  CHECK (status IN ('rascunho','proposto','aprovado','recusado','cancelado'));

ALTER TABLE projetos ALTER COLUMN status SET DEFAULT 'rascunho';

COMMENT ON COLUMN projetos.caminho IS
  'Trilha de navegação até onde o problema aparece — exigência do TI.';
COMMENT ON COLUMN projetos.natureza IS
  'melhoria = mexe em algo que já existe (exige diferenca_hoje); novo = não existe hoje.';

-- ── Etapas: o desenho do funcionamento ───────────────────────────────────────
-- Lista ordenada em vez de parágrafo. O TI pede um fluxograma; quem sugere
-- raramente sabe desenhar um — então a tela desenha a partir daqui, e de
-- quebra a liderança acompanha "4 de 7 etapas".

CREATE TABLE IF NOT EXISTS projeto_etapas (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id   UUID        NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  ordem        INTEGER     NOT NULL DEFAULT 0,
  titulo       TEXT        NOT NULL,
  detalhe      TEXT,
  -- Quem executa o passo (texto livre: "coordenação", "TI", "o professor").
  quem_faz     TEXT,
  concluida    BOOLEAN     NOT NULL DEFAULT false,
  concluida_em TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE projeto_etapas IS
  'Passos do projeto, em ordem. Viram o fluxograma na tela e a barra de progresso.';

CREATE INDEX IF NOT EXISTS idx_projeto_etapas ON projeto_etapas (projeto_id, ordem);

-- ── Anexos: o desenho em PDF ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projeto_anexos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id    UUID        NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  nome          TEXT        NOT NULL,
  -- Caminho dentro do bucket `projetos` (privado — a tela gera URL assinada).
  caminho       TEXT        NOT NULL,
  tamanho_bytes BIGINT,
  autor_id      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE projeto_anexos IS
  'PDFs com o desenho do projeto. Arquivo no bucket privado `projetos`.';

CREATE INDEX IF NOT EXISTS idx_projeto_anexos ON projeto_anexos (projeto_id, created_at);

-- ── Visibilidade do rascunho ─────────────────────────────────────────────────
-- Rascunho é do autor: não entra na fila de aprovação nem na busca dos outros.

CREATE OR REPLACE FUNCTION projeto_visivel(p_status TEXT, p_criado_por UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p_status <> 'rascunho' OR p_criado_por = auth.uid() OR sou_admin()
$$;
GRANT EXECUTE ON FUNCTION projeto_visivel(TEXT, UUID) TO authenticated;

DROP POLICY IF EXISTS "projetos_select" ON projetos;
CREATE POLICY "projetos_select" ON projetos FOR SELECT TO authenticated
  USING (projeto_visivel(status, criado_por));

-- O autor também apaga o próprio rascunho.
DROP POLICY IF EXISTS "projetos_delete" ON projetos;
CREATE POLICY "projetos_delete" ON projetos FOR DELETE TO authenticated
  USING (sou_admin() OR sou_lider() OR (criado_por = auth.uid() AND status IN ('rascunho','proposto')));

-- ── RLS das filhas: espelha o projeto ────────────────────────────────────────
-- Quem enxerga o projeto enxerga as etapas/anexos; quem escreve é a liderança,
-- o autor e o responsável — os mesmos de `projetos_update`.

CREATE OR REPLACE FUNCTION pode_ver_projeto(p_projeto_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM projetos p
     WHERE p.id = p_projeto_id AND projeto_visivel(p.status, p.criado_por)
  )
$$;
GRANT EXECUTE ON FUNCTION pode_ver_projeto(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION pode_editar_projeto(p_projeto_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT sou_admin() OR sou_lider() OR EXISTS (
    SELECT 1 FROM projetos p
     WHERE p.id = p_projeto_id
       AND (p.criado_por = auth.uid() OR p.responsavel_id = auth.uid())
  )
$$;
GRANT EXECUTE ON FUNCTION pode_editar_projeto(UUID) TO authenticated;

ALTER TABLE projeto_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projeto_etapas_select" ON projeto_etapas;
CREATE POLICY "projeto_etapas_select" ON projeto_etapas FOR SELECT TO authenticated
  USING (pode_ver_projeto(projeto_id));

DROP POLICY IF EXISTS "projeto_etapas_write" ON projeto_etapas;
CREATE POLICY "projeto_etapas_write" ON projeto_etapas FOR ALL TO authenticated
  USING      (pode_editar_projeto(projeto_id))
  WITH CHECK (pode_editar_projeto(projeto_id));

DROP POLICY IF EXISTS "projeto_anexos_select" ON projeto_anexos;
CREATE POLICY "projeto_anexos_select" ON projeto_anexos FOR SELECT TO authenticated
  USING (pode_ver_projeto(projeto_id));

DROP POLICY IF EXISTS "projeto_anexos_write" ON projeto_anexos;
CREATE POLICY "projeto_anexos_write" ON projeto_anexos FOR ALL TO authenticated
  USING      (pode_editar_projeto(projeto_id))
  WITH CHECK (pode_editar_projeto(projeto_id));

-- Marca a hora quando a etapa é dada como feita.
CREATE OR REPLACE FUNCTION projeto_etapas_biu() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.concluida IS DISTINCT FROM OLD.concluida THEN
    NEW.concluida_em := CASE WHEN NEW.concluida THEN NOW() ELSE NULL END;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_projeto_etapas_biu ON projeto_etapas;
CREATE TRIGGER trg_projeto_etapas_biu BEFORE INSERT OR UPDATE ON projeto_etapas
  FOR EACH ROW EXECUTE FUNCTION projeto_etapas_biu();

-- ── A régua do TI, em SQL ────────────────────────────────────────────────────
-- Devolve o que falta para a ficha ficar completa. Lista vazia = pode enviar.
-- Mora aqui (e não só na tela) porque é a regra do TI, e regra de negócio que
-- só existe no botão desabilitado some no primeiro atalho.

CREATE OR REPLACE FUNCTION projeto_pendencias_ficha(p projetos) RETURNS TEXT[]
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_faltas TEXT[] := ARRAY[]::TEXT[];
  v_etapas INTEGER;
BEGIN
  IF length(COALESCE(trim(p.titulo), '')) < 4 THEN
    v_faltas := array_append(v_faltas, 'Um título que diga do que se trata');
  END IF;
  IF p.onde_aplicado IS NULL THEN
    v_faltas := array_append(v_faltas, 'Onde será aplicado');
  END IF;
  IF length(COALESCE(trim(p.caminho), '')) < 15 THEN
    v_faltas := array_append(v_faltas, 'O caminho até onde o problema aparece');
  END IF;
  IF length(COALESCE(trim(p.objetivo), '')) < 15 THEN
    v_faltas := array_append(v_faltas, 'O objetivo da melhoria');
  END IF;
  IF length(COALESCE(trim(p.descricao), '')) < 40 THEN
    v_faltas := array_append(v_faltas, 'A descrição clara do projeto');
  END IF;
  IF p.natureza = 'melhoria' AND length(COALESCE(trim(p.diferenca_hoje), '')) < 15 THEN
    v_faltas := array_append(v_faltas, 'Como isso é diferente do que temos hoje');
  END IF;
  IF length(COALESCE(trim(p.passo_a_passo), '')) < 20 THEN
    v_faltas := array_append(v_faltas, 'O passo a passo para funcionar');
  END IF;
  IF length(COALESCE(trim(p.resultado_esperado), '')) < 15 THEN
    v_faltas := array_append(v_faltas, 'O resultado esperado');
  END IF;

  SELECT count(*) INTO v_etapas FROM projeto_etapas WHERE projeto_id = p.id;
  IF v_etapas < 2 THEN
    v_faltas := array_append(v_faltas, 'Pelo menos duas etapas (é o que vira o fluxograma)');
  END IF;

  RETURN v_faltas;
END; $$;
GRANT EXECUTE ON FUNCTION projeto_pendencias_ficha(projetos) TO authenticated;

-- ── Regras de escrita, agora com rascunho e envio ────────────────────────────

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
    NEW.status       := 'rascunho';
    NEW.fase         := 'planejamento';
    NEW.decidido_por := NULL;
    NEW.decidido_em  := NULL;
    NEW.concluido_em := NULL;
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

  -- O texto da ficha congela depois de avaliada. Enquanto é rascunho ou
  -- proposta, o autor corrige à vontade — inclusive respondendo a um pedido
  -- de informação da liderança.
  IF NOT v_lider AND OLD.status NOT IN ('rascunho','proposto')
     AND (NEW.titulo, NEW.descricao, NEW.tipo, NEW.prioridade, NEW.onde_aplicado,
          NEW.caminho, NEW.objetivo, NEW.natureza, NEW.diferenca_hoje,
          NEW.passo_a_passo, NEW.resultado_esperado)
         IS DISTINCT FROM
         (OLD.titulo, OLD.descricao, OLD.tipo, OLD.prioridade, OLD.onde_aplicado,
          OLD.caminho, OLD.objetivo, OLD.natureza, OLD.diferenca_hoje,
          OLD.passo_a_passo, OLD.resultado_esperado) THEN
    RAISE EXCEPTION 'Projeto já avaliado: fale com a liderança para alterar a proposta.';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_projetos_biu ON projetos;
CREATE TRIGGER trg_projetos_biu BEFORE INSERT OR UPDATE ON projetos
  FOR EACH ROW EXECUTE FUNCTION projetos_biu();

-- ── Avisos ───────────────────────────────────────────────────────────────────
-- Quem avisa a liderança agora é o ENVIO, não o INSERT (que virou rascunho).

DROP TRIGGER IF EXISTS trg_notificar_projeto_novo ON projetos;
DROP FUNCTION IF EXISTS notificar_projeto_novo();

CREATE OR REPLACE FUNCTION notificar_projeto_enviado() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (OLD.status = 'rascunho' AND NEW.status = 'proposto') THEN
    RETURN NEW;
  END IF;

  INSERT INTO notificacoes (user_id, tipo, titulo, corpo, link)
  SELECT p.id, 'projeto_novo',
         'Nova sugestão de projeto: ' || NEW.titulo,
         left(COALESCE(NEW.objetivo, NEW.descricao), 160), '/projetos/' || NEW.id
    FROM profiles p
   WHERE p.ativo
     AND (p.is_lider OR p.is_admin OR p.role = 'admin')
     AND p.id IS DISTINCT FROM NEW.criado_por;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notificar_projeto_enviado: %', SQLERRM;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notificar_projeto_enviado ON projetos;
CREATE TRIGGER trg_notificar_projeto_enviado AFTER UPDATE ON projetos
  FOR EACH ROW EXECUTE FUNCTION notificar_projeto_enviado();

-- A decisão continua avisando o autor — menos o envio, que não é decisão.
CREATE OR REPLACE FUNCTION notificar_projeto_decidido() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_label TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF OLD.status = 'rascunho' THEN RETURN NEW; END IF;

  v_label := CASE NEW.status
    WHEN 'aprovado'  THEN 'Projeto aprovado: '
    WHEN 'recusado'  THEN 'Projeto recusado: '
    WHEN 'cancelado' THEN 'Projeto cancelado: '
    ELSE 'Projeto reaberto: '
  END;

  INSERT INTO notificacoes (user_id, tipo, titulo, corpo, link)
  SELECT DISTINCT alvo, 'projeto_decidido', v_label || NEW.titulo,
         NEW.motivo_decisao, '/projetos/' || NEW.id
    FROM unnest(ARRAY[NEW.criado_por, NEW.responsavel_id]) AS alvo
   WHERE alvo IS NOT NULL AND alvo IS DISTINCT FROM auth.uid();
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notificar_projeto_decidido: %', SQLERRM;
    RETURN NEW;
END; $$;

-- O pedido de informação continua caindo na Minha Área de quem responde (é o
-- lugar combinado pra isso); de lá o painel linka para a ficha. Já a RESPOSTA
-- leva quem perguntou direto à página do projeto, que é onde está o contexto.
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
          left(NEW.pergunta, 160), '/minha-area?aba=projetos');
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notificar_projeto_info_pedido: %', SQLERRM;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION notificar_projeto_info_respondido() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_titulo TEXT;
BEGIN
  IF NEW.resposta IS NULL OR NEW.resposta IS NOT DISTINCT FROM OLD.resposta THEN RETURN NEW; END IF;
  IF NEW.solicitado_por IS NULL OR NEW.solicitado_por = auth.uid() THEN RETURN NEW; END IF;
  SELECT titulo INTO v_titulo FROM projetos WHERE id = NEW.projeto_id;

  INSERT INTO notificacoes (user_id, tipo, titulo, corpo, link)
  VALUES (NEW.solicitado_por, 'projeto_info_respondido',
          'Resposta recebida: ' || COALESCE(v_titulo, 'projeto'),
          left(NEW.resposta, 160), '/projetos/' || NEW.projeto_id);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notificar_projeto_info_respondido: %', SQLERRM;
    RETURN NEW;
END; $$;

-- ── Bucket dos anexos ────────────────────────────────────────────────────────
-- Privado, ao contrário do bucket de incidentes: aqui o anexo é o desenho
-- interno de um projeto, e URL assinada custa uma linha a mais na tela.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('projetos', 'projetos', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "projetos_anexo_read" ON storage.objects;
CREATE POLICY "projetos_anexo_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'projetos');

DROP POLICY IF EXISTS "projetos_anexo_write" ON storage.objects;
CREATE POLICY "projetos_anexo_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'projetos');

DROP POLICY IF EXISTS "projetos_anexo_delete" ON storage.objects;
CREATE POLICY "projetos_anexo_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'projetos');
