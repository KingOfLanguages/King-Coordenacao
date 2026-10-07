-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoria das funções SECURITY DEFINER (pentest 05/10/2026, item 14).
--
-- O Supabase concede EXECUTE a `anon` e `authenticated` em toda função nova do
-- schema public — e `REVOKE ... FROM PUBLIC` não tira essas concessões, que são
-- diretas. Resultado: 68 das 73 funções que rodam como dono (ignoram a RLS)
-- aceitavam chamada com a chave pública do bundle. As que conferem o cargo
-- (pode_gerir_*, sou_admin…) barravam o anônimo por dentro; estas não:
--
--   criar_reuniao_grupo      criava reunião e vínculos com o que viesse
--   confirmar_reuniao_grupo  marcava presença/cancelava participantes
--   ativar_pausa             punha qualquer professor em pausa
--   transferencia_dossie     devolvia histórico de aluno
--   jobs do cron             qualquer um disparava notificações/varreduras
--
-- Regras daqui pra frente:
--   1. Função de cron, de edge function (service_role) ou de gatilho: ninguém
--      de fora executa.
--   2. Toda função de ação: `anon` não executa. Os ajudantes de RLS
--      (minha_role, sou_admin, pode_*…) ficam, porque só falam do próprio
--      usuário e a policy precisa deles para responder "vazio" em vez de erro.
--   3. Funções novas no public não nascem mais executáveis por `anon`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Só o servidor (cron, service_role, gatilhos) ─────────────────────────
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
       AND (
         p.prorettype = 'trigger'::regtype
         OR p.proname IN (
           'ativar_pausa', 'ativar_pausas_do_dia', 'cobrar_fim_pausas',
           'notificar_incidentes_prazo', 'notificar_transferencias_atrasadas',
           'rodar_deteccao_silencio', 'portal_limpeza', 'wp_limpar_sessoes',
           'criar_reuniao_grupo', 'gerar_contatos_dia_batch',
           'reconciliar_professores_ausentes', 'wp_recalcular_etapa'
         )
       )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
  END LOOP;
END
$do$;

-- ── 2. Ações: só usuário logado (a função confere o cargo por dentro) ────────
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
       AND p.prorettype <> 'trigger'::regtype
       AND p.proname NOT IN (
         -- ajudantes de RLS: respondem sobre o próprio usuário
         'minha_role', 'sou_admin', 'sou_admin_tarefa', 'sou_lider',
         'meu_time_tarefa', 'lideranca_coordenacao', 'lideranca_suporte_aluno',
         'pode_encerrar_pausa', 'pode_escrever_projeto', 'pode_gerir_pausa',
         'pode_gerir_transferencia', 'pode_gerir_welcome_path'
       )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.fn);
  END LOOP;
END
$do$;

-- ── 3. Funções novas não nascem abertas ao anônimo ───────────────────────────
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- ── 4. Guardas que faltavam ──────────────────────────────────────────────────
-- confirmar_reuniao_grupo: chamada pela tela de Reuniões e pela extensão do
-- Meet, sempre por quem opera reuniões.
CREATE OR REPLACE FUNCTION public.confirmar_reuniao_grupo(p_reuniao_id uuid, p_presentes uuid[], p_observacao text, p_confirmado_por uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rp        RECORD;
  v_numero    INT;
  v_agora     TIMESTAMPTZ := NOW();
BEGIN
  IF NOT (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role IN ('admin', 'coordenacao', 'suporte') OR is_admin OR is_lider))) THEN
    RAISE EXCEPTION 'Sem permissão para confirmar reuniões.';
  END IF;

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
$function$;

-- transferencia_dossie: mesmo público da fila de transferências.
CREATE OR REPLACE FUNCTION public.transferencia_dossie(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t    transferencias_aluno%ROWTYPE;
  v_nome TEXT;
  v_res  JSONB;
BEGIN
  IF NOT (pode_gerir_transferencia()) THEN
    RAISE EXCEPTION 'Sem permissão para ver o dossiê da transferência.';
  END IF;

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
$function$;

-- ── 5. search_path fixo nos dois gatilhos DEFINER que não tinham ────────────
ALTER FUNCTION public.concluir_tarefa_ao_resolver_incidente() SET search_path = public;
ALTER FUNCTION public.criar_tarefa_ao_assumir_incidente() SET search_path = public;
