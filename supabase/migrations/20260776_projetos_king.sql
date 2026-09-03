-- ─────────────────────────────────────────────────────────────────────────────
-- Projetos da King — controle interno de iniciativas (melhoria de sistema, de
-- processo, etc.) desde a SUGESTÃO até a entrega.
--
-- Fluxo:
--   1. Coordenação / Suporte sugere      → status 'proposto'
--   2. Liderança aprova ou recusa        → 'aprovado' | 'recusado'
--   3. Projeto aprovado anda por FASES   → planejamento → em_andamento → validacao → concluido
--
-- Além disso a liderança pode PEDIR MAIS INFORMAÇÕES sobre uma proposta: o
-- pedido cai na Minha Área de quem sugeriu (aba Projetos), que responde ali.
--
-- Convenções deste repo:
--   • status/fase são TEXT + CHECK, e não ENUM — enum novo exigiria DUAS
--     migrations pra poder usar o valor.
--   • Todo aviso é best-effort: erro de notificação nunca aborta a escrita.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Projetos ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projetos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo         TEXT        NOT NULL,
  -- O que é / que problema resolve.
  descricao      TEXT        NOT NULL,
  tipo           TEXT        NOT NULL DEFAULT 'sistema'
                             CHECK (tipo IN ('sistema','processo','pessoas','outro')),
  -- Ganho esperado, em texto livre ("economiza X horas", "some com a planilha Y").
  impacto        TEXT,
  prioridade     TEXT        NOT NULL DEFAULT 'media'
                             CHECK (prioridade IN ('baixa','media','alta')),

  status         TEXT        NOT NULL DEFAULT 'proposto'
                             CHECK (status IN ('proposto','aprovado','recusado','cancelado')),
  -- Só faz sentido depois de aprovado; fica em 'planejamento' até alguém mover.
  fase           TEXT        NOT NULL DEFAULT 'planejamento'
                             CHECK (fase IN ('planejamento','em_andamento','validacao','concluido')),

  -- Entrega prevista. Quem aprova costuma definir; editável depois.
  data_entrega   DATE,
  responsavel_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,

  criado_por     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  decidido_por   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  decidido_em    TIMESTAMPTZ,
  -- Por que aprovou/recusou — o autor vê isso na Minha Área.
  motivo_decisao TEXT,

  concluido_em   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE projetos IS
  'Projetos da King: sugestões internas, aprovação da liderança, fase e prazo de entrega.';

