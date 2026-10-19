-- ─────────────────────────────────────────────────────────────────────────────
-- kms-api-sync em partes (2026-10-19)
--
-- Desde 11/10 a rodada única do kms-api-sync morria com WORKER_RESOURCE_LIMIT na
-- página 7–8 de 11. Como a API ordena por professor_id crescente, quem ficava de
-- fora era justamente o fim da lista: os professores mais NOVOS. E o cron seguia
-- marcando "succeeded", porque o pg_net só registra o disparo.
--
-- A rodada agora é uma sequência de chamadas curtas, cada uma com o próprio
-- orçamento de processamento, e o ponto de parada fica guardado aqui:
--
--   • ativos      — de hora em hora (king-kms-api-sync, body {}): passo dos
--                   novos → páginas status=ativo → consulta individual de quem
--                   sumiu dos ativos → reconciliação de ausentes.
--   • desligados  — terça e sexta, 03:30 de Brasília (king-kms-api-sync-desligados).
--   • vigia       — a cada 10 min retoma rodada que parou de responder
--                   (king-kms-sync-vigia). Só chama a função quando há o que
--                   retomar; no resto do tempo é uma consulta SQL e nada mais.
--
-- Os dois jobs novos copiam URL e Authorization do job king-kms-api-sync que já
-- está no banco — nenhum segredo entra no repositório.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kms_sync_rodadas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                TEXT NOT NULL CHECK (tipo IN ('ativos', 'desligados')),
  completa            BOOLEAN NOT NULL DEFAULT true,
  status              TEXT NOT NULL DEFAULT 'rodando'
                        CHECK (status IN ('rodando', 'concluida', 'falhou', 'interrompida')),
  iniciada_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminada_em        TIMESTAMPTZ,
  ultima_atividade_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Chamada que está com a rodada agora. Uma retomada troca o dono, e a chamada
  -- antiga (se ainda estiver viva) para na próxima página ao ver que perdeu.
  dono                UUID,
  cursor              TEXT,
  varredura_completa  BOOLEAN NOT NULL DEFAULT false,
  chamadas            INT NOT NULL DEFAULT 0,
  retomadas           INT NOT NULL DEFAULT 0,
  paginas             INT NOT NULL DEFAULT 0,
  recebidos           INT NOT NULL DEFAULT 0,
  criados             INT NOT NULL DEFAULT 0,
  atualizados         INT NOT NULL DEFAULT 0,
  novos_kms_ids       INT[] NOT NULL DEFAULT '{}',
  sumidos_consultados INT NOT NULL DEFAULT 0,
  sumidos_achados     INT NOT NULL DEFAULT 0,
  sumidos_desligados  INT NOT NULL DEFAULT 0,
  linhas_ciclo        INT NOT NULL DEFAULT 0,
  linhas_score        INT NOT NULL DEFAULT 0,
  cobertura           NUMERIC(5, 4),
  reconciliacao       TEXT,
  erros               JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE kms_sync_rodadas IS
  'Uma linha por rodada do kms-api-sync (ativos de hora em hora, desligados terça e sexta). Guarda o cursor entre as chamadas e é a fonte do aviso de sync parado.';
COMMENT ON COLUMN kms_sync_rodadas.iniciada_em IS
  'Também é o carimbo visto_na_api_em de todos os professores que a rodada gravou — o mesmo instante em todas as chamadas.';
COMMENT ON COLUMN kms_sync_rodadas.novos_kms_ids IS
  'professor_id achados pelo passo dos novos (IDs acima do maior kms_id que já tínhamos), gravados antes de qualquer página.';
COMMENT ON COLUMN kms_sync_rodadas.completa IS
  'false = rodada leve (de hora em hora): para quem já está no KTM, grava só as saídas de aluno dos últimos 45 dias e o score dos últimos 2 meses — o resto do histórico não muda e era regravado toda hora. true = grava tudo: desligados, a rodada de ativos das 03:00 de Brasília e a primeira depois de 26 h sem uma completa.';
COMMENT ON COLUMN kms_sync_rodadas.linhas_ciclo IS
  'Linhas de professor_ciclo_vida_alunos enviadas na rodada (mede o efeito da rodada leve).';
COMMENT ON COLUMN kms_sync_rodadas.sumidos_consultados IS
  'Ativos/pausados no KTM que não vieram nas páginas da rodada e foram consultados um a um pela API.';

CREATE INDEX IF NOT EXISTS idx_kms_sync_rodadas_tipo_inicio
  ON kms_sync_rodadas (tipo, iniciada_em DESC);
CREATE INDEX IF NOT EXISTS idx_kms_sync_rodadas_rodando
  ON kms_sync_rodadas (ultima_atividade_em) WHERE status = 'rodando';

ALTER TABLE kms_sync_rodadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kms_sync_rodadas FROM anon;

-- Leitura para quem está logado (o aviso de sync parado vai ler daqui). Escrita
-- só pelo service_role, que ignora RLS.
DROP POLICY IF EXISTS "kms_sync_rodadas_select" ON kms_sync_rodadas;
CREATE POLICY "kms_sync_rodadas_select" ON kms_sync_rodadas FOR SELECT TO authenticated
  USING (true);


-- ── Passo dos novos: de onde começar a procurar ──────────────────────────────
-- kms_id é TEXT; o maior numérico não sai pelo REST sem trazer a coluna inteira.
CREATE OR REPLACE FUNCTION kms_maior_kms_id()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(kms_id::int) FROM professores WHERE kms_id ~ '^[0-9]{1,9}$';
$$;

