-- ─────────────────────────────────────────────────────────────────────────────
-- Solicitação de transferência de aluno (2026-08-10).
--
-- Antes: o professor pedia pra tirar um aluno da agenda por WhatsApp. O pedido
-- não ficava em lugar nenhum — quem atendia não sabia há quanto tempo o aluno
-- estava com ele, se aquele aluno já tinha trocado de professor antes, nem se
-- aquele professor já tinha pedido a mesma coisa cinco vezes no mês. Quando a
-- transferência acontecia, o vínculo sumia do roster e o histórico ia junto.
--
-- Agora: o professor abre o pedido por um link público (/transferencia)
-- ESCOLHENDO O ALUNO DA PRÓPRIA CARTEIRA, o pedido entra numa fila que o
-- Suporte ao Aluno processa, e tudo fica registrado no perfil do professor.
--
-- Ciclo de vida (espelha `pausas`, 20260738):
--   pendente --assumir--> em_atendimento --concluir--> concluida
--                     \--recusar--> recusada          (sai da fila)
--
-- ── As duas decisões estruturais ─────────────────────────────────────────────
--
-- 1. SNAPSHOT NA CRIAÇÃO, e não join na hora de ler.
--    `professor_alunos_kms` é DELETE+INSERT a cada rodada do kms-api-sync — não
--    guarda histórico (mesma armadilha documentada em 20260752). No instante em
--    que a transferência é efetivada na plataforma do King, o vínculo SOME do
--    roster. Sem congelar, a fila perderia os dados do aluno no meio do próprio
--    atendimento e o registro histórico viraria uma linha órfã com um id.
--    Por isso o trigger abaixo fotografa o aluno + o professor no INSERT.
--
-- 2. O REGISTRO NO PERFIL NASCE COM O PEDIDO, não com a conclusão.
--    Diferente da pausa (que só vira observação quando ativa), aqui o PEDIDO em
--    si é o sinal: um professor que pede transferência com frequência é o dado
--    que a coordenação quer enxergar, independente de o pedido ter sido aceito.
--    Então o INSERT já cria a observação no perfil, em aberto; concluir/recusar
--    complementa o texto com o desfecho e fecha.
--
-- Segurança: nenhuma escrita direta na tabela — nem INSERT, nem UPDATE. O portal
-- público escreve com a service_role (Edge Function portal-transferencia) e a
-- fila age só pelas funções SECURITY DEFINER abaixo. Mesmo padrão de `pausas`:
-- o Suporte ao Aluno processa a fila sem ganhar UPDATE genérico em `professores`.
--
-- A transferência EM SI continua sendo feita na plataforma do King, à mão, por
-- quem atende — este módulo registra e acompanha o pedido, não move o aluno.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tabela ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transferencias_aluno (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id   UUID        NOT NULL REFERENCES professores(id) ON DELETE CASCADE,

  -- Identificação do aluno. `aluno_id` vem do roster quando o professor escolhe
  -- da lista (caminho normal) e é a chave que liga este pedido ao histórico do
  -- aluno em professor_ciclo_vida_alunos. Fica NULL só no caminho de escape
  -- ("não encontrei meu aluno na lista"), e aí sobra o nome digitado.
  aluno_id       BIGINT,
  aluno_nome     TEXT        NOT NULL,
  aluno_da_lista BOOLEAN     NOT NULL DEFAULT true,

  motivo         TEXT        NOT NULL,   -- categoria (ver MOTIVO_TRANSFERENCIA no front)
  detalhe        TEXT        NOT NULL,   -- texto livre — obrigatório, é o que orienta o atendimento
  urgencia       TEXT        NOT NULL DEFAULT 'normal' CHECK (urgencia IN ('normal', 'alta')),

  -- Dois sinais que mudam a conduta de quem atende, e que só o professor sabe.
  ja_conversou   BOOLEAN,    -- já falou com o aluno? (se não, dá pra tentar mediar)
  aceita_manter  BOOLEAN,    -- manteria o aluno com algum ajuste? (pedido reversível)

  status         TEXT        NOT NULL DEFAULT 'pendente'
                             CHECK (status IN ('pendente', 'em_atendimento', 'concluida', 'recusada')),

  assumido_por   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assumido_em    TIMESTAMPTZ,
  concluido_por  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  concluido_em   TIMESTAMPTZ,
  recusado_por   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  recusado_em    TIMESTAMPTZ,
  motivo_recusa  TEXT,

  -- Desfecho registrado por quem atendeu. `transferido` é o caminho esperado;
  -- os outros existem porque o pedido de transferência com frequência termina
  -- em outra coisa (o aluno some da escola, ou a conversa resolve e ele fica).
  desfecho       TEXT        CHECK (desfecho IN ('transferido', 'mantido', 'saiu_da_escola', 'outro')),
  desfecho_nota  TEXT,
  destino_professor_id UUID REFERENCES professores(id) ON DELETE SET NULL,

  snapshot       JSONB,      -- foto do aluno + do professor no momento do pedido
  observacao_id  UUID REFERENCES observacoes(id) ON DELETE SET NULL,

  origem         TEXT        NOT NULL DEFAULT 'portal',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE transferencias_aluno IS
  'Pedidos de transferência de aluno feitos pelo professor (portal público /transferencia) e seu processamento pelo Suporte ao Aluno. Escrita só via service_role (portal) ou funções SECURITY DEFINER (fila).';
COMMENT ON COLUMN transferencias_aluno.aluno_id      IS 'aluno_id do roster KMS. NULL = professor não achou o aluno na lista e digitou o nome.';
COMMENT ON COLUMN transferencias_aluno.snapshot      IS 'Foto do vínculo aluno↔professor no momento do pedido. Congelado por trigger — o roster é DELETE+INSERT a cada sync e o vínculo some quando a transferência acontece.';
COMMENT ON COLUMN transferencias_aluno.aceita_manter IS 'Professor manteria o aluno com algum ajuste. true = pedido reversível, vale tentar mediar antes de transferir.';
COMMENT ON COLUMN transferencias_aluno.desfecho      IS 'Como o pedido realmente terminou. Nem todo pedido de transferência vira transferência.';
COMMENT ON COLUMN transferencias_aluno.observacao_id IS 'Observação criada no perfil do professor no momento do PEDIDO (não da conclusão) — o pedido em si é o sinal.';

-- Fila de trabalho: não-finalizadas, urgentes e mais antigas primeiro.
CREATE INDEX IF NOT EXISTS idx_transf_fila
  ON transferencias_aluno (created_at) WHERE status IN ('pendente', 'em_atendimento');

CREATE INDEX IF NOT EXISTS idx_transf_professor ON transferencias_aluno (professor_id, created_at DESC);

-- Histórico por aluno: "esse aluno já foi pedido pra transferência antes?"
CREATE INDEX IF NOT EXISTS idx_transf_aluno ON transferencias_aluno (aluno_id) WHERE aluno_id IS NOT NULL;

-- O mesmo professor não abre dois pedidos abertos para o MESMO aluno. Só vale
-- quando temos aluno_id: no caminho de escape (nome digitado) não dá pra ter
-- certeza de que é o mesmo aluno, e barrar por nome geraria falso positivo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transf_um_aberto_por_aluno
  ON transferencias_aluno (professor_id, aluno_id)
  WHERE aluno_id IS NOT NULL AND status IN ('pendente', 'em_atendimento');

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
-- Leitura para qualquer autenticado (mesma abertura de professores/pausas).
-- Sem policy de INSERT/UPDATE/DELETE: escrita só por DEFINER ou service_role.

ALTER TABLE transferencias_aluno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transferencias_select" ON transferencias_aluno;
CREATE POLICY "transferencias_select" ON transferencias_aluno
  FOR SELECT TO authenticated USING (true);

-- ── 3. Helper de cargo ───────────────────────────────────────────────────────

/** Quem trabalha a fila de transferências: Suporte ao Aluno (dono do processo),
 *  coordenação, suporte e admin. Mesma abertura de pode_gerir_pausa(). */
CREATE OR REPLACE FUNCTION pode_gerir_transferencia() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT is_admin OR role IN ('admin', 'coordenacao', 'suporte', 'suporte_aluno')
    FROM profiles WHERE id = auth.uid()
  ), false);