CREATE INDEX IF NOT EXISTS idx_projetos_status      ON projetos (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projetos_criado_por  ON projetos (criado_por, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projetos_responsavel ON projetos (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_projetos_entrega     ON projetos (data_entrega)
  WHERE status = 'aprovado' AND fase <> 'concluido';

-- ── Pedidos de informação ────────────────────────────────────────────────────
-- A liderança pergunta, o autor (ou o responsável) responde. Uma linha = uma
-- pergunta com a sua resposta — sem thread, de propósito: é ida e volta curto.

CREATE TABLE IF NOT EXISTS projeto_pedidos_info (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id      UUID        NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  pergunta        TEXT        NOT NULL,
  solicitado_por  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  -- Quem precisa responder. Default = quem sugeriu o projeto (preenchido no trigger).
  destinatario_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  resposta        TEXT,
  respondido_por  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  respondido_em   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE projeto_pedidos_info IS
  'Perguntas da liderança sobre um projeto. Aparecem na Minha Área do destinatário até serem respondidas.';

CREATE INDEX IF NOT EXISTS idx_pedidos_info_projeto ON projeto_pedidos_info (projeto_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pedidos_info_aberto
  ON projeto_pedidos_info (destinatario_id, created_at DESC) WHERE resposta IS NULL;

-- ── Atualizações de andamento ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projeto_atualizacoes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id UUID        NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  texto      TEXT        NOT NULL,
  autor_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE projeto_atualizacoes IS
  'Diário do projeto: o que andou, escrito por quem toca. Só insere e lê.';

CREATE INDEX IF NOT EXISTS idx_projeto_atualizacoes ON projeto_atualizacoes (projeto_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Leitura liberada a qualquer logado (a visibilidade da PÁGINA é controlada em
-- pagePermissions); escrita restrita a quem toca professores + admin.

ALTER TABLE projetos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_pedidos_info  ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_atualizacoes  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION pode_escrever_projeto() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sou_admin() OR COALESCE(
    (SELECT role = ANY (ARRAY['coordenacao','suporte']::role_usuario[]) FROM profiles WHERE id = auth.uid()),
    false)
$$;
GRANT EXECUTE ON FUNCTION pode_escrever_projeto() TO authenticated;

DROP POLICY IF EXISTS "projetos_select" ON projetos;
CREATE POLICY "projetos_select" ON projetos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "projetos_insert" ON projetos;
CREATE POLICY "projetos_insert" ON projetos FOR INSERT TO authenticated
  WITH CHECK (pode_escrever_projeto());

-- Quem edita: liderança/admin (qualquer projeto), o autor e o responsável (o
-- trigger abaixo é que decide O QUE cada um pode mudar).
DROP POLICY IF EXISTS "projetos_update" ON projetos;
CREATE POLICY "projetos_update" ON projetos FOR UPDATE TO authenticated
  USING      (sou_admin() OR sou_lider() OR criado_por = auth.uid() OR responsavel_id = auth.uid())
  WITH CHECK (sou_admin() OR sou_lider() OR criado_por = auth.uid() OR responsavel_id = auth.uid());

-- Apagar só a liderança/admin, ou o autor enquanto ninguém avaliou.
DROP POLICY IF EXISTS "projetos_delete" ON projetos;
CREATE POLICY "projetos_delete" ON projetos FOR DELETE TO authenticated
  USING (sou_admin() OR sou_lider() OR (criado_por = auth.uid() AND status = 'proposto'));

DROP POLICY IF EXISTS "pedidos_info_select" ON projeto_pedidos_info;
CREATE POLICY "pedidos_info_select" ON projeto_pedidos_info FOR SELECT TO authenticated USING (true);

-- Perguntar é papel de quem avalia.
DROP POLICY IF EXISTS "pedidos_info_insert" ON projeto_pedidos_info;
CREATE POLICY "pedidos_info_insert" ON projeto_pedidos_info FOR INSERT TO authenticated
  WITH CHECK (sou_admin() OR sou_lider());

-- Responder: o destinatário (ou liderança, que também corrige a pergunta).
DROP POLICY IF EXISTS "pedidos_info_update" ON projeto_pedidos_info;
CREATE POLICY "pedidos_info_update" ON projeto_pedidos_info FOR UPDATE TO authenticated
  USING      (sou_admin() OR sou_lider() OR destinatario_id = auth.uid())
  WITH CHECK (sou_admin() OR sou_lider() OR destinatario_id = auth.uid());

DROP POLICY IF EXISTS "pedidos_info_delete" ON projeto_pedidos_info;
CREATE POLICY "pedidos_info_delete" ON projeto_pedidos_info FOR DELETE TO authenticated
  USING (sou_admin() OR solicitado_por = auth.uid());

DROP POLICY IF EXISTS "projeto_atualizacoes_select" ON projeto_atualizacoes;
CREATE POLICY "projeto_atualizacoes_select" ON projeto_atualizacoes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "projeto_atualizacoes_insert" ON projeto_atualizacoes;
CREATE POLICY "projeto_atualizacoes_insert" ON projeto_atualizacoes FOR INSERT TO authenticated
  WITH CHECK (pode_escrever_projeto() AND autor_id = auth.uid());

DROP POLICY IF EXISTS "projeto_atualizacoes_delete" ON projeto_atualizacoes;
CREATE POLICY "projeto_atualizacoes_delete" ON projeto_atualizacoes FOR DELETE TO authenticated
  USING (sou_admin() OR autor_id = auth.uid());

-- ── Regras de escrita (o que cada um pode mudar) ─────────────────────────────
-- A RLS diz QUEM pode dar UPDATE; aqui decidimos QUAIS COLUNAS. Aprovar/recusar
-- é exclusivo da liderança; a fase é da liderança ou do responsável; o texto da
-- proposta congela assim que ela é avaliada.

CREATE OR REPLACE FUNCTION projetos_biu() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_lider BOOLEAN := sou_lider() OR sou_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.criado_por := COALESCE(NEW.criado_por, auth.uid());
    -- Proposta nasce sempre como proposta, venha o que vier do cliente.
    NEW.status       := 'proposto';
    NEW.fase         := 'planejamento';
    NEW.decidido_por := NULL;
    NEW.decidido_em  := NULL;
    NEW.concluido_em := NULL;
    RETURN NEW;
  END IF;

  NEW.updated_at := NOW();

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT v_lider THEN
      RAISE EXCEPTION 'Apenas a liderança pode aprovar, recusar ou cancelar um projeto.';
    END IF;
    NEW.decidido_por := auth.uid();
    NEW.decidido_em  := NOW();
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

  -- Prazo e responsável são decisão de quem conduz.
  IF (NEW.data_entrega, NEW.responsavel_id) IS DISTINCT FROM (OLD.data_entrega, OLD.responsavel_id)
     AND NOT (v_lider OR OLD.responsavel_id = auth.uid()) THEN
    RAISE EXCEPTION 'Só a liderança ou o responsável define prazo e responsável.';
  END IF;

  -- O texto da proposta congela depois de avaliada (senão o "aprovado" da
  -- liderança passaria a valer para outra coisa).
  IF NOT v_lider AND OLD.status <> 'proposto'
     AND (NEW.titulo, NEW.descricao, NEW.tipo, NEW.impacto, NEW.prioridade)
         IS DISTINCT FROM (OLD.titulo, OLD.descricao, OLD.tipo, OLD.impacto, OLD.prioridade) THEN
    RAISE EXCEPTION 'Projeto já avaliado: fale com a liderança para alterar a proposta.';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_projetos_biu ON projetos;
CREATE TRIGGER trg_projetos_biu BEFORE INSERT OR UPDATE ON projetos
  FOR EACH ROW EXECUTE FUNCTION projetos_biu();

CREATE OR REPLACE FUNCTION projeto_pedidos_info_biu() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.solicitado_por := COALESCE(NEW.solicitado_por, auth.uid());
    IF NEW.destinatario_id IS NULL THEN
      SELECT COALESCE(responsavel_id, criado_por) INTO NEW.destinatario_id
        FROM projetos WHERE id = NEW.projeto_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.resposta IS DISTINCT FROM OLD.resposta AND NEW.resposta IS NOT NULL THEN
    NEW.respondido_por := auth.uid();
    NEW.respondido_em  := NOW();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_projeto_pedidos_info_biu ON projeto_pedidos_info;
CREATE TRIGGER trg_projeto_pedidos_info_biu BEFORE INSERT OR UPDATE ON projeto_pedidos_info
  FOR EACH ROW EXECUTE FUNCTION projeto_pedidos_info_biu();

-- ── Avisos no sino ───────────────────────────────────────────────────────────
-- Todos best-effort: um erro aqui não pode derrubar a criação do projeto.

-- Nova sugestão → liderança + admins.
CREATE OR REPLACE FUNCTION notificar_projeto_novo() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notificacoes (user_id, tipo, titulo, corpo, link)
  SELECT p.id, 'projeto_novo',
         'Nova sugestão de projeto: ' || NEW.titulo,
         left(NEW.descricao, 160), '/projetos'
    FROM profiles p
   WHERE p.ativo
     AND (p.is_lider OR p.is_admin OR p.role = 'admin')
     AND p.id IS DISTINCT FROM NEW.criado_por;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notificar_projeto_novo: %', SQLERRM;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notificar_projeto_novo ON projetos;
CREATE TRIGGER trg_notificar_projeto_novo AFTER INSERT ON projetos
  FOR EACH ROW EXECUTE FUNCTION notificar_projeto_novo();

-- Decisão da liderança → autor (e responsável, se houver).
CREATE OR REPLACE FUNCTION notificar_projeto_decidido() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_label TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  v_label := CASE NEW.status
    WHEN 'aprovado'  THEN 'Projeto aprovado: '
    WHEN 'recusado'  THEN 'Projeto recusado: '
    WHEN 'cancelado' THEN 'Projeto cancelado: '
    ELSE 'Projeto reaberto: '
  END;

  INSERT INTO notificacoes (user_id, tipo, titulo, corpo, link)
  SELECT DISTINCT alvo, 'projeto_decidido', v_label || NEW.titulo,
         NEW.motivo_decisao, '/minha-area?aba=projetos'
    FROM unnest(ARRAY[NEW.criado_por, NEW.responsavel_id]) AS alvo
   WHERE alvo IS NOT NULL AND alvo IS DISTINCT FROM auth.uid();
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notificar_projeto_decidido: %', SQLERRM;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notificar_projeto_decidido ON projetos;
CREATE TRIGGER trg_notificar_projeto_decidido AFTER UPDATE ON projetos
  FOR EACH ROW EXECUTE FUNCTION notificar_projeto_decidido();

-- Pedido de informação → destinatário (é o que faz o pedido "cair na Minha Área").
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
DROP TRIGGER IF EXISTS trg_notificar_projeto_info_pedido ON projeto_pedidos_info;
CREATE TRIGGER trg_notificar_projeto_info_pedido AFTER INSERT ON projeto_pedidos_info
  FOR EACH ROW EXECUTE FUNCTION notificar_projeto_info_pedido();

-- Resposta → quem perguntou.
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
          left(NEW.resposta, 160), '/projetos');
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notificar_projeto_info_respondido: %', SQLERRM;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notificar_projeto_info_respondido ON projeto_pedidos_info;
CREATE TRIGGER trg_notificar_projeto_info_respondido AFTER UPDATE ON projeto_pedidos_info
  FOR EACH ROW EXECUTE FUNCTION notificar_projeto_info_respondido();
