-- ─────────────────────────────────────────────────────────────────────────────
-- Projetos: o bloco "As regras".
--
-- A primeira ficha real (Sistema de pastas de materiais, 08/09) foi lida como
-- um dev de TI leria. Descrição, caminho e etapas estavam bons; o que impedia
-- alguém de começar a codar eram REGRAS, não descrição. As seis lacunas:
--
--   1. De quem é a coisa — a pasta é global ou de cada professor? Muda o
--      modelo de dados inteiro, e a ficha não dizia.
--   2. Quem pode desfazer — a etapa 6 trancava a pasta, a 7 apagava a pasta.
--      Contradição direta que ninguém tinha notado.
--   3. O que acontece quando dá errado — a "pasta temporária" apareceu dentro
--      de uma etapa, sem dono, sem prazo e sem quem esvazia.
--   4. O que fazemos com o acervo que já existe — milhares de materiais sem
--      pasta; alguém organiza à mão, e isso é trabalho de gente.
--   5. Quem constrói — o KMS é a plataforma do King, não é nosso repositório.
--      Um clique que redireciona o projeto inteiro.
--   6. Como saberemos que deu certo — "melhor organização" não é verificável.
--
-- Essas perguntas são feitas de qualquer jeito. Se não estiverem no formulário,
-- viram "pedir mais informações" e custam dias de ida e volta — por isso entram
-- na régua, respondidas no dia em que o assunto está fresco.
--
-- Consequência esperada: projetos já enviados passam a aparecer como ficha
-- incompleta. É honesto — é exatamente o que falta neles. A validação só roda
-- no ENVIO, então nenhum projeto existente quebra.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE projetos
  -- 1. Escopo e visibilidade.
  ADD COLUMN IF NOT EXISTS quem_usa         TEXT,
  -- 2. Permissões e reversibilidade.
  ADD COLUMN IF NOT EXISTS permissoes       TEXT,
  -- 3. O caminho infeliz.
  ADD COLUMN IF NOT EXISTS quando_da_errado TEXT,
  -- 4. Acervo/dado que já existe no dia da virada.
  ADD COLUMN IF NOT EXISTS dado_existente   TEXT,
  -- 5. Quem executa. Select, não texto: a resposta muda o dono do projeto.
  ADD COLUMN IF NOT EXISTS quem_constroi    TEXT,
  -- 6. Critério de aceite verificável.
  ADD COLUMN IF NOT EXISTS criterio_aceite  TEXT,
  -- Opcionais.
  ADD COLUMN IF NOT EXISTS fora_de_escopo   TEXT,
  ADD COLUMN IF NOT EXISTS volume_esperado  TEXT;

ALTER TABLE projetos DROP CONSTRAINT IF EXISTS projetos_quem_constroi_check;
ALTER TABLE projetos ADD  CONSTRAINT projetos_quem_constroi_check
  CHECK (quem_constroi IS NULL OR quem_constroi IN ('ti_king','nosso_time','externo','nao_sei'));

COMMENT ON COLUMN projetos.quem_usa IS
  'Quem mexe e quem só enxerga. Decide o modelo de dados antes de qualquer outra coisa.';
COMMENT ON COLUMN projetos.permissoes IS
  'O que dá para desfazer e quem pode — especialmente nas etapas que apagam ou bloqueiam.';
COMMENT ON COLUMN projetos.quando_da_errado IS
  'Caminho infeliz: erro do usuário, duas pessoas ao mesmo tempo, dado faltando.';
COMMENT ON COLUMN projetos.dado_existente IS
  'O que acontece com o que já está lá no dia em que isso entrar no ar.';
COMMENT ON COLUMN projetos.quem_constroi IS
  'ti_king = plataforma do King (KMS/aluno), fora do nosso repositório; nosso_time = esta plataforma, extensão e portais.';
COMMENT ON COLUMN projetos.criterio_aceite IS
  'Frase verificável daqui a um mês. "Melhor organização" não serve.';

-- ── A régua, agora com as regras ─────────────────────────────────────────────

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

  SELECT count(*) INTO v_etapas FROM projeto_etapas WHERE projeto_id = p.id;
  IF v_etapas < 2 THEN
    v_faltas := array_append(v_faltas, 'Pelo menos duas etapas (é o que vira o fluxograma)');
  END IF;

  IF length(COALESCE(trim(p.passo_a_passo), '')) < 20 THEN
    v_faltas := array_append(v_faltas, 'O passo a passo para funcionar');
  END IF;

  -- ── As regras ──
  IF length(COALESCE(trim(p.quem_usa), '')) < 15 THEN
    v_faltas := array_append(v_faltas, 'Quem usa e o que cada um enxerga');
  END IF;
  IF length(COALESCE(trim(p.permissoes), '')) < 15 THEN
    v_faltas := array_append(v_faltas, 'O que dá para desfazer e quem pode');
  END IF;
  IF length(COALESCE(trim(p.quando_da_errado), '')) < 15 THEN
    v_faltas := array_append(v_faltas, 'O que acontece quando dá errado');
  END IF;
  IF length(COALESCE(trim(p.dado_existente), '')) < 10 THEN
    v_faltas := array_append(v_faltas, 'O que acontece com o que já existe hoje');
  END IF;
  IF p.quem_constroi IS NULL THEN
    v_faltas := array_append(v_faltas, 'Quem constrói');
  END IF;
  IF length(COALESCE(trim(p.criterio_aceite), '')) < 15 THEN
    v_faltas := array_append(v_faltas, 'Como saberemos que deu certo');
  END IF;

  IF length(COALESCE(trim(p.resultado_esperado), '')) < 15 THEN
    v_faltas := array_append(v_faltas, 'O resultado esperado');
  END IF;

  RETURN v_faltas;
END; $$;
GRANT EXECUTE ON FUNCTION projeto_pendencias_ficha(projetos) TO authenticated;

-- ── O congelamento passa a cobrir os campos novos ────────────────────────────
-- Sem isso, o texto da ficha ficaria travado depois da aprovação mas as regras
-- continuariam editáveis — e regra é a parte que mais muda o que será feito.

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

  IF NOT v_lider
     AND OLD.status NOT IN ('rascunho','proposto')
     AND NOT OLD.edicao_liberada
     AND (NEW.titulo, NEW.descricao, NEW.tipo, NEW.prioridade, NEW.onde_aplicado,
          NEW.caminho, NEW.objetivo, NEW.natureza, NEW.diferenca_hoje,
          NEW.passo_a_passo, NEW.resultado_esperado,
          NEW.quem_usa, NEW.permissoes, NEW.quando_da_errado, NEW.dado_existente,
          NEW.quem_constroi, NEW.criterio_aceite, NEW.fora_de_escopo, NEW.volume_esperado)
         IS DISTINCT FROM
         (OLD.titulo, OLD.descricao, OLD.tipo, OLD.prioridade, OLD.onde_aplicado,
          OLD.caminho, OLD.objetivo, OLD.natureza, OLD.diferenca_hoje,
          OLD.passo_a_passo, OLD.resultado_esperado,
          OLD.quem_usa, OLD.permissoes, OLD.quando_da_errado, OLD.dado_existente,
          OLD.quem_constroi, OLD.criterio_aceite, OLD.fora_de_escopo, OLD.volume_esperado) THEN
    RAISE EXCEPTION 'Projeto já avaliado: peça a um líder para liberar a edição.';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_projetos_biu ON projetos;
CREATE TRIGGER trg_projetos_biu BEFORE INSERT OR UPDATE ON projetos
  FOR EACH ROW EXECUTE FUNCTION projetos_biu();