REVOKE ALL ON FUNCTION kms_maior_kms_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION kms_maior_kms_id() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION kms_maior_kms_id() TO service_role;


-- ── Data de desligamento = a da King ─────────────────────────────────────────
-- O gatilho sync_professor_status carimba desligado_em com now() quando o status
-- vira 'desligado'. Com os desligados processados só terça e sexta, now() pode
-- ser dias depois da saída real e jogar a saída no mês errado do turnover. Aqui o
-- sync troca esse carimbo pela data de turnover.saida.data da API — mas só nas
-- transições DESTA rodada (desligado_em >= p_desde): desligamento antigo, ou
-- dado pela reconciliação de ausentes, não é tocado.
CREATE OR REPLACE FUNCTION kms_corrigir_data_desligamento(p_desde TIMESTAMPTZ, p_itens JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qtd INT;
BEGIN
  UPDATE professores p
     SET desligado_em = ((i->>'data_saida')::date + TIME '12:00') AT TIME ZONE 'America/Sao_Paulo'
    FROM jsonb_array_elements(p_itens) AS i
   WHERE p.kms_id = i->>'kms_id'
     AND p.status = 'desligado'
     AND p.desligado_em >= p_desde
     AND CASE WHEN (i->>'data_saida') ~ '^\d{4}-\d{2}-\d{2}$'
              THEN (i->>'data_saida')::date <= current_date
              ELSE false END;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  RETURN v_qtd;
END;
$$;

COMMENT ON FUNCTION kms_corrigir_data_desligamento(TIMESTAMPTZ, JSONB) IS
  'Troca o desligado_em carimbado agora pelo dia de saída informado pela King (meio-dia de Brasília). Só para desligamentos ocorridos desde p_desde. Só o kms-api-sync chama.';

REVOKE ALL ON FUNCTION kms_corrigir_data_desligamento(TIMESTAMPTZ, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION kms_corrigir_data_desligamento(TIMESTAMPTZ, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION kms_corrigir_data_desligamento(TIMESTAMPTZ, JSONB) TO service_role;


-- ── Vigia: qual rodada retomar ───────────────────────────────────────────────
-- Rodada 'rodando' sem sinal há 3 min morreu no meio (a cadeia de chamadas
-- quebrou). Devolve a mais recente para o cron retomar; depois de 3 retomadas
-- sem sucesso, desiste e marca 'falhou' — é o aviso que tem que pegar.
-- Aproveita a passada para apagar rodadas com mais de 30 dias.
CREATE OR REPLACE FUNCTION kms_sync_rodada_parada()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  DELETE FROM kms_sync_rodadas WHERE iniciada_em < now() - INTERVAL '30 days';

  UPDATE kms_sync_rodadas
     SET status       = 'falhou',
         terminada_em = now(),
         erros        = erros || jsonb_build_array(jsonb_build_object(
                          'pagina', paginas + 1,
                          'erro',   'parou de responder e não voltou (' || retomadas || ' retomada(s))'))
   WHERE status = 'rodando'
     AND ultima_atividade_em < now() - INTERVAL '3 minutes'
     AND (retomadas >= 3 OR iniciada_em < now() - INTERVAL '6 hours');

  SELECT id INTO v_id
    FROM kms_sync_rodadas
   WHERE status = 'rodando'
     AND ultima_atividade_em < now() - INTERVAL '3 minutes'
   ORDER BY iniciada_em DESC
   LIMIT 1;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION kms_sync_rodada_parada() FROM PUBLIC;
REVOKE ALL ON FUNCTION kms_sync_rodada_parada() FROM anon, authenticated;


-- ── Agendamentos ─────────────────────────────────────────────────────────────
-- king-kms-api-sync (0 * * * *, body {}) continua como está: body vazio = rodada
-- de ativos. Os dois novos derivam dele, trocando só o body.
DO $$
DECLARE
  v_cmd   TEXT;
  v_novo  TEXT;
BEGIN
  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'king-kms-api-sync';
  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'job king-kms-api-sync não existe — agende-o antes (20260703_cron_kms_api_sync.sql)';
  END IF;

  -- Desligados: terça e sexta, 06:30 UTC = 03:30 de Brasília. Longe do minuto 0,
  -- quando começa a rodada de ativos.
  v_novo := regexp_replace(v_cmd, '''\{\}''::jsonb', '''{"tipo":"desligados"}''::jsonb');
  IF v_novo = v_cmd THEN
    RAISE EXCEPTION 'comando de king-kms-api-sync fora do formato esperado (body ''{}''::jsonb)';
  END IF;
  PERFORM cron.unschedule('king-kms-api-sync-desligados')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-kms-api-sync-desligados');
  PERFORM cron.schedule('king-kms-api-sync-desligados', '30 6 * * 2,5', v_novo);

  -- Vigia: minutos 5, 15, …, 55 — nunca no minuto 0, para não disputar com a
  -- rodada nova (que marca a anterior como 'interrompida').
  v_novo := regexp_replace(
    v_cmd,
    '''\{\}''::jsonb\s*\)\s*AS request_id\s*;?',
    'jsonb_build_object(''retomar'', r.id) ) AS request_id FROM public.kms_sync_rodada_parada() AS r(id) WHERE r.id IS NOT NULL;'
  );
  IF v_novo = v_cmd THEN
    RAISE EXCEPTION 'comando de king-kms-api-sync fora do formato esperado (fim "AS request_id;")';
  END IF;
  PERFORM cron.unschedule('king-kms-sync-vigia')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-kms-sync-vigia');
  PERFORM cron.schedule('king-kms-sync-vigia', '5-55/10 * * * *', v_novo);
END;
$$;