$$;
GRANT EXECUTE ON FUNCTION pode_gerir_transferencia() TO authenticated;

-- ── 4. Normalização de nome (sem depender da extensão unaccent) ──────────────

/** Minúsculas, sem acento, espaços colapsados. IMMUTABLE pra poder ser usada em
 *  índice/comparação. `unaccent` não está garantida neste banco — translate()
 *  cobre o alfabeto português, que é o caso real aqui. */
CREATE OR REPLACE FUNCTION norm_nome(p TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT btrim(regexp_replace(
    translate(lower(p),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'));
$$;

-- ── 5. Snapshot do pedido (trigger BEFORE INSERT) ────────────────────────────

/**
 * Congela o que sabemos do aluno e do professor no instante do pedido.
 *
 * Por que não bastaria um JOIN na hora de exibir: `professor_alunos_kms` é
 * reescrita inteira a cada rodada do sync, e o vínculo desaparece exatamente
 * quando a transferência é efetivada — ou seja, no meio do atendimento. Quem
 * abrisse a fila depois disso veria um pedido sem aluno.
 *
 * Também guardamos a contagem de pedidos anteriores DO PROFESSOR: é o número que
 * responde "isso é um caso isolado ou um padrão?" sem precisar recontar depois.
 */
CREATE OR REPLACE FUNCTION capturar_snapshot_transferencia()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_aluno    professor_alunos_kms%ROWTYPE;
  v_prof     RECORD;
  v_qtd      INTEGER := 0;
  v_pedidos  INTEGER := 0;
  v_saidas   INTEGER := 0;
BEGIN
  IF NEW.aluno_id IS NOT NULL THEN
    SELECT * INTO v_aluno
      FROM professor_alunos_kms
     WHERE professor_id = NEW.professor_id AND aluno_id = NEW.aluno_id;

    -- Quantas vezes ESTE aluno já saiu de algum professor (qualquer um). É o
    -- sinal mais forte do dossiê: aluno que troca muito raramente é problema
    -- do professor atual.
    SELECT count(*) INTO v_saidas
      FROM professor_ciclo_vida_alunos WHERE aluno_id = NEW.aluno_id;
  END IF;

  SELECT p.nome, p.status, p.data_inicio, p.grupo_id,
         g.nome AS grupo_nome, pf.nome AS coordenador_nome,
         a.score_atual, a.score_faixa
    INTO v_prof
    FROM professores p
    LEFT JOIN grupos   g  ON g.id  = p.grupo_id
    LEFT JOIN profiles pf ON pf.id = p.coordenador_id
    LEFT JOIN professor_acompanhamento a ON a.professor_id = p.id
   WHERE p.id = NEW.professor_id;

  SELECT count(*) INTO v_qtd
    FROM professor_alunos_kms WHERE professor_id = NEW.professor_id;

  SELECT count(*) INTO v_pedidos
    FROM transferencias_aluno WHERE professor_id = NEW.professor_id;

  NEW.snapshot := jsonb_build_object(
    'capturado_em',            NOW(),
    -- aluno (vínculo com ESTE professor, no momento do pedido)
    'aluno_encontrado',        v_aluno.aluno_id IS NOT NULL,
    'aluno_primeiro_nome',     v_aluno.primeiro_nome,
    'aluno_data_adicao',       v_aluno.data_adicao,
    'aluno_dias_com_professor',
        CASE WHEN v_aluno.data_adicao IS NOT NULL
             THEN (CURRENT_DATE - v_aluno.data_adicao) END,
    'aluno_data_matricula_escola', v_aluno.data_matricula_escola,
    'aluno_status',            v_aluno.status_aluno,
    'aluno_status_vinculo',    COALESCE(v_aluno.status_vinculo_codigo, v_aluno.status_vinculo),
    'aluno_tipo_vinculo',      v_aluno.tipo_vinculo,
    'aluno_saidas_historicas', v_saidas,
    -- professor (contexto de quem pede)
    'professor_nome',          v_prof.nome,
    'professor_status',        v_prof.status,
    'professor_data_inicio',   v_prof.data_inicio,
    'professor_grupo',         v_prof.grupo_nome,
    'professor_coordenador',   v_prof.coordenador_nome,
    'professor_score',         v_prof.score_atual,
    'professor_score_faixa',   v_prof.score_faixa,
    'professor_qtd_alunos',    v_qtd,
    'professor_pedidos_antes', v_pedidos
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_transferencia ON transferencias_aluno;
CREATE TRIGGER trg_snapshot_transferencia
  BEFORE INSERT ON transferencias_aluno
  FOR EACH ROW EXECUTE FUNCTION capturar_snapshot_transferencia();

-- ── 6. Registro no perfil do professor (trigger AFTER INSERT) ────────────────

/**
 * Cria a observação no perfil assim que o pedido chega — em aberto.
 *
 * O pedido de transferência é informação sobre o PROFESSOR, não só sobre o
 * aluno: a coordenação precisa ver na linha do tempo dele que houve o pedido,
 * mesmo que a transferência acabe não acontecendo. Por isso nasce aqui, e não
 * na conclusão.
 *
 * Autor: o coordenador do professor (o pedido vem do portal, sem usuário
 * logado) — mesma escolha de ativar_pausa(), com a mesma reserva de
 * cobrar_fim_pausas(): professor sem coordenador cai num admin ativo, porque
 * `observacoes.coordenador_id` não é campo pra deixar solto.
 *
 * O bloco EXCEPTION é deliberado: se a observação falhar por qualquer motivo,
 * o PEDIDO não pode ser perdido junto — ele é o que o professor mandou e é o
 * que a fila do suporte consome. O registro no perfil sobrevive de qualquer
 * forma, porque a seção do perfil lê `transferencias_aluno` direto; a
 * observação é a entrada na linha do tempo, não a fonte da verdade.
 */
CREATE OR REPLACE FUNCTION registrar_observacao_transferencia()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_autor UUID;
  v_obs   UUID;
BEGIN
  SELECT COALESCE(
           pr.coordenador_id,
           (SELECT id FROM profiles
             WHERE (is_admin OR role = 'admin') AND ativo
             ORDER BY created_at LIMIT 1)
         )
    INTO v_autor
    FROM professores pr WHERE pr.id = NEW.professor_id;

  BEGIN
    INSERT INTO observacoes (professor_id, coordenador_id, tipo, texto)
    VALUES (
      NEW.professor_id,
      v_autor,
      'ocorrencia',
      'Solicitou transferência do aluno ' || NEW.aluno_nome ||
      '. Motivo: ' || NEW.motivo ||
      CASE WHEN NEW.urgencia = 'alta' THEN ' (urgente)' ELSE '' END ||
      '. Relato: ' || NEW.detalhe
    )
    RETURNING id INTO v_obs;

    UPDATE transferencias_aluno SET observacao_id = v_obs WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Transferência %: observação no perfil falhou (%). O pedido foi mantido.',
      NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_observacao_transferencia ON transferencias_aluno;
CREATE TRIGGER trg_observacao_transferencia
  AFTER INSERT ON transferencias_aluno
  FOR EACH ROW EXECUTE FUNCTION registrar_observacao_transferencia();

-- ── 7. Ações da fila ─────────────────────────────────────────────────────────

/** Assume o pedido (pendente → em_atendimento). Falha se já tem dono — é o que
 *  impede duas pessoas atenderem o mesmo pedido. */
CREATE OR REPLACE FUNCTION assumir_transferencia(p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dono UUID;
BEGIN
  IF NOT pode_gerir_transferencia() THEN
    RAISE EXCEPTION 'Sem permissão para assumir pedidos de transferência.';
  END IF;

  SELECT assumido_por INTO v_dono
    FROM transferencias_aluno WHERE id = p_id AND status = 'pendente' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não está pendente.';
  END IF;
  IF v_dono IS NOT NULL THEN
    RAISE EXCEPTION 'Pedido já assumido por outra pessoa.';
  END IF;

  UPDATE transferencias_aluno
     SET status = 'em_atendimento', assumido_por = auth.uid(), assumido_em = NOW()
   WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION assumir_transferencia(UUID) TO authenticated;

/** Devolve o pedido para a fila (em_atendimento → pendente). */
CREATE OR REPLACE FUNCTION largar_transferencia(p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pode_gerir_transferencia() THEN
    RAISE EXCEPTION 'Sem permissão para alterar pedidos de transferência.';
  END IF;

  UPDATE transferencias_aluno
     SET status = 'pendente', assumido_por = NULL, assumido_em = NULL
   WHERE id = p_id AND status = 'em_atendimento';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não está em atendimento.';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION largar_transferencia(UUID) TO authenticated;

/**
 * Conclui o pedido com o desfecho real. A transferência em si já foi feita (ou
 * não) na plataforma do King — aqui só registramos o que aconteceu.
 *
 * Complementa a observação criada no pedido e a fecha: o registro no perfil
 * passa a contar a história inteira numa linha só, em vez de virar duas
 * entradas soltas.
 */
CREATE OR REPLACE FUNCTION concluir_transferencia(
  p_id       UUID,
  p_desfecho TEXT,
  p_destino  UUID DEFAULT NULL,
  p_nota     TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_obs     UUID;
  v_destino TEXT;
BEGIN
  IF NOT pode_gerir_transferencia() THEN
    RAISE EXCEPTION 'Sem permissão para concluir pedidos de transferência.';
  END IF;

  IF p_desfecho IS NULL OR p_desfecho NOT IN ('transferido', 'mantido', 'saiu_da_escola', 'outro') THEN
    RAISE EXCEPTION 'Desfecho inválido.';
  END IF;

  SELECT observacao_id INTO v_obs
    FROM transferencias_aluno
   WHERE id = p_id AND status IN ('pendente', 'em_atendimento') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido já finalizado.';
  END IF;

  UPDATE transferencias_aluno
     SET status               = 'concluida',
         desfecho             = p_desfecho,
         desfecho_nota        = NULLIF(btrim(COALESCE(p_nota, '')), ''),
         destino_professor_id = p_destino,
         concluido_por        = auth.uid(),
         concluido_em         = NOW()
   WHERE id = p_id;

  SELECT nome INTO v_destino FROM professores WHERE id = p_destino;

  IF v_obs IS NOT NULL THEN
    UPDATE observacoes
       SET texto = texto || E'\n\n[Desfecho] ' ||
             CASE p_desfecho
               WHEN 'transferido'    THEN 'Aluno transferido' ||
                                          COALESCE(' para ' || v_destino, '') || '.'
               WHEN 'mantido'        THEN 'Aluno mantido com o professor.'
               WHEN 'saiu_da_escola' THEN 'Aluno saiu da escola.'
               ELSE 'Outro.'
             END ||
             COALESCE(' ' || NULLIF(btrim(COALESCE(p_nota, '')), ''), ''),
           resolvido = true,
           resolvido_em = NOW()
     WHERE id = v_obs;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION concluir_transferencia(UUID, TEXT, UUID, TEXT) TO authenticated;

/** Recusa o pedido — sai da fila sem transferir ninguém. O registro no perfil
 *  do professor permanece (o pedido existiu), fechado com o motivo. */
CREATE OR REPLACE FUNCTION recusar_transferencia(p_id UUID, p_motivo TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_obs UUID;
BEGIN
  IF NOT pode_gerir_transferencia() THEN
    RAISE EXCEPTION 'Sem permissão para recusar pedidos de transferência.';
  END IF;

  SELECT observacao_id INTO v_obs
    FROM transferencias_aluno
   WHERE id = p_id AND status IN ('pendente', 'em_atendimento') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido já finalizado.';
  END IF;

  UPDATE transferencias_aluno
     SET status = 'recusada', recusado_por = auth.uid(), recusado_em = NOW(),
         motivo_recusa = NULLIF(btrim(COALESCE(p_motivo, '')), '')
   WHERE id = p_id;

  IF v_obs IS NOT NULL THEN
    UPDATE observacoes
       SET texto = texto || E'\n\n[Desfecho] Pedido recusado.' ||
                   COALESCE(' ' || NULLIF(btrim(COALESCE(p_motivo, '')), ''), ''),
           resolvido = true,
           resolvido_em = NOW()
     WHERE id = v_obs;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION recusar_transferencia(UUID, TEXT) TO authenticated;

-- ── 8. Dossiê do aluno (uma chamada só) ──────────────────────────────────────

/**
 * Tudo que sabemos sobre o aluno de um pedido, em UM round-trip.
 *
 * Deliberadamente uma função só, e não N queries no front: o painel de
 * professores já mostrou que Promise.all de várias queries quebra inteiro
 * quando UMA coluna some do schema. Aqui, se uma fonte estiver vazia, as outras
 * continuam aparecendo.
 *
 * Fontes:
 *   vinculo    → roster atual (some quando a transferência é efetivada; por isso
 *                a tela cai no snapshot quando isto vier nulo)
 *   saidas     → professor_ciclo_vida_alunos, TODAS as saídas deste aluno, de
 *                qualquer professor — é o histórico de quantas vezes ele já trocou
 *   pedidos    → outros pedidos de transferência do mesmo aluno
 *   ocorrencias→ incidentes que citam o aluno pelo nome. Match APROXIMADO (o
 *                Nexus guarda nome livre e o roster só o primeiro nome), por isso
 *                vem marcado como aproximado na UI.
 *   professor  → carteira e histórico de pedidos de quem está pedindo
 */
CREATE OR REPLACE FUNCTION transferencia_dossie(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t    transferencias_aluno%ROWTYPE;
  v_nome TEXT;
  v_res  JSONB;
BEGIN
  SELECT * INTO v_t FROM transferencias_aluno WHERE id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Nome pra casar com os incidentes: o primeiro nome do roster é mais confiável
  -- que o texto digitado, mas serve o que houver.
  v_nome := norm_nome(COALESCE(v_t.snapshot->>'aluno_primeiro_nome', v_t.aluno_nome));

  SELECT jsonb_build_object(
    'vinculo', (
      SELECT to_jsonb(k) FROM (
        SELECT aluno_id, primeiro_nome, data_adicao, data_matricula_escola,
               status_aluno, status_vinculo_codigo, tipo_vinculo,
               (CURRENT_DATE - data_adicao) AS dias_com_professor
          FROM professor_alunos_kms
         WHERE professor_id = v_t.professor_id AND aluno_id = v_t.aluno_id
      ) k
    ),
    'saidas', COALESCE((
      SELECT jsonb_agg(s ORDER BY s.data_saida DESC) FROM (
        SELECT c.data_saida, c.motivo_saida, c.saiu_da_escola,
               c.data_inicio_aulas, p.nome AS professor_nome
          FROM professor_ciclo_vida_alunos c
          LEFT JOIN professores p ON p.id = c.professor_id
         WHERE v_t.aluno_id IS NOT NULL AND c.aluno_id = v_t.aluno_id
         ORDER BY c.data_saida DESC LIMIT 20
      ) s
    ), '[]'::jsonb),
    'pedidos_anteriores', COALESCE((
      SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
        SELECT t.id, t.created_at, t.motivo, t.status, t.desfecho,
               p.nome AS professor_nome
          FROM transferencias_aluno t
          LEFT JOIN professores p ON p.id = t.professor_id
         WHERE v_t.aluno_id IS NOT NULL
           AND t.aluno_id = v_t.aluno_id
           AND t.id <> v_t.id
         ORDER BY t.created_at DESC LIMIT 20
      ) x
    ), '[]'::jsonb),
    'ocorrencias', COALESCE((
      SELECT jsonb_agg(o ORDER BY o.created_at DESC) FROM (
        SELECT i.id, i.created_at, i.problem_type, i.urgency, i.description,
               i.resolved, i.aluno_nome
          FROM nexus_incidents i
         WHERE i.professor_id = v_t.professor_id
           AND i.aluno_nome IS NOT NULL
           AND length(v_nome) >= 3
           AND norm_nome(i.aluno_nome) LIKE v_nome || '%'
         ORDER BY i.created_at DESC LIMIT 20
      ) o
    ), '[]'::jsonb),
    'professor', (
      SELECT jsonb_build_object(
        'qtd_alunos',      (SELECT count(*) FROM professor_alunos_kms WHERE professor_id = v_t.professor_id),
        'pedidos_total',   (SELECT count(*) FROM transferencias_aluno WHERE professor_id = v_t.professor_id),
        'pedidos_90d',     (SELECT count(*) FROM transferencias_aluno
                             WHERE professor_id = v_t.professor_id
                               AND created_at >= NOW() - INTERVAL '90 days'),
        'saidas_90d',      (SELECT count(*) FROM professor_ciclo_vida_alunos
                             WHERE professor_id = v_t.professor_id
                               AND data_saida >= CURRENT_DATE - 90)
      )
    )
  ) INTO v_res;

  RETURN v_res;
END;
$$;
GRANT EXECUTE ON FUNCTION transferencia_dossie(UUID) TO authenticated;
